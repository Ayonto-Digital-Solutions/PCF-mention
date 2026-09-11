#!/usr/bin/env python3
"""Holds the documentation against the packed solution.

check-solution.py reads the source and check-package.py the built .zip, but both check the
solution against itself. The documentation is the third thing that has to be true, and it is the
one a person actually follows: a column length, a property name, a label in the form designer.
Nothing in a build notices when one of those drifts — it is prose, and prose compiles.

So every claim that can be checked mechanically is checked here against the package that ships:
the columns and their lengths, the manifest properties, the labels the designer will really show,
the values the flow depends on, and the promise that the package carries no flow and no connection.

Usage: check-guide.py <solution.zip> <doc.md> [<doc.md> ...] [--expect-controls]
"""

import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

CONTROL = "Controls/ayonto_Ayonto.MentionControl"

# The language the solution declares. A resx for another language ships but never shows.
SHIPPED_LANGUAGE = "1033"

# What the property table promises the form designer will say.
LABELS = {
    "Text column": "Field_Name",
    "Record id": "EntityId_Name",
    "Table name": "EntityName_Name",
    "Send e-mail": "SendEmail_Name",
    "Send Teams message": "SendTeams_Name",
    "Subject": "EmailSubject_Name",
    "Link label (e-mail)": "EmailLinkText_Name",
}

problems: list[str] = []


def wrong(message: str) -> None:
    problems.append(message)


def main() -> None:
    arguments = [a for a in sys.argv[1:] if a != "--expect-controls"]
    expect_controls = "--expect-controls" in sys.argv[1:]
    if len(arguments) < 2:
        sys.exit("check-guide: give a package and at least one document")

    package, *docs = arguments
    documents = {Path(d).name: Path(d).read_text(encoding="utf-8") for d in docs}
    prose = "\n".join(documents.values())

    with zipfile.ZipFile(package) as archive:
        names = archive.namelist()
        customizations = ET.fromstring(archive.read("customizations.xml").decode("utf-8-sig"))
        has_control = f"{CONTROL}/ControlManifest.xml" in names
        if has_control:
            manifest = ET.fromstring(archive.read(f"{CONTROL}/ControlManifest.xml").decode("utf-8-sig"))
            strings = ET.fromstring(
                archive.read(f"{CONTROL}/strings/MentionControl.{SHIPPED_LANGUAGE}.resx").decode("utf-8-sig")
            )
            bundle = archive.read(f"{CONTROL}/bundle.js").decode("utf-8", "replace")

    if expect_controls and not has_control:
        wrong("the package carries no Mention control, so the documentation cannot be checked against it")

    entity = next(customizations.iter("Entity"), None)
    described = entity.find("./EntityInfo/entity") if entity is not None else None
    if described is None:
        sys.exit("check-guide: the package carries no table")
    # Only the solution's own columns. Every table also carries createdon, ownerid, statecode and
    # a dozen more that Dataverse puts there, and no documentation should have to list those.
    lengths = {
        (a.findtext("Name") or "").lower(): (a.findtext("MaxLength") or "")
        for a in described.findall("./attributes/attribute")
        if (a.findtext("Name") or "").startswith("ayonto_")
    }
    table_names = {(described.get("Name") or "").lower(), (described.findtext("EntitySetName") or "").lower()}

    # --- what the documentation says the package is ---------------------------
    for what, found in (
        ("flow", list(customizations.iter("Workflow"))),
        ("connection reference", list(customizations.iter("connectionreference"))),
        ("environment variable", [n for n in names if "environmentvariable" in n]),
    ):
        if found:
            wrong(f"the documentation says the package carries no {what}, but it does")

    # --- every column the documentation names ---------------------------------
    for name in sorted(set(re.findall(r"\bayonto_[a-z]+\b", prose))):
        if name not in lengths and name not in table_names:
            wrong(f"the documentation names '{name}', which the packed table does not have")

    # --- the column table, length by length -----------------------------------
    rows = re.findall(r"^\| `(ayonto_[a-z]+)` \| ([^|]+?) \| ([^|]*?) \|", documents.get("README.md", ""), re.M)
    if len(rows) != len(lengths):
        wrong(f"the column table lists {len(rows)} of the table's {len(lengths)} columns")
    for name, _type, shown in rows:
        if shown.strip() != lengths.get(name, "").strip():
            wrong(
                f"the column table gives '{name}' the length {shown.strip() or '(none)'}, "
                f"the package says {lengths.get(name) or '(none)'}"
            )

    if not has_control:
        report(package, len(rows), checked_control=False)
        return

    # --- every property the documentation names -------------------------------
    properties = {p.get("name"): p for p in manifest.iter("property")}
    named = set(re.findall(r"`(" + "|".join(sorted(properties)) + r")`", prose)) if properties else set()
    for name in sorted(named):
        if name not in properties:
            wrong(f"the documentation names the property '{name}', which the manifest does not have")

    usage = manifest.find(".//control/external-service-usage")
    if usage is None or usage.get("enabled") != "false":
        wrong("the documentation promises external-service-usage is off, and the manifest disagrees")

    # --- the labels the designer will really show -----------------------------
    shown = {d.get("name"): (d.findtext("value") or "") for d in strings.iter("data")}
    for promised, key in LABELS.items():
        if promised not in prose:
            wrong(f"the property table no longer promises the label '{promised}'")
        elif shown.get(key) != promised:
            wrong(f"the documentation calls it '{promised}', the designer shows '{shown.get(key)}'")

    # --- the values the flow is built around ----------------------------------
    for value in ("Email", "Teams", "New"):
        if f'"{value}"' not in bundle and f"'{value}'" not in bundle:
            wrong(f"the component does not write '{value}', which the flow filters on")

    for name, wanted, means in (("sendEmail", "0", "on"), ("sendTeams", "1", "off")):
        if properties[name].get("default-value") != wanted:
            wrong(f"the documentation says {name} ships {means}, the manifest says otherwise")

    report(package, len(rows), checked_control=True)


def report(package: str, columns: int, *, checked_control: bool) -> None:
    if problems:
        print("documentation: what it claims and what the package does are not the same", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        sys.exit(1)
    scope = "columns, properties, designer labels and component values" if checked_control else "columns only"
    print(f"documentation: matches {Path(package).name} — {columns} column(s) checked, {scope}")


if __name__ == "__main__":
    main()
