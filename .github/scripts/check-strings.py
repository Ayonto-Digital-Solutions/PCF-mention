#!/usr/bin/env python3
"""Holds each control's translations against its base language.

A key the user's language does not carry is not answered with the English one — the platform
returns nothing for it, and the label, button or message comes up empty. Only for users in that
language, which is why nobody notices: adding a property and forgetting one line in the
translation is all it takes.

check-guide.py does the same at the other end, on the package that is about to be published.
This one reads the source, so the mistake surfaces in the pull request that makes it rather than
on a release tag.

Usage: check-strings.py <control-dir> [<control-dir> ...]
"""

import sys
import xml.etree.ElementTree as ET
from pathlib import Path

BASE_LANGUAGE = "1033"

problems: list[str] = []


def strings(path: Path) -> dict[str, str]:
    root = ET.parse(path).getroot()
    return {entry.get("name"): (entry.findtext("value") or "") for entry in root.iter("data")}


def main() -> None:
    directories = [Path(argument) for argument in sys.argv[1:]]
    if not directories:
        sys.exit("check-strings: give at least one control directory")

    checked = 0
    for directory in directories:
        folder = directory / "strings"
        if not folder.is_dir():
            problems.append(f"{directory} has no strings folder")
            continue

        for base in sorted(folder.glob(f"*.{BASE_LANGUAGE}.resx")):
            english = strings(base)
            beside = sorted(
                path for path in folder.glob("*.resx")
                if path.name.split(".")[:-2] == base.name.split(".")[:-2] and path != base
            )
            if not beside:
                problems.append(f"{base.name} ships alone — no translation beside it")
            for translation in beside:
                translated = strings(translation)
                missing = sorted(key for key in english if not translated.get(key, "").strip())
                if missing:
                    problems.append(
                        f"{translation.name} has no text for {len(missing)} string(s) that "
                        f"{base.name} defines ({', '.join(missing[:3])}"
                        f"{', …' if len(missing) > 3 else ''}) — a user in that language gets "
                        "nothing there, not the English word"
                    )
                extra = sorted(set(translated) - set(english))
                if extra:
                    problems.append(
                        f"{translation.name} carries {len(extra)} string(s) the base language does "
                        f"not have ({', '.join(extra[:3])}) — nothing ever reads them"
                    )
                checked += 1

    if problems:
        print("control strings: the languages do not say the same things", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        sys.exit(1)

    print(f"control strings: {checked} translation(s) complete against {BASE_LANGUAGE}")


if __name__ == "__main__":
    main()
