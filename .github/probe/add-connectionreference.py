#!/usr/bin/env python3
"""Puts a connection reference into a copy of the source, either as a folder or inline.

Connection references have no documented solution component type and no element in the
customizations schema, so both shapes are tried and the pack decides.
"""
import sys
from pathlib import Path

root, shape = Path(sys.argv[1]), sys.argv[2]
record = (
    '<connectionreference connectionreferencelogicalname="ayonto_sharedsendgrid">\n'
    "  <connectionreferencedisplayname>Ayonto Mention SendGrid</connectionreferencedisplayname>\n"
    "  <connectorid>/providers/Microsoft.PowerApps/apis/shared_sendgrid</connectorid>\n"
    "  <iscustomizable>1</iscustomizable>\n"
    "  <introducedversion>1.0.0.0</introducedversion>\n"
    "</connectionreference>\n"
)

if shape == "folder":
    folder = root / "src/connectionreferences"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "ayonto_sharedsendgrid.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n' + record, encoding="utf-8"
    )
else:
    indented = "".join("    " + line if line.strip() else line for line in record.splitlines(keepends=True))
    block = "  <connectionreferences>\n" + indented + "  </connectionreferences>\n"
    cust = root / "src/Other/Customizations.xml"
    text = cust.read_text(encoding="utf-8")
    assert "  <EntityDataProviders />" in text
    cust.write_text(text.replace("  <EntityDataProviders />", block + "  <EntityDataProviders />", 1), encoding="utf-8")
print(f"connection reference written as {shape}")
