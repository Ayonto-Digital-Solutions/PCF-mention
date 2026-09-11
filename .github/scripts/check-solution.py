#!/usr/bin/env python3
"""Checks the solution source for the mistakes SolutionPackager does not complain about.

The packer is happy with an entity folder that no RootComponent mentions: it packs, the import
succeeds, and the table is simply not there. That failure has no error message anywhere, which
is exactly why it is worth a check of its own.

A flow definition is the same kind of silence one level down. Dataverse answers a column that
does not exist with null rather than an error, so a mistyped logical name in a flow costs a
recipient, not a run: the flow goes green and the mail goes nowhere. Nothing in the platform
catches that, so the column names a flow reads are held against the columns the tables actually
declare.

Usage: check-solution.py [<solution-dir> ...]   (default: the one named by SOLUTION_ROOT, else
"solution"). Several may be given, and they are then read as one: the notification flow ships in
its own optional package while the table it reads belongs to the main one, so checking either
alone would call every column of that flow unknown.
"""

import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ENTITY_COMPONENT_TYPE = "1"
WORKFLOW_COMPONENT_TYPE = "29"

# "body/ayonto_useremail", "item/ayonto_deliverystatus" — how a flow names a column. The
# publisher prefix keeps the search to this solution's own columns: "body/recipient" belongs to a
# connector, not to Dataverse, and is none of this check's business.
COLUMN_TOKEN = "(?:body|item)/({prefix}_[a-z0-9_]+)"


def fail(message: str) -> None:
    print(f"solution source: {message}", file=sys.stderr)
    sys.exit(1)


def check_flow(
    path: Path,
    name: str,
    *,
    prefix: str,
    tables: set[str],
    sets: set[str],
    columns: set[str],
    references: set[str],
    variables: set[str],
) -> None:
    """Holds a flow definition against the tables, references and variables around it.

    Every mistake refused here is one the platform answers with silence rather than an error:
    a column that does not exist reads as null, a table name that does not exist makes a trigger
    that never fires, and a connection reference the solution does not carry is only noticed by
    whoever imports it.
    """
    try:
        definition = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"the flow '{name}' is not valid JSON: {error}")

    text = json.dumps(definition, ensure_ascii=False)

    # trigger() is the run, triggerOutputs() is the row. The first one silently yields nothing
    # for a body path, so a subject or recipient read that way is always empty.
    if "trigger()?['body/" in text or 'trigger()?["body/' in text:
        fail(
            f"the flow '{name}' reads a column through trigger() — that returns the run, not the "
            "row, and the value is always empty; it has to be triggerOutputs()"
        )

    for column in sorted(set(re.findall(COLUMN_TOKEN.format(prefix=re.escape(prefix)), text))):
        if column.split("@")[0] not in columns:
            fail(
                f"the flow '{name}' reads the column '{column}', which no table in this solution "
                f"declares — Dataverse answers it with null, so the flow would run and do nothing"
            )

    triggers = definition.get("properties", {}).get("definition", {}).get("triggers", {})
    for trigger in triggers.values():
        parameters = (trigger.get("inputs") or {}).get("parameters") or {}
        table = str(parameters.get("subscriptionRequest/entityname", "")).lower()
        if table and table not in tables:
            fail(f"the flow '{name}' triggers on the table '{table}', which this solution does not carry")

    for entity_set in sorted(set(re.findall(r'"entityName":\s*"([a-z0-9_]+)"', text))):
        if entity_set.startswith(f"{prefix}_") and entity_set not in sets:
            fail(
                f"the flow '{name}' writes to '{entity_set}', which is no table's EntitySetName — "
                "these actions take the plural set name, not the logical name"
            )

    # outputs('X') and result('X') name another action. Misspell one and the designer shows
    # nothing wrong; at run time the expression resolves to null and the value it was meant to
    # carry — here, the link to the record — quietly disappears from the message.
    named: set[str] = set()

    def collect(actions: dict) -> None:
        for action_name, action in actions.items():
            named.add(action_name)
            if not isinstance(action, dict):
                continue
            # A scope holds its actions directly; a condition holds them under else as well, and a
            # switch under each case and under default. An action that lives only in a branch is
            # still an action other expressions may name.
            branches = [action.get("actions"), (action.get("else") or {}).get("actions")]
            branches += [(case or {}).get("actions") for case in (action.get("cases") or {}).values()]
            branches.append((action.get("default") or {}).get("actions"))
            for branch in branches:
                if isinstance(branch, dict):
                    collect(branch)

    collect(definition.get("properties", {}).get("definition", {}).get("actions", {}))
    for referenced in sorted(set(re.findall(r"(?:outputs|result|body)\('([^']+)'\)", text))):
        if referenced.replace("_", " ") not in {known.replace("_", " ") for known in named}:
            fail(
                f"the flow '{name}' reads {referenced!r}, which is no action in it — "
                "the expression resolves to null and whatever it carried is silently gone"
            )

    for reference in sorted(set(re.findall(r'"connectionReferenceLogicalName":\s*"([^"]+)"', text))):
        if reference.lower() not in references:
            fail(
                f"the flow '{name}' binds the connection reference '{reference}', which "
                "Customizations.xml does not declare — the import would leave it unbound"
            )

    for schema in sorted(set(re.findall(r'"schemaName":\s*"([^"]+)"', text))):
        if schema not in variables:
            fail(
                f"the flow '{name}' reads the environment variable '{schema}', which this "
                "solution does not define"
            )


