#!/usr/bin/env python3
"""Checks the solution source for the mistakes SolutionPackager does not complain about.

The packer is happy with an entity folder that no RootComponent mentions: it packs, the import
succeeds, and the table is simply not there. That failure has no error message anywhere, which
is exactly why it is worth a check of its own.
"""

import os
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(os.environ.get("SOLUTION_ROOT") or Path(__file__).resolve().parents[2] / "solution")
ENTITY_COMPONENT_TYPE = "1"


def fail(message: str) -> None:
    print(f"solution source: {message}", file=sys.stderr)
    sys.exit(1)


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
    variables = sorted((ROOT / "src/environmentvariabledefinitions").glob("*/environmentvariabledefinition.xml"))
    for variable in variables:
        declared_name = ET.parse(variable).getroot().get("schemaname", "")
        if declared_name != variable.parent.name:
            fail(
                f"environmentvariabledefinitions/{variable.parent.name} declares the schema name "
                f"'{declared_name}' — the folder and the name have to match"
            )

    print(
        f"solution source: {len(folders)} table(s) declared and present, {len(flows)} flow(s), "
        f"{len(references)} connection reference(s), {len(variables)} environment variable(s), "
        "XML well-formed"
    )


if __name__ == "__main__":
    main()
