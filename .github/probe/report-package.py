#!/usr/bin/env python3
"""Says what actually landed in a packed solution."""
import sys
import zipfile
import xml.etree.ElementTree as ET

with zipfile.ZipFile(sys.argv[1]) as package:
    print("Dateien:", sorted(package.namelist()))
    customizations = package.read("customizations.xml").decode("utf-8-sig")

root = ET.fromstring(customizations)
for tag in ("Workflows", "connectionreferences", "environmentvariabledefinitions", "Entities", "CustomControls"):
    found = root.find(tag)
    print(f"  {tag:<32} {'fehlt' if found is None else str(len(list(found))) + ' Kind(er)'}")
for needle in ("environmentvariable", "connectionreference", "savedquery"):
    print(f"  '{needle}' im XML: {customizations.lower().count(needle)}x")
