#!/usr/bin/env python3
"""Renders the notification documentation as one PDF, for handing to somebody without GitHub.

The flow is not part of the solution any more — it is built by hand from these documents — so the
documents are the deliverable and belong with the release, not only in the repository.

Markdown to HTML with the markdown package, HTML to PDF with headless Chrome. Chrome is on the
runner image, and asking it to print is the only step here that could ever break; it does so
loudly rather than producing half a document.

Usage: build-docs-pdf.py <out.pdf> <doc.md> [<doc.md> ...]
"""

import html
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import markdown

STYLE = """
@page { size: A4; margin: 18mm 16mm; }
body { font: 10.5pt/1.55 "DejaVu Sans", "Segoe UI", system-ui, sans-serif; color: #1a1a1a; }
h1 { font-size: 19pt; margin: 0 0 .4em; border-bottom: 2px solid #333; padding-bottom: .2em; }
h2 { font-size: 14pt; margin: 1.6em 0 .4em; border-bottom: 1px solid #bbb; padding-bottom: .15em; }
h3 { font-size: 11.5pt; margin: 1.2em 0 .3em; }
h1, h2, h3 { page-break-after: avoid; }
p, li { orphans: 3; widows: 3; }
code, pre { font-family: "DejaVu Sans Mono", ui-monospace, monospace; font-size: 8.8pt; }
code { background: #f2f2f2; padding: .1em .3em; border-radius: 3px; }
pre { background: #f7f7f7; border: 1px solid #e0e0e0; border-radius: 4px;
      padding: .7em .9em; white-space: pre-wrap; word-break: break-word; page-break-inside: avoid; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: .8em 0; page-break-inside: avoid; }
th, td { border: 1px solid #ccc; padding: .35em .55em; text-align: left; vertical-align: top; }
th { background: #f0f0f0; }
a { color: #1a4f8a; text-decoration: none; }
hr { border: 0; border-top: 1px solid #ccc; margin: 1.6em 0; }
.doc + .doc { page-break-before: always; }
"""


def chrome() -> str:
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        found = shutil.which(name)
        if found:
            return found
    for bundled in sorted(Path("/opt/pw-browsers").glob("chromium*/chrome-linux/chrome")):
        if bundled.is_file():
            return str(bundled)
    sys.exit("build-docs-pdf: no Chrome or Chromium to print with")


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__.strip().splitlines()[-1])

    out = Path(sys.argv[1])
    sources = [Path(name) for name in sys.argv[2:]]

    parts = []
    for source in sources:
        body = markdown.markdown(
            source.read_text(encoding="utf-8"),
            extensions=["tables", "fenced_code", "toc", "sane_lists"],
        )
        parts.append(f'<section class="doc">{body}</section>')

    page = (
        "<!doctype html><html lang='de'><head><meta charset='utf-8'>"
        f"<title>{html.escape(out.stem)}</title><style>{STYLE}</style></head>"
        f"<body>{''.join(parts)}</body></html>"
    )

    with tempfile.TemporaryDirectory() as work:
        source = Path(work) / "docs.html"
        source.write_text(page, encoding="utf-8")
        out.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                chrome(),
                "--headless",
                "--disable-gpu",
                "--no-sandbox",
                "--no-pdf-header-footer",
                f"--print-to-pdf={out.resolve()}",
                source.resolve().as_uri(),
            ],
            check=True,
            capture_output=True,
            timeout=180,
        )

    if not out.is_file() or out.stat().st_size < 10_000:
        sys.exit(f"build-docs-pdf: {out} came out empty or far too small")

    print(f"documentation: {out} from {len(sources)} document(s), {out.stat().st_size // 1024} KiB")


if __name__ == "__main__":
    main()
