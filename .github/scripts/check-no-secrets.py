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

# A Dataverse logical name carries its publisher's prefix, so one from somebody else's tenant
# names their organisation as surely as the organisation itself would. Only this project's own
# prefix, the platform's, and the prefixes Microsoft's own documentation uses for examples belong
# in a public repository. The list says which prefixes are allowed — it never names a customer.
OWN_PREFIXES = frozenset(
    {
        "ayonto",  # this project
        "shared",  # connector ids, e.g. shared_sendgrid
        "msdyn", "mscrm", "msdynce", "adx",  # Microsoft first-party
        "contoso", "fabrikam", "sample", "example", "test", "demo",  # documentation placeholders
    }
)
LOGICAL_NAME = re.compile(r"[\"']([a-z][a-z0-9]{1,7})_([a-z][a-z0-9_]*)[\"']")
# Only where Dataverse logical names actually live. Elsewhere an underscore is just an underscore.
NAMED_PLACES = ("solution/", "Mention/", "GroupDetailList/", ".github/solution-contract.json", "README.md")

# A link into a host nobody outside one organisation can reach names that organisation — a logo
# on an intranet, a portal, an internal wiki. Documentation written from a real setup carries
# those without anyone noticing. Only the hosts this project genuinely refers to are allowed; a
# placeholder host such as contoso.crm4.dynamics.com is already covered by NEUTRAL above.
LINKED_HOST = re.compile(r"https?://([A-Za-z0-9._-]+)")
OWN_HOSTS = frozenset(
    {
        "learn.microsoft.com",
        "schemas.microsoft.com",
        "schema.management.azure.com",
        "github.com",
        "help.github.com",
        "raw.githubusercontent.com",
        "www.w3.org",
    }
)


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

            if not str(path).startswith(NAMED_PLACES):
                continue

            for hit in LINKED_HOST.finditer(line):
                host = hit.group(1)
                if host in OWN_HOSTS or NEUTRAL.search(host) or "." not in host:
                    continue
                findings.append(
                    f"{path}:{number} links to '{host}' — a host that is not this project's "
                    "does not belong in documentation other people read"
                )

            for hit in LOGICAL_NAME.finditer(line):
                name = hit.group(0)
                # A system relationship carries the table it belongs to further along its name,
                # as in "business_unit_ayonto_mention" — the leading word is the platform's.
                if hit.group(1) in OWN_PREFIXES or any(f"{own}_" in name for own in OWN_PREFIXES):
                    continue
                findings.append(
                    f"{path}:{number} carries the publisher prefix '{hit.group(1)}_' — "
                    f"if that is somebody's tenant, it does not belong here: {name[:60]}"
                )

    if findings:
        print("public repository: found what must not be here", file=sys.stderr)
        for finding in findings:
            print(f"  {finding}", file=sys.stderr)
        sys.exit(1)

    print(f"public repository: {len(tracked_files())} tracked file(s), nothing that must not be here")


if __name__ == "__main__":
    main()
