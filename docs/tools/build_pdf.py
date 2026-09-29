"""Build the ECO-SHIELD project document PDF from apps/web/src/data/proposal.json.

The JSON is parsed once from the edited .docx (docs/source/EcoShield_Project_Document.docx)
and is the single source of truth for both the /document web page and this PDF, so they never
drift apart. Re-run this after any future edit to that docx (see docs/tools/extract_docx.py).

Usage:  python docs/tools/build_pdf.py
Output: apps/web/public/EcoShield_Project_Document.pdf (served statically, linked from /document)
"""

from __future__ import annotations

import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    FrameBreak,
    ListFlowable,
    ListItem,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Frame,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "apps" / "web" / "src" / "data" / "proposal.json"
OUT = ROOT / "apps" / "web" / "public" / "EcoShield_Project_Document.pdf"

NAVY = colors.HexColor("#0f2140")
NAVY_MID = colors.HexColor("#1f3f70")
NAVY_LIGHT = colors.HexColor("#eef3fb")
SLATE = colors.HexColor("#475569")
PURPLE = colors.HexColor("#7c3aed")

LEGEND_COLOR = {
    "LOCKED": colors.HexColor("#059669"),
    "BENCHMARK-PENDING": colors.HexColor("#b45309"),
    "ADVANCED": PURPLE,
    "ROADMAP": colors.HexColor("#0284c7"),
    "VERIFY BEFORE CLAIM": colors.HexColor("#dc2626"),
}

styles = getSampleStyleSheet()
styles.add(ParagraphStyle("H1Doc", parent=styles["Heading1"], textColor=NAVY, fontSize=16, spaceBefore=18, spaceAfter=8, keepWithNext=True))
styles.add(ParagraphStyle("H2Doc", parent=styles["Heading2"], textColor=NAVY_MID, fontSize=12.5, spaceBefore=12, spaceAfter=5, keepWithNext=True))
styles.add(ParagraphStyle("H3Doc", parent=styles["Heading3"], textColor=NAVY_MID, fontSize=11, spaceBefore=8, spaceAfter=4, keepWithNext=True))
styles.add(ParagraphStyle("BodyDoc", parent=styles["BodyText"], fontSize=9.6, leading=14, spaceAfter=6, textColor=colors.HexColor("#1e293b")))
styles.add(ParagraphStyle("BulletDoc", parent=styles["BodyDoc"], leftIndent=0, spaceAfter=3))
styles.add(ParagraphStyle("Cell", parent=styles["BodyDoc"], fontSize=8.6, leading=11.5, spaceAfter=0))
styles.add(ParagraphStyle("CellHead", parent=styles["Cell"], textColor=colors.white, fontName="Helvetica-Bold"))
styles.add(ParagraphStyle("CoverTitle", parent=styles["Title"], fontSize=30, textColor=NAVY, spaceAfter=4))
styles.add(ParagraphStyle("CoverSub", parent=styles["BodyDoc"], fontSize=12.5, textColor=NAVY_MID, alignment=1, spaceAfter=2))
styles.add(ParagraphStyle("CoverMeta", parent=styles["BodyDoc"], fontSize=10, textColor=SLATE, alignment=1, spaceAfter=2))
styles.add(ParagraphStyle("Footer", parent=styles["BodyDoc"], fontSize=7.5, textColor=SLATE))
styles.add(ParagraphStyle("TOCTitle", parent=styles["H1Doc"]))  # visually identical to H1Doc, but not tracked by after_flowable


def esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class Bookmark(Flowable):
    """Invisible flowable that registers a PDF outline entry + anchor for the TOC to link to."""

    def __init__(self, key: str, title: str, level: int):
        super().__init__()
        self.key, self.title, self.level = key, title, level
        self.width = self.height = 0

    def draw(self):
        self.canv.bookmarkPage(self.key)
        self.canv.addOutlineEntry(self.title, self.key, self.level, 0)
        # TOC entries are emitted separately by BaseDocTemplate.afterFlowable (see build_pdf's
        # `after_flowable`), which is the documented hook for TableOfContents — Flowables don't
        # have direct access to the doc template's `notify` from inside draw().


def blocks_to_flowables(blocks: list[dict], sec_id: str) -> list:
    out = []
    for i, b in enumerate(blocks):
        if b["type"] == "heading":
            style = "H2Doc" if b["level"] == 2 else "H3Doc"
            out.append(Bookmark(f"{sec_id}-h{i}", b["text"], 1))  # outline nests under the section (level 0)
            out.append(Paragraph(esc(b["text"]), styles[style]))
        elif b["type"] == "para":
            out.append(Paragraph(esc(b["text"]), styles["BodyDoc"]))
        elif b["type"] == "list":
            items = [ListItem(Paragraph(esc(t), styles["BulletDoc"]), leftIndent=14) for t in b["items"]]
            out.append(ListFlowable(items, bulletType="bullet", start="•", leftIndent=8, bulletFontSize=7))
            out.append(Spacer(1, 4))
        elif b["type"] == "table":
            header, rows = b["header"], b["rows"]
            is_legend = header and header[0] == "Label"
            data = [[Paragraph(esc(h), styles["CellHead"]) for h in header]]
            for row in rows:
                cells = []
                for j, c in enumerate(row):
                    if is_legend and j == 0:
                        color = LEGEND_COLOR.get(c, SLATE)
                        cells.append(Paragraph(f'<font color="{color.hexval()}"><b>{esc(c)}</b></font>', styles["Cell"]))
                    else:
                        cells.append(Paragraph(esc(c), styles["Cell"]))
                data.append(cells)
            ncols = len(header)
            page_w = A4[0] - 3.2 * cm
            col_w = None
            if ncols == 2:
                col_w = [page_w * 0.28, page_w * 0.72]
            t = Table(data, colWidths=col_w, repeatRows=1)
            t.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), NAVY_MID),
                        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 5),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ]
                )
            )
            out.append(t)
            out.append(Spacer(1, 8))
    return out


