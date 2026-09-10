#!/usr/bin/env python3
"""Puts an environment variable definition into a copy of the source, as a folder component."""
import sys
from pathlib import Path

root = Path(sys.argv[1])
folder = root / "src/environmentvariabledefinitions/ayonto_MentionSenderAddress"
folder.mkdir(parents=True, exist_ok=True)
(folder / "environmentvariabledefinition.xml").write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<environmentvariabledefinition schemaname="ayonto_MentionSenderAddress">\n'
    "  <displayname>Ayonto Mention Sender Address</displayname>\n"
    "  <description>Verified SendGrid sender address the mention notification flow sends from.</description>\n"
    "  <type>100000000</type>\n"
    "  <introducedversion>1.0.0.0</introducedversion>\n"
    "  <iscustomizable>1</iscustomizable>\n"
    "  <isrequired>1</isrequired>\n"
    "  <environmentvariabledefinitionid>{b81a4d2e-6c05-4f7a-9c3d-2a6f1e8b4c57}</environmentvariabledefinitionid>\n"
    "</environmentvariabledefinition>\n",
    encoding="utf-8",
)
print("environment variable definition written")
