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
"""

import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(os.environ.get("SOLUTION_ROOT") or Path(__file__).resolve().parents[2] / "solution")
ENTITY_COMPONENT_TYPE = "1"

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
    bound: bool = True,
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

    # An example flow is not part of the solution, so nothing in the solution declares what it
    # binds to. Everything above still holds for it: those are mistakes in the flow itself.
    if not bound:
        return

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


def check_column_table(lengths: dict[str, str]) -> None:
    """The column table in solution/README.md is meant to be copied from, so it has to be right.

    Written by hand it was wrong in five of fourteen rows on the first try — a length is exactly
    the kind of detail nobody re-reads. Held against Entity.xml it cannot drift.
    """
    doc = ROOT / "README.md"
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


def main() -> None:
    for xml in sorted(ROOT.rglob("*.xml")):
        try:
            ET.parse(xml)
        except ET.ParseError as error:
            fail(f"{xml.relative_to(ROOT)} is not well-formed XML: {error}")

    solution = ET.parse(ROOT / "src/Other/Solution.xml").getroot()
    declared = {
        component.get("schemaName", "").lower()
        for component in solution.iter("RootComponent")
        if component.get("type") == ENTITY_COMPONENT_TYPE
    }

    columns: set[str] = set()
    tables: set[str] = set()
    sets: set[str] = set()
    lengths: dict[str, str] = {}

    folders = {path.name for path in (ROOT / "src/Entities").iterdir() if path.is_dir()}
    for folder in sorted(folders):
        entity = ROOT / "src/Entities" / folder / "Entity.xml"
        if not entity.is_file():
            fail(f"Entities/{folder} has no Entity.xml")

        root = ET.parse(entity).getroot()
        described = root.find("./EntityInfo/entity")
        logical = (described.get("Name") if described is not None else root.findtext("Name") or "").lower()
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
        if (ROOT / "src/Entities" / folder / "RibbonDiff.xml").is_file():
            fail(f"Entities/{folder}/RibbonDiff.xml — the packer cannot read a hand-written one; leave it out")

        # A SavedQueries folder is read by nothing: the packer takes views from <SavedQueries>
        # inside Entity.xml, packs without a word, and ships a table with no view at all. That
        # cost a release, so a folder here is refused rather than ignored a second time.
        if (ROOT / "src/Entities" / folder / "SavedQueries").is_dir():
            fail(
                f"Entities/{folder}/SavedQueries — the packer never reads this folder; "
                "the views belong in <SavedQueries> inside Entity.xml"
            )

    for orphan in sorted(declared):
        fail(f"Solution.xml claims the table '{orphan}', but src/Entities has no folder for it")

    customizations = ET.parse(ROOT / "src/Other/Customizations.xml").getroot()
    entities = customizations.find("Entities")
    if entities is not None and len(entities) > 0:
        fail("src/Other/Customizations.xml must keep <Entities /> childless — the packer drops the folder otherwise")

    # A flow described inside <Workflows> is a mistake SolutionPackager answers with a line in its
    # log and nothing else: "has unexpected children in Customizations.xml; this component's
    # specific processing will be skipped". The build stays green and the package comes out
    # without the component. It cost a whole round to find, so it is refused here.
    #
    # A modern cloud flow cannot be packed from this format at all — it is supported only in the
    # YAML source control format, under modernflows/. See solution/README.md.
    if customizations.findall("./Workflows/Workflow"):
        fail(
            "src/Other/Customizations.xml describes a flow inside <Workflows> — SolutionPackager "
            "skips the whole component then and says so only in its log. A modern flow belongs in "
            "the YAML source format under modernflows/, not here"
        )

    # A flow is two things: the entry that names it and the definition it points at. A entry whose
    # file is missing packs without complaint and imports as a flow that does nothing.
    flows = customizations.findall("./Workflows/Workflow")
    for flow in flows:
        named = (flow.findtext("JsonFileName") or flow.findtext("XamlFileName") or "").lstrip("/")
        if not named:
            fail(f"the flow '{flow.get('Name')}' names no definition file")
        if not (ROOT / "src" / named).is_file():
            fail(f"the flow '{flow.get('Name')}' points at src/{named}, which is not there")

    references = customizations.findall("./connectionreferences/connectionreference")
    reference_names = {
        (reference.get("connectionreferencelogicalname") or "").lower() for reference in references
    }

    variables = sorted((ROOT / "src/environmentvariabledefinitions").glob("*/environmentvariabledefinition.xml"))
    for variable in variables:
        declared_name = ET.parse(variable).getroot().get("schemaname", "")
        if declared_name != variable.parent.name:
            fail(
                f"environmentvariabledefinitions/{variable.parent.name} declares the schema name "
                f"'{declared_name}' — the folder and the name have to match"
            )

    variable_names = {
        ET.parse(variable).getroot().get("schemaname", "") for variable in variables
    }

    prefix = (solution.findtext("./SolutionManifest/Publisher/CustomizationPrefix") or "").lower()
    if not prefix:
        fail("Solution.xml names no CustomizationPrefix")

    for flow in flows:
        named = (flow.findtext("JsonFileName") or "").lstrip("/")
        if named:
            check_flow(
                ROOT / "src" / named,
                flow.get("Name") or named,
                prefix=prefix,
                tables=tables,
                sets=sets,
                columns=columns,
                references=reference_names,
                variables=variable_names,
            )

    check_column_table(lengths)

    # The flow is not shipped — it is built by hand from the documentation. The definition the
    # documentation is written against stays here so its column names and expressions are held
    # against the table just the same; it is outside src/, so the packer never sees it.
    examples = sorted((ROOT / "examples").glob("*.json")) if (ROOT / "examples").is_dir() else []
    for example in examples:
        check_flow(
            example,
            f"examples/{example.name}",
            prefix=prefix,
            tables=tables,
            sets=sets,
            columns=columns,
            references=reference_names,
            variables=variable_names,
            bound=False,
        )

    print(
        f"solution source: {len(folders)} table(s) declared and present, "
        f"{len(flows)} flow(s), {len(examples)} example flow(s), "
        f"{len(references)} connection reference(s), {len(variables)} environment variable(s), "
        "XML well-formed"
    )


if __name__ == "__main__":
    main()
