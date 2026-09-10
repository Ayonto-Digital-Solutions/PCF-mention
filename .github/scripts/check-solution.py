#!/usr/bin/env python3
"""Checks the solution source for the mistakes SolutionPackager does not complain about.

The packer is happy with an entity folder that no RootComponent mentions: it packs, the import
succeeds, and the table is simply not there. That failure has no error message anywhere, which
is exactly why it is worth a check of its own.
"""

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "solution"
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

    for orphan in sorted(declared):
        fail(f"Solution.xml claims the table '{orphan}', but src/Entities has no folder for it")

        # A hand-written RibbonDiff.xml made SolutionPackager throw a NullReferenceException
        # that named nothing but the entity. The file is optional, so the check keeps it out
        # rather than letting somebody rediscover that on a release tag.
        if (ROOT / "src/Entities" / folder / "RibbonDiff.xml").is_file():
            fail(f"Entities/{folder}/RibbonDiff.xml — the packer cannot read a hand-written one; leave it out")

    customizations = ET.parse(ROOT / "src/Other/Customizations.xml").getroot()
    entities = customizations.find("Entities")
    if entities is not None and len(entities) > 0:
        fail("src/Other/Customizations.xml must keep <Entities /> childless — the packer drops the folder otherwise")

    print(f"solution source: {len(folders)} table(s) declared and present, XML well-formed")


if __name__ == "__main__":
    main()
