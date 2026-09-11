#!/usr/bin/env python3
"""Checks that the packed solution carries what it is supposed to carry.

check-solution.py reads the source. That is not enough: SolutionPackager took a whole
SavedQueries folder, packed without a word, and shipped a table with no view — a release
nobody could tell was incomplete by looking at the build. So this reads the other end, the
.zip that is about to be published, and holds it against two things: what the source
declares, and the contract in .github/solution-contract.json.

Usage: check-package.py <solution.zip> [--contract <file>] [--expect-controls]
"""

import argparse
import json
import os
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(os.environ.get("SOLUTION_ROOT") or Path(__file__).resolve().parents[2] / "solution")
DEFAULT_CONTRACT = Path(__file__).resolve().parents[1] / "solution-contract.json"
ENTITY_COMPONENT_TYPE = "1"
CONTROL_COMPONENT_TYPE = "66"

problems: list[str] = []


def wrong(message: str) -> None:
    problems.append(message)


def declared_tables() -> dict[str, int]:
    """Every table the source describes, and how many views it gives it."""
    tables: dict[str, int] = {}
    for entity in sorted((ROOT / "src/Entities").glob("*/Entity.xml")):
        root = ET.parse(entity).getroot()
        described = root.find("./EntityInfo/entity")
        name = (described.get("Name") if described is not None else "").lower()
        if not name:
            wrong(f"{entity.relative_to(ROOT)} has no entity name")
            continue
        tables[name] = len(root.findall("./SavedQueries/savedqueries/savedquery"))
    return tables


def read_package(path: str) -> tuple[ET.Element, ET.Element, list[str]]:
    with zipfile.ZipFile(path) as package:
        names = package.namelist()
        if "customizations.xml" not in names or "solution.xml" not in names:
            print(f"packed solution: {path} is not a solution package: {names[:5]}", file=sys.stderr)
            sys.exit(1)
        customizations = ET.fromstring(package.read("customizations.xml").decode("utf-8-sig"))
        solution = ET.fromstring(package.read("solution.xml").decode("utf-8-sig"))
    return customizations, solution, names