def footer(canv, doc):
    canv.saveState()
    canv.setFont("Helvetica", 7.5)
    canv.setFillColor(SLATE)
    canv.drawString(1.6 * cm, 1.1 * cm, "ECO-SHIELD — Smart Hazard Intelligence & Environmental Local Detection · SIH 2026 · PS 26178 · Team CODE SMITHS")
    canv.drawRightString(A4[0] - 1.6 * cm, 1.1 * cm, f"Page {canv.getPageNumber()}")
    canv.setStrokeColor(colors.HexColor("#e2e8f0"))
    canv.line(1.6 * cm, 1.4 * cm, A4[0] - 1.6 * cm, 1.4 * cm)
    canv.restoreState()


def cover(canv, doc):
    canv.saveState()
    canv.setFillColor(NAVY)
    canv.rect(0, A4[1] - 1.2 * cm, A4[0], 1.2 * cm, fill=1, stroke=0)
    canv.restoreState()


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    front, sections = data["front"], data["sections"]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(str(OUT), pagesize=A4, leftMargin=1.6 * cm, rightMargin=1.6 * cm, topMargin=1.8 * cm, bottomMargin=1.8 * cm, title="ECO-SHIELD Project Document", author="Team CODE SMITHS")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body")
    doc.addPageTemplates([PageTemplate(id="cover", frames=[frame], onPage=cover), PageTemplate(id="normal", frames=[frame], onPage=footer)])

    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle("TOC1", parent=styles["BodyDoc"], fontSize=10.5, leftIndent=0, spaceAfter=6, textColor=NAVY),
        ParagraphStyle("TOC2", parent=styles["BodyDoc"], fontSize=9, leftIndent=14, spaceAfter=3, textColor=SLATE),
    ]

    story: list = [NextPageTemplate("normal")]
    # -- Cover page --
    story.append(Spacer(1, 3 * cm))
    story.append(Paragraph("ECOSHIELD", styles["CoverTitle"]))
    story.append(Paragraph("Intelligence at the Edge of Every Disaster", styles["CoverSub"]))
    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph("A Resilient, AI-Powered Environmental Intelligence Network", styles["CoverMeta"]))
    story.append(Paragraph("Complete Project Document — Architecture, Hardware, AI/ML, Deployment and Feasibility", styles["CoverMeta"]))
    story.append(Spacer(1, 1 * cm))
    story.append(Paragraph("Smart India Hackathon 2026", styles["CoverMeta"]))
    story.append(Paragraph("Problem Statement 26178 — Qualcomm Inc.", styles["CoverMeta"]))
    story.append(Paragraph("Category: Hardware &nbsp;|&nbsp; Theme: Disaster Management", styles["CoverMeta"]))
    story.append(Spacer(1, 0.6 * cm))
    story.append(Paragraph("<b>Team Name:</b> CODE SMITHS", styles["CoverMeta"]))
    story.append(Paragraph("<b>Team Members:</b> Kasula Kiran, K.S.V.Dheeraj Kumar, B.Ram Charan Reddy, M.Divya Tejswi,<br/>Ch.Jishnu Chowdary, K.Sai Sahitya Kannam", styles["CoverMeta"]))
    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph("September 2026", styles["CoverMeta"]))
    story.append(PageBreak())

    # `front` holds the cover-page paragraph lines (already rendered on the cover above via the
    # literal Paragraphs added there) — intentionally not repeated here as body text.

    # -- Table of contents --
    story.append(Paragraph("Table of Contents", styles["TOCTitle"]))
    story.append(toc)
    story.append(PageBreak())

    # -- Sections --
    for s in sections:
        story.append(Bookmark(s["id"], s["title"], 0))
        story.append(Paragraph(esc(s["title"]), styles["H1Doc"]))
        story += blocks_to_flowables(s["blocks"], s["id"])

    def after_flowable(flowable):
        if isinstance(flowable, Paragraph):
            style = flowable.style.name
            if style == "H1Doc":
                doc.notify("TOCEntry", (0, flowable.getPlainText(), doc.page))
            elif style == "H2Doc":
                doc.notify("TOCEntry", (1, flowable.getPlainText(), doc.page))

    doc.afterFlowable = after_flowable
    doc.multiBuild(story)
    print(f"Wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
