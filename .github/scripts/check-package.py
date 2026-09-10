#!/usr/bin/env python3
"""Checks that the packed solution carries what the source declared.

check-solution.py reads the source. That is not enough: SolutionPackager took a whole
SavedQueries folder, packed without a word, and shipped a table with no view — a release
nobody could tell was incomplete by looking at the build. So this reads the other end,
the .zip that is about to be published, and compares it against the source.
"""

import os
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(os.environ.get("SOLUTION_ROOT") or Path(__file__).resolve().parents[2] / "solution")
ENTITY_COMPONENT_TYPE = "1"
CONTROL_COMPONENT_TYPE = "66"


def fail(message: str) -> None:
    print(f"packed solution: {message}", file=sys.stderr)
    sys.exit(1)


def declared() -> dict[str, int]:
    """Every table the source describes, and how many views it gives it."""
    tables: dict[str, int] = {}
    for entity in sorted((ROOT / "src/Entities").glob("*/Entity.xml")):
        root = ET.parse(entity).getroot()
        described = root.find("./EntityInfo/entity")
        name = (described.get("Name") if described is not None else "").lower()
        if not name:
            fail(f"{entity.relative_to(ROOT)} has no entity name")
        tables[name] = len(root.findall("./SavedQueries/savedqueries/savedquery"))
    return tables


def main() -> None:
    if len(sys.argv) != 2:
        fail("usage: check-package.py <solution.zip>")

    with zipfile.ZipFile(sys.argv[1]) as package:
        names = package.namelist()
        if "customizations.xml" not in names or "solution.xml" not in names:
            fail(f"{sys.argv[1]} is not a solution package: {names[:5]}")
        customizations = ET.fromstring(package.read("customizations.xml").decode("utf-8-sig"))
        solution = ET.fromstring(package.read("solution.xml").decode("utf-8-sig"))

    packed: dict[str, int] = {}
    for entity in customizations.iter("Entity"):
        described = entity.find("./EntityInfo/entity")
        name = (described.get("Name") if described is not None else entity.findtext("Name") or "").lower()
        packed[name] = len(entity.findall("./SavedQueries/savedqueries/savedquery"))

    for table, views in declared().items():
        if table not in packed:
            fail(f"the source describes the table '{table}', but it is not in the package")
        if packed[table] != views:
            fail(
                f"the table '{table}' declares {views} view(s) and the package carries "
                f"{packed[table]} — the packer reads <SavedQueries> inside Entity.xml, "
                "not a SavedQueries folder"
            )

    # The name is a child element here, not an attribute — reading it as one made every control
    # look missing, which would have stopped the release this check exists to protect.
    controls = {
        (control.findtext("Name") or control.get("Name") or "").lower()
        for control in customizations.iter("CustomControl")
    }
    for component in solution.iter("RootComponent"):
        name = (component.get("schemaName") or "").lower()
        if component.get("type") == CONTROL_COMPONENT_TYPE and name not in controls:
            fail(f"Solution.xml claims the control '{name}', but the package has no such CustomControl")
        if component.get("type") == ENTITY_COMPONENT_TYPE and name not in packed:
            fail(f"Solution.xml claims the table '{name}', but the package does not carry it")

    summary = ", ".join(f"{table} ({views} view(s))" for table, views in sorted(packed.items()))
    print(f"packed solution: {summary or 'no tables'}; {len(controls)} control(s)")


if __name__ == "__main__":
    main()