def check_column_table(doc: Path, lengths: dict[str, str]) -> None:
    """The column table in solution/README.md is meant to be copied from, so it has to be right.

    Written by hand it was wrong in five of fourteen rows on the first try — a length is exactly
    the kind of detail nobody re-reads. Held against Entity.xml it cannot drift.
    """
    if not doc.is_file():
        return

    for line in doc.read_text(encoding="utf-8").splitlines():
        if not line.startswith("| `") or line.count("|") != 5:
            continue
        cells = [cell.strip() for cell in line.split("|")[1:-1]]
        column = cells[0].strip("`")
        if column not in lengths:
            continue
        declared_length = lengths[column] or ""
        if cells[2] != declared_length:
            fail(
                f"README.md gives '{column}' the length {cells[2] or '(none)'}, "
                f"but Entity.xml declares {declared_length or '(none)'}"
            )


def read_root(root: Path) -> dict:
    """Reads one solution source: its tables, its flows and what they may bind to."""
    for xml in sorted(root.rglob("*.xml")):
        try:
            ET.parse(xml)
        except ET.ParseError as error:
            fail(f"{xml.relative_to(root)} is not well-formed XML: {error}")

    solution = ET.parse(root / "src/Other/Solution.xml").getroot()
    declared = {
        component.get("schemaName", "").lower()
        for component in solution.iter("RootComponent")
        if component.get("type") == ENTITY_COMPONENT_TYPE
    }

    columns: set[str] = set()
    tables: set[str] = set()
    sets: set[str] = set()
    lengths: dict[str, str] = {}

    # A solution without tables is a normal thing — the flow package carries only a flow, and
    # the table it triggers on comes with the other one.
    entities = root / "src/Entities"
    folders = {path.name for path in entities.iterdir() if path.is_dir()} if entities.is_dir() else set()
    for folder in sorted(folders):
        entity = entities / folder / "Entity.xml"
        if not entity.is_file():
            fail(f"Entities/{folder} has no Entity.xml")

        entity_root = ET.parse(entity).getroot()
        described = entity_root.find("./EntityInfo/entity")
        logical = (described.get("Name") if described is not None else entity_root.findtext("Name") or "").lower()
        if not logical:
            fail(f"Entities/{folder}/Entity.xml has no entity name")
        if logical not in declared:
            fail(
                f"the table '{logical}' has no <RootComponent type=\"1\"> in Solution.xml — "
                "it would pack without ever being part of the solution"
            )
        declared.discard(logical)

        tables.add(logical)
        sets.add((described.findtext("EntitySetName") or "").lower())
        for attribute in described.findall("./attributes/attribute"):
            attribute_name = (attribute.findtext("Name") or "").lower()
            columns.add(attribute_name)
            lengths[attribute_name] = attribute.findtext("MaxLength") or ""

        # A hand-written RibbonDiff.xml made SolutionPackager throw a NullReferenceException
        # that named nothing but the entity it was processing. The file is optional, so it is
        # refused here rather than being rediscovered on a release tag.
        if (entities / folder / "RibbonDiff.xml").is_file():
            fail(f"Entities/{folder}/RibbonDiff.xml — the packer cannot read a hand-written one; leave it out")

        # A SavedQueries folder is read by nothing: the packer takes views from <SavedQueries>
        # inside Entity.xml, packs without a word, and ships a table with no view at all. That
        # cost a release, so a folder here is refused rather than ignored a second time.
        if (entities / folder / "SavedQueries").is_dir():
            fail(
                f"Entities/{folder}/SavedQueries — the packer never reads this folder; "
                "the views belong in <SavedQueries> inside Entity.xml"
            )

    for orphan in sorted(declared):
        fail(f"Solution.xml claims the table '{orphan}', but src/Entities has no folder for it")

    customizations = ET.parse(root / "src/Other/Customizations.xml").getroot()
    packed_entities = customizations.find("Entities")
    if packed_entities is not None and len(packed_entities) > 0:
        fail("src/Other/Customizations.xml must keep <Entities /> childless — the packer drops the folder otherwise")

    # A flow is two things: the entry that names it and the definition it points at. A entry whose
    # file is missing packs without complaint and imports as a flow that does nothing.
    flows = customizations.findall("./Workflows/Workflow")
    for flow in flows:
        named = (flow.findtext("JsonFileName") or flow.findtext("XamlFileName") or "").lstrip("/")
        if not named:
            fail(f"the flow '{flow.get('Name')}' names no definition file")
        if not (root / "src" / named).is_file():
            fail(f"the flow '{flow.get('Name')}' points at src/{named}, which is not there")

    # The id in Solution.xml, the id on the entry and the id in the file name are three places
    # the same GUID has to stand. Where they drift the packer says nothing and the import
    # carries a flow the solution does not actually list.
    listed = {
        (component.get("id") or "").strip("{}").lower()
        for component in solution.iter("RootComponent")
        if component.get("type") == WORKFLOW_COMPONENT_TYPE
    }
    for flow in flows:
        flow_id = (flow.get("WorkflowId") or "").strip("{}").lower()
        if flow_id not in listed:
            fail(
                f"the flow '{flow.get('Name')}' has the id {flow_id}, which no "
                '<RootComponent type="29"> in Solution.xml names'
            )
        listed.discard(flow_id)
        named = (flow.findtext("JsonFileName") or "").lstrip("/")
        if named and flow_id not in named.lower():
            fail(f"the flow '{flow.get('Name')}' is stored as {named}, which does not carry its id {flow_id}")
    for orphan in sorted(listed):
        fail(f'Solution.xml names a <RootComponent type="29"> {orphan}, but no flow in Customizations.xml has that id')

    references = customizations.findall("./connectionreferences/connectionreference")
    reference_names = {
        (reference.get("connectionreferencelogicalname") or "").lower() for reference in references
    }

    variables = sorted((root / "src/environmentvariabledefinitions").glob("*/environmentvariabledefinition.xml"))
    for variable in variables:
        declared_name = ET.parse(variable).getroot().get("schemaname", "")
        if declared_name != variable.parent.name:
            fail(
                f"environmentvariabledefinitions/{variable.parent.name} declares the schema name "
                f"'{declared_name}' — the folder and the name have to match"
            )

    prefix = (solution.findtext("./SolutionManifest/Publisher/CustomizationPrefix") or "").lower()
    if not prefix:
        fail(f"{root.name}/src/Other/Solution.xml names no CustomizationPrefix")

    return {
        "root": root,
        "folders": folders,
        "tables": tables,
        "sets": sets,
        "columns": columns,
        "lengths": lengths,
        "flows": flows,
        "references": reference_names,
        "variables": {ET.parse(variable).getroot().get("schemaname", "") for variable in variables},
        "variable_files": variables,
        "prefix": prefix,
    }


