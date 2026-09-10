#!/usr/bin/env python3
"""Adds a RootComponent of the given type to a copy of the solution source."""
import sys
from pathlib import Path

root, kind, schema = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
sol = root / "src/Other/Solution.xml"
text = sol.read_text(encoding="utf-8")
marker = '<RootComponent type="1" schemaName="ayonto_mention" behavior="0" />'
assert marker in text
sol.write_text(text.replace(marker, marker + f'\n      <RootComponent type="{kind}" schemaName="{schema}" behavior="0" />', 1), encoding="utf-8")
print(f"root component {kind} added")
