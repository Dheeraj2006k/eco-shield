"""Parse docs/source/EcoShield_Project_Document.docx into structured JSON.

The web app's /document page and docs/tools/build_pdf.py both render from this JSON, so it is the
single source of truth: after editing the .docx, re-run this script, then build_pdf.py, then copy
the .docx into apps/web/public/ so the "Download .docx" link stays in sync too.

Usage:  python docs/tools/extract_docx.py
Output: apps/web/src/data/proposal.json
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import docx
from docx.table import Table
from docx.text.paragraph import Paragraph

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "docs" / "source" / "EcoShield_Project_Document.docx"
OUT = ROOT / "apps" / "web" / "src" / "data" / "proposal.json"


def slugify(s: str) -> str:
    s = re.sub(r"[^\w\s-]", "", s).strip().lower()
    return re.sub(r"[\s_]+", "-", s)


def main() -> None:
    d = docx.Document(str(SRC))
    blocks: list[dict] = []
    list_buf: list[str] = []

    def flush_list():
        nonlocal list_buf
        if list_buf:
            blocks.append({"type": "list", "items": list_buf})
            list_buf = []

    ti = 0
    for el in d.element.body.iterchildren():
        tag = el.tag.split("}")[-1]
        if tag == "p":
            p = Paragraph(el, d)
            text = p.text.strip()
            style = p.style.name if p.style else "Normal"
            if not text:
                continue
            if style == "List Paragraph":
                list_buf.append(text)
                continue
            flush_list()
            if style in ("Heading 1", "Heading 2", "Heading 3"):
                blocks.append({"type": "heading", "level": int(style[-1]), "text": text})
            else:
                blocks.append({"type": "para", "text": text})
        elif tag == "tbl":
            flush_list()
            t = d.tables[ti]
            ti += 1
            rows = [[c.text.strip() for c in row.cells] for row in t.rows]
            blocks.append({"type": "table", "header": rows[0] if rows else [], "rows": rows[1:] if len(rows) > 1 else []})
    flush_list()

    front: list[dict] = []
    sections: list[dict] = []
    cur = None
    started = False
    for b in blocks:
        if b["type"] == "heading" and b["level"] == 1:
            started = True
            cur = {"id": "", "title": b["text"], "blocks": []}
            sections.append(cur)
            continue
        (front if not started else cur["blocks"]).append(b)

    # Drop the raw "Table of Contents" section — page-number entries are meaningless on a
    # webpage/regenerated PDF; both renderers build their own linked/auto-numbered TOC instead.
    sections = [s for s in sections if s["title"] != "Table of Contents"]

    seen: dict[str, int] = {}
    for s in sections:
        slug = slugify(s["title"])
        if slug in seen:
            seen[slug] += 1
            slug = f"{slug}-{seen[slug]}"
        else:
            seen[slug] = 0
        s["id"] = slug

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"front": front, "sections": sections}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Wrote {OUT} — {len(sections)} sections")


if __name__ == "__main__":
    main()
