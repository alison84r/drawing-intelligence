"""
PyMuPDF (fitz) extractor — word blocks with font metadata and reading order.

PyMuPDF bbox format: (x0, y0, x1, y1) — top-left origin, matches SVG viewBox.
"""
from __future__ import annotations
import uuid
from typing import Any
import fitz  # PyMuPDF
from .classifier import classify


def extract(pdf_bytes: bytes) -> dict[str, Any]:
    entities: list[dict] = []

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    page_rect = page.rect  # (0, 0, width, height)
    page_w = float(page_rect.width)
    page_h = float(page_rect.height)

    # get_text("words") returns:
    # (x0, y0, x1, y1, word, block_no, line_no, word_no)
    words = page.get_text("words", sort=True)  # sort=True gives reading order

    # Also extract detailed dict for font metadata
    detail = page.get_text("dict", sort=True)
    # Build a lookup: approximate bbox → font info
    font_lookup: dict[str, dict] = {}
    for block in detail.get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                for char in span.get("chars", []):
                    key = f"{char['origin'][0]:.0f},{char['origin'][1]:.0f}"
                    font_lookup[key] = {
                        "fontName": span.get("font", ""),
                        "fontSize": round(span.get("size", 0), 2),
                        "flags": span.get("flags", 0),  # bold=16, italic=2
                        "color": span.get("color", 0),
                    }

    for word_tuple in words:
        x0, y0, x1, y1, text, *_ = word_tuple
        text = str(text).strip()
        if not text:
            continue

        # Look up font info from first char approximate position
        fkey = f"{x0:.0f},{y0:.0f}"
        finfo = font_lookup.get(fkey, {})
        font_size = finfo.get("fontSize", 0)

        category, confidence = classify(text, font_size)

        entities.append({
            "id": f"mu-{uuid.uuid4().hex[:8]}",
            "source": "pymupdf",
            "category": category,
            "text": text,
            "bbox": {
                "x": round(float(x0), 3),
                "y": round(float(y0), 3),
                "width": round(max(float(x1) - float(x0), 1), 3),
                "height": round(max(float(y1) - float(y0), 1), 3),
            },
            "confidence": round(confidence, 3),
            "meta": {
                "fontSize": font_size,
                "fontName": finfo.get("fontName", ""),
                "bold": bool(finfo.get("flags", 0) & 16),
                "italic": bool(finfo.get("flags", 0) & 2),
            },
        })

    doc.close()

    return {
        "pageWidth": page_w,
        "pageHeight": page_h,
        "entities": entities,
        "stats": {"pymupdf": len(entities)},
    }
