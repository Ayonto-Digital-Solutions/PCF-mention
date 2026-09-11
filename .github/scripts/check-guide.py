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

# The property table below is written against the English strings, because English is the base
# language of the package. Which language a user actually sees is not decided here: the platform
# picks the resx by the user's own language preference, from the languages the organization has
# available — see solution/README.md, "Warum der Designer englisch spricht".
BASE_LANGUAGE = "1033"
# Shipped alongside. Every key the base has must have a translation here, because a key that is
# missing from the user's language does not fall back — it comes back empty.
TRANSLATIONS = ("1031",)

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


def slug(heading: str) -> str:
    """The anchor GitHub gives a heading.

    Lower case, punctuation dropped, then every space — each one on its own — becomes a hyphen.
    Not a run of spaces, each space: a heading written "Schritt 1 — Die Komponente" loses the
    dash and keeps the two spaces around it, so its anchor carries a double hyphen. Collapsing
    them here would let a link that really is broken look fine.
    """
    text = heading.strip().lower()
    text = re.sub(r"[`*_]", "", text)
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    return text.strip().replace(" ", "-")


def check_links(documents: dict[str, str]) -> None:
    """A link inside the documentation has to lead somewhere.

    Renaming a heading is a two-line edit, and the link that pointed at it keeps looking like a
    link — it just lands at the top of the page. Whoever follows it ends up reading the wrong
    section, which is worse than no link at all.
    """
    for name, text in documents.items():
        anchors = {slug(line.lstrip("#").strip()) for line in text.splitlines() if line.startswith("#")}
        for target in sorted(set(re.findall(r"\]\(#([^)]+)\)", text))):
            if target not in anchors:
                wrong(f"{name} links to '#{target}', which is no heading in it")


def check_translations(package: str) -> None:
    """Every string the base language has must exist in the languages shipped beside it.

    A key that is missing from the user's language is not answered with the English one. The
    platform returns nothing for it, so the button, the label or the message it was meant to
    carry simply comes up empty for that user — and only for that user, which is why nobody
    notices. Adding a property and forgetting one line in the translation is all it takes.
    """
    with zipfile.ZipFile(package) as archive:
        names = archive.namelist()

        def keys(name: str) -> dict[str, str]:
            root = ET.fromstring(archive.read(name).decode("utf-8-sig"))
            return {d.get("name"): (d.findtext("value") or "") for d in root.iter("data")}

        for base in sorted(n for n in names if n.endswith(f".{BASE_LANGUAGE}.resx")):
            english = keys(base)
            for language in TRANSLATIONS:
                beside = base.replace(f".{BASE_LANGUAGE}.resx", f".{language}.resx")
                if beside not in names:
                    wrong(f"{base} ships without its {language} translation")
                    continue
                translated = keys(beside)
                missing = sorted(key for key in english if not translated.get(key, "").strip())
                if missing:
                    wrong(
                        f"{beside} has no text for {len(missing)} string(s) the base language "
                        f"defines ({', '.join(missing[:3])}{', …' if len(missing) > 3 else ''}) — "
                        "a user in that language gets nothing there, not the English word"
                    )


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
                archive.read(f"{CONTROL}/strings/MentionControl.{BASE_LANGUAGE}.resx").decode("utf-8-sig")
            )
            bundle = archive.read(f"{CONTROL}/bundle.js").decode("utf-8", "replace")

    if expect_controls and not has_control:
        wrong("the package carries no Mention control, so the documentation cannot be checked against it")

    check_links(documents)
    check_translations(package)

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