def main() -> None:
    named_roots = sys.argv[1:] or [os.environ.get("SOLUTION_ROOT") or "solution"]
    roots = [Path(name) if Path(name).is_absolute() else REPO / name for name in named_roots]
    for root in roots:
        if not (root / "src/Other/Solution.xml").is_file():
            fail(f"{root} has no src/Other/Solution.xml")

    read = [read_root(root) for root in roots]

    # The flow lives in one solution and the table it reads in another, so the column names are
    # held against every table these solutions bring between them. Checking each package on its
    # own would call every column of the flow unknown.
    tables = set().union(*(one["tables"] for one in read))
    sets = set().union(*(one["sets"] for one in read))
    columns = set().union(*(one["columns"] for one in read))
    lengths: dict[str, str] = {}
    for one in read:
        lengths.update(one["lengths"])

    flows = 0
    for one in read:
        for flow in one["flows"]:
            named = (flow.findtext("JsonFileName") or "").lstrip("/")
            if not named:
                continue
            flows += 1
            check_flow(
                one["root"] / "src" / named,
                flow.get("Name") or named,
                prefix=one["prefix"],
                tables=tables,
                sets=sets,
                columns=columns,
                references=one["references"],
                variables=one["variables"],
            )

    # Die Spaltentabelle steht in der Anleitung der Lösung, die die Tabelle mitbringt. Geprüft
    # wird die Datei der gerade gelesenen Quelle, nicht die im Repository — sonst liefe die
    # Gegenprobe in CI gegen den unveränderten Text und ginge durch.
    for one in read:
        readme = one["root"] / "README.md"
        if readme.is_file():
            check_column_table(readme, lengths)

    print(
        "solution source: "
        + "; ".join(
            f"{one['root'].name}: {len(one['folders'])} table(s), {len(one['flows'])} flow(s), "
            f"{len(one['references'])} connection reference(s), {len(one['variable_files'])} environment variable(s)"
            for one in read
        )
        + f"; {flows} flow definition(s) checked, XML well-formed"
    )


if __name__ == "__main__":
    main()
