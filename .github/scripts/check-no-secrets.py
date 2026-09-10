#!/usr/bin/env python3
"""Looks for things a public repository must not carry.

This is a source-shaped repository for a solution other people import, so the files here are
read by strangers and shipped inside a .zip. Credentials, live environment URLs and identifiers
carried over from someone's tenant have no place in it. The patterns below name shapes, never
customers: nothing customer-specific belongs in a public CI configuration either.
"""

import re
import subprocess
import sys
from pathlib import Path

# Hosts and addresses that are documentation, not somebody's environment.
NEUTRAL = re.compile(
    r"(<[^>]+>|\{[^}]+\}|example\.(com|org)|contoso|fabrikam|localhost|ihreorg|yourorg|myorg|schema\.|aka\.ms)",
    re.IGNORECASE,
)

SUSPECTS: list[tuple[str, re.Pattern[str]]] = [
    ("a SendGrid API key", re.compile(r"\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}")),
    ("an AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("a Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}")),
    ("a private key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("a bearer token", re.compile(r"\bBearer\s+[A-Za-z0-9._-]{20,}")),
    (
        "a secret assigned in place",
        re.compile(
            r"(?i)\b(api[_-]?key|client[_-]?secret|password|access[_-]?token|connectionstring)\b\s*[:=]\s*"
            r"[\"']?[A-Za-z0-9/+_.-]{16,}"
        ),
    ),
    ("a live environment URL", re.compile(r"https://[A-Za-z0-9-]+\.crm\d*\.dynamics\.com")),
    ("a bound connection id", re.compile(r"/apis/shared_[a-z0-9]+/connections/[A-Za-z0-9]{16,}")),
    # "@odata.bind" and friends are OData syntax, not somebody's mailbox.
    ("a mail address", re.compile(r"\b[A-Za-z0-9._%+-]+@(?!odata\.)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
]

SKIP_SUFFIXES = (".png", ".jpg", ".jpeg", ".gif", ".ico", ".zip", ".woff", ".woff2")
SKIP_PATHS = ("package-lock.json", "LICENSE")


def tracked_files() -> list[Path]:
    listed = subprocess.run(
        ["git", "ls-files", "-z"], capture_output=True, text=True, check=True
    ).stdout.split("\0")
    return [Path(name) for name in listed if name]


def main() -> None:
    findings: list[str] = []

    for path in tracked_files():
        if path.suffix.lower() in SKIP_SUFFIXES or path.name in SKIP_PATHS:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, FileNotFoundError, IsADirectoryError):
            continue

        for number, line in enumerate(text.splitlines(), start=1):
            for what, pattern in SUSPECTS:
                for hit in pattern.finditer(line):
                    if NEUTRAL.search(hit.group(0)) or NEUTRAL.search(line):
                        continue
                    shown = hit.group(0)[:60]
                    findings.append(f"{path}:{number} looks like {what}: {shown}")

    if findings:
        print("public repository: found what must not be here", file=sys.stderr)
        for finding in findings:
            print(f"  {finding}", file=sys.stderr)
        sys.exit(1)

    print(f"public repository: {len(tracked_files())} tracked file(s), nothing that must not be here")


if __name__ == "__main__":
    main()
