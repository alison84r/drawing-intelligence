"""
pdfplumber extractor — words, tables, character metadata.

Coordinate system: top-left origin, y increases downward, units = PDF points.
This matches the SVG viewBox exactly (no transform needed).
"""
from __future__ import annotations
import uuid
from typing import Any
import pdfplumber
from .classifier import classify


def extract(pdf_bytes: bytes) -> dict[str, Any]:
    entities: list[dict] = []
    tables_out: list[dict] = []

    with pdfplumber.open(pdf_bytes) as pdf:
        page = pdf.pages[0]
        page_w = float(page.width)
        page_h = float(page.height)

        # ── Find table bounding boxes (for is_in_table detection) ────────────
        table_bboxes: list[tuple[float, float, float, float]] = []
        found_tables = page.find_tables()
        for ti, tbl in enumerate(found_tables):
            bb = tbl.bbox  # (x0, top, x1, bottom)
            table_bboxes.append(bb)

            # Full table entity
            try:
                rows = tbl.extract()
            except Exception:
                rows = []

            tables_out.append({
                "id": f"pp-table-{ti}",
                "source": "pdfplumber",
                "category": "table",
                "text": f"Table {ti + 1} ({len(rows)} rows)",
                "bbox": _bbox(bb[0], bb[1], bb[2], bb[3]),
                "confidence": 0.95,
                "meta": {
                    "tableIndex": ti,
                    "tableData": rows,
                    "rowCount": len(rows),
                    "colCount": len(rows[0]) if rows else 0,
                },
            })

        def _in_table(x0: float, top: float) -> bool:
            for bb in table_bboxes:
                if bb[0] <= x0 <= bb[2] and bb[1] <= top <= bb[3]:
                    return True
            return False

        # ── Word-level extraction ────────────────────────────────────────────
        words = page.extract_words(
            x_tolerance=3,
            y_tolerance=3,
            keep_blank_chars=False,
            use_text_flow=False,
            extra_attrs=["fontname", "size"],
        )

        for w in words:
            text = w.get("text", "").strip()
            if not text:
                continue

            x0 = float(w.get("x0", 0))
            top = float(w.get("top", 0))
            x1 = float(w.get("x1", 0))
            bottom = float(w.get("bottom", 0))
            font_size = float(w.get("size", 0) or 0)

            in_tbl = _in_table(x0, top)
            category, confidence = classify(text, font_size, in_tbl)

            entities.append({
                "id": f"pp-{uuid.uuid4().hex[:8]}",
                "source": "pdfplumber",
                "category": category,
                "text": text,
                "bbox": _bbox(x0, top, x1, bottom),
                "confidence": round(confidence, 3),
                "meta": {
                    "fontSize": round(font_size, 2),
                    "fontName": w.get("fontname", ""),
                },
            })

    return {
        "pageWidth": page_w,
        "pageHeight": page_h,
        "entities": entities,
        "tables": tables_out,
        "stats": {"pdfplumber": len(entities), "tables": len(tables_out)},
    }


def _bbox(x0: float, top: float, x1: float, bottom: float) -> dict:
    return {
        "x": round(x0, 3),
        "y": round(top, 3),
        "width": round(max(x1 - x0, 1), 3),
        "height": round(max(bottom - top, 1), 3),
    }