def entity_name(entity: ET.Element) -> str:
    described = entity.find("./EntityInfo/entity")
    return (described.get("Name") if described is not None else entity.findtext("Name") or "").lower()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("package")
    parser.add_argument("--contract", default=str(DEFAULT_CONTRACT))
    parser.add_argument(
        "--expect-controls",
        action="store_true",
        help="require the code components; CI packs the solution on its own, without them",
    )
    args = parser.parse_args()

    contract = json.loads(Path(args.contract).read_text(encoding="utf-8"))
    customizations, solution, files = read_package(args.package)

    # --- the solution itself -------------------------------------------------
    manifest = solution.find("./SolutionManifest")
    if manifest is None:
        print("packed solution: solution.xml has no SolutionManifest", file=sys.stderr)
        sys.exit(1)

    unique = manifest.findtext("UniqueName") or ""
    if unique != contract["uniqueName"]:
        wrong(f"unique name is '{unique}', the contract says '{contract['uniqueName']}'")

    version = manifest.findtext("Version") or ""
    if version.count(".") != 3 or not all(part.isdigit() for part in version.split(".")):
        wrong(f"version '{version}' is not four numbers")

    publisher = manifest.find("./Publisher")
    if publisher is None:
        wrong("solution.xml names no publisher")
    else:
        expected = contract["publisher"]
        if (publisher.findtext("UniqueName") or "") != expected["uniqueName"]:
            wrong(f"publisher is '{publisher.findtext('UniqueName')}', expected '{expected['uniqueName']}'")
        if (publisher.findtext("CustomizationPrefix") or "") != expected["prefix"]:
            wrong(f"prefix is '{publisher.findtext('CustomizationPrefix')}', expected '{expected['prefix']}'")

    # --- tables, their columns and their views -------------------------------
    packed_tables = {entity_name(entity): entity for entity in customizations.iter("Entity")}

    for table, expected in contract["tables"].items():
        entity = packed_tables.get(table)
        if entity is None:
            wrong(f"the table '{table}' is not in the package")
            continue

        columns = {
            (attribute.findtext("Name") or attribute.get("PhysicalName") or "").lower()
            for attribute in entity.iter("attribute")
        }
        for column in expected["columns"]:
            if column.lower() not in columns:
                wrong(f"the table '{table}' is missing the column '{column}'")

        views = {
            (name.get("description") or "")
            for name in entity.findall("./SavedQueries/savedqueries/savedquery/LocalizedNames/LocalizedName")
        }
        for view in expected["views"]:
            if view not in views:
                wrong(f"the table '{table}' is missing the view '{view}' (packed: {sorted(views) or 'none'})")

    # what the source declares must arrive too, view for view
    for table, views in declared_tables().items():
        entity = packed_tables.get(table)
        if entity is None:
            wrong(f"the source describes the table '{table}', but it is not in the package")
            continue
        packed_views = len(entity.findall("./SavedQueries/savedqueries/savedquery"))
        if packed_views != views:
            wrong(
                f"the table '{table}' declares {views} view(s) and the package carries {packed_views} — "
                "the packer reads <SavedQueries> inside Entity.xml, not a SavedQueries folder"
            )

    # --- relationships -------------------------------------------------------
    packed_relationships = {
        (relationship.get("Name") or "").lower() for relationship in customizations.iter("EntityRelationship")
    }
    for relationship in contract["relationships"]:
        if relationship.lower() not in packed_relationships:
            wrong(f"the relationship '{relationship}' is not in the package")

    # --- code components -----------------------------------------------------
    # The name is a child element here, not an attribute; reading it as one made every control
    # look missing, which would have stopped the release this check exists to protect.
    controls = {
        (control.findtext("Name") or control.get("Name") or "").lower()
        for control in customizations.iter("CustomControl")
    }
    if args.expect_controls:
        for control in contract["controls"]:
            if control.lower() not in controls:
                wrong(f"the code component '{control}' is not in the package")

    for component in solution.iter("RootComponent"):
        name = (component.get("schemaName") or "").lower()
        if component.get("type") == CONTROL_COMPONENT_TYPE and name not in controls:
            wrong(f"Solution.xml claims the control '{name}', but the package has no such CustomControl")
        if component.get("type") == ENTITY_COMPONENT_TYPE and name not in packed_tables:
            wrong(f"Solution.xml claims the table '{name}', but the package does not carry it")

    # --- flows ---------------------------------------------------------------
    packed_flows = {(flow.get("Name") or "") for flow in customizations.iter("Workflow")}
    for flow in contract["workflows"]:
        if flow["name"] not in packed_flows:
            wrong(f"the flow '{flow['name']}' is not in the package (packed: {sorted(packed_flows) or 'none'})")
            continue
        payload = flow.get("clientDataFile")
        if payload and not any(name.endswith(payload) for name in files):
            wrong(f"the flow '{flow['name']}' has no definition file '{payload}' in the package")

    # --- connection references and environment variables ---------------------
    # Read the declaration, not the text of the package. A text match proves nothing here: a flow
    # names the connection it wants to use inside its own definition, so forgetting it in
    # customizations.xml leaves the name in the .zip all the same — and a package whose flow
    # arrives unbound would pass without a word.
    packed_references = {
        (reference.get("connectionreferencelogicalname") or "").lower()
        for reference in customizations.iter("connectionreference")
    }
    for reference in contract["connectionReferences"]:
        if reference.lower() not in packed_references:
            wrong(
                f"the connection reference '{reference}' is not declared in the package "
                "— the flow that binds it would arrive unbound"
            )

    packed_variables = {
        (variable.get("schemaname") or "").lower()
        for variable in customizations.iter("environmentvariabledefinition")
    }
    for variable in contract["environmentVariables"]:
        if variable.lower() not in packed_variables:
            wrong(f"the environment variable '{variable}' is not declared in the package")

    if problems:
        for problem in problems:
            print(f"packed solution: {problem}", file=sys.stderr)
        sys.exit(1)

    summary = ", ".join(
        f"{table} ({len(entity.findall('./SavedQueries/savedqueries/savedquery'))} view(s))"
        for table, entity in sorted(packed_tables.items())
    )
    print(
        f"packed solution: {unique} {version}, publisher {contract['publisher']['uniqueName']}; "
        f"{summary or 'no tables'}; {len(packed_relationships)} relationship(s); "
        f"{len(controls)} control(s); {len(packed_flows)} flow(s)"
    )


if __name__ == "__main__":
    main()
