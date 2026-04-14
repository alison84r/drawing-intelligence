"""
Engineering Table Extractor
─────────────────────────────────────────────────────────────────────────────
Uses PyMuPDF's vector-line table finder (page.find_tables) to detect tables
directly from the PDF's vector geometry — no ML model needed.

For each detected table:
  - Extracts cell content via PyMuPDF's native extraction
  - Classifies table type (BOM, Revision, Tolerance, Title Block, GD&T FCF)
    using regex on header text
  - Returns bounding boxes in PDF coordinate space (direct SVG overlay)

Why no Table Transformer: TATR was trained on scientific-article rasters and
scores < 0.2 on engineering drawing tables. PyMuPDF's line-based detection
is more reliable and faster for vector CAD PDFs.
"""
from __future__ import annotations

import re
from typing import Any

import fitz  # PyMuPDF

# ── Constants ─────────────────────────────────────────────────────────────────

MIN_TABLE_AREA = 1_000   # PDF pts² — filters tiny mis-detected boxes
MAX_TABLE_AREA = 900_000 # PDF pts² — filters full-page false positives (~30% of A1)
MIN_ROWS       = 2       # for generic tables; FCF single-row frames are handled separately

def is_available() -> bool:
    """Always True — uses only PyMuPDF which is a required dependency."""
    return True


GDT_SYMBOLS = set("\u2300\u2295\u22a5\u2225\u25a1\u25cb\u25b3\u25bd\u2316\u2317\u25ce\u2299\u29e1\xb1")

_BOM_RE        = re.compile(r"\b(ITEM|QTY|QUANTITY|PART[\s\-]?NO|PART[\s\-]?NUMBER|P/N)\b")
_REVISION_RE   = re.compile(r"\b(REV(ISION)?|ECO|CHANGE[\s\-]?(NO|NUMBER|DESC)|LTR|ZONE)\b")
_TOLERANCE_RE  = re.compile(r"\b(TOLERANCE|COARSE|MEDIUM|FINE|ANGULAR|LINEAR)\b")
_TITLEBLOCK_RE = re.compile(r"\b(DRAWN|CHECKED|APPROVED|DWG[\s\-]?NO|DRAWING[\s\-]?NO|SCALE|SHEET|MATERIAL|FINISH|HARDNESS|TITLE)\b")


# ── Main entry point ───────────────────────────────────────────────────────────

def extract(pdf_bytes: bytes) -> dict[str, Any]:
    doc  = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]

    try:
        raw_tables = page.find_tables().tables
    except Exception as exc:
        print(f"[table-detect] find_tables failed: {exc}")
        return {"entities": [], "tables": [], "stats": {"table_transformer": 0}}

    entities:   list[dict] = []
    tables_out: list[dict] = []

    for idx, tab in enumerate(raw_tables):
        x0, y0, x1, y1 = tab.bbox
        w, h = x1 - x0, y1 - y0

        if w * h < MIN_TABLE_AREA or w * h > MAX_TABLE_AREA:
            continue

        table_data = _extract_cells(tab)
        n_rows = len(table_data)

        # Single-row tables: only keep if they look like FCF/GD&T frames
        if n_rows < MIN_ROWS:
            first_cell = (table_data[0][0] if table_data and table_data[0] else "").strip()
            if not any(s in first_cell for s in GDT_SYMBOLS):
                continue

        # Classify by reading the first few rows
        header_text = " ".join(
            c for row in table_data[:3] for c in row if c
        ).upper()

        category = _classify(header_text)

        # FCF override: small table (≤3 rows), first cell is a GD&T symbol
        if n_rows <= 3 and any(s in first_cell for s in GDT_SYMBOLS):
            category = "gdt"
        n_cols = max((len(r) for r in table_data), default=0)

        # Confidence: heuristic based on classification certainty
        confidence = 0.95 if category != "table" else 0.75

        entity: dict[str, Any] = {
            "id":         f"tdet-{idx}",
            "source":     "table_transformer",
            "category":   category,
            "text":       _table_preview(table_data),
            "bbox":       {"x": x0, "y": y0, "width": w, "height": h},
            "confidence": confidence,
            "meta": {
                "tableData": table_data,
                "rowCount":  n_rows,
                "colCount":  n_cols,
            },
        }

        if category == "table" or n_rows >= 5:
            tables_out.append(entity)
        else:
            entities.append(entity)

    total = len(entities) + len(tables_out)
    print(f"[table-detect] {total} tables found ({len(entities)} classified, {len(tables_out)} large)")

    return {
        "entities": entities,
        "tables":   tables_out,
        "stats":    {"table_transformer": total},
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_cells(tab) -> list[list[str]]:
    """Convert PyMuPDF Table to list[list[str]]."""
    try:
        return [
            [("" if cell is None else str(cell).strip()) for cell in row]
            for row in tab.extract()
        ]
    except Exception:
        return []


def _classify(header_text: str) -> str:
    if _BOM_RE.search(header_text):
        return "bom"
    if _REVISION_RE.search(header_text):
        return "revision"
    if _TOLERANCE_RE.search(header_text):
        return "tolerance_table"
    if _TITLEBLOCK_RE.search(header_text):
        return "titleblock"
    return "table"


def _table_preview(table_data: list[list[str]], max_rows: int = 4) -> str:
    return "\n".join(
        " | ".join(c for c in row if c)
        for row in table_data[:max_rows]
        if any(row)
    )
