"""Which parts of a sheet are worth asking about, and the crop that would be sent. Nothing here leaves the machine."""
from __future__ import annotations

import io
from typing import Any

import fitz  # PyMuPDF (demo build; replaced with the permissive renderer before shipping)
import pdfplumber

MAX_SIDE_PX = 1600


def candidates(pdf_bytes: bytes, page_index: int) -> list[dict[str, Any]]:
    """Pictures embedded in the sheet (their text cannot be read) and ruled tables, largest first."""
    out: list[dict[str, Any]] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        if not 0 <= page_index < len(pdf.pages):
            return out
        page = pdf.pages[page_index]
        width, height = float(page.width), float(page.height)
        area = width * height or 1.0
        for im in page.images:
            x0, y0, x1, y1 = float(im["x0"]), float(im["top"]), float(im["x1"]), float(im["bottom"])
            if 0.004 * area <= (x1 - x0) * (y1 - y0) <= 0.6 * area:
                out.append({"kind": "picture", "bbox": {"x": round(x0, 1), "y": round(y0, 1), "w": round(x1 - x0, 1), "h": round(y1 - y0, 1)}})
        try:
            for tb in page.find_tables():
                x0, y0, x1, y1 = (float(v) for v in tb.bbox)
                if 0.004 * area <= (x1 - x0) * (y1 - y0) <= 0.25 * area and len(tb.rows) >= 2:
                    out.append({"kind": "table", "bbox": {"x": round(x0, 1), "y": round(y0, 1), "w": round(x1 - x0, 1), "h": round(y1 - y0, 1)}})
        except Exception:  # noqa: BLE001 - table finding is best effort
            pass
    out.sort(key=lambda c: -(c["bbox"]["w"] * c["bbox"]["h"]))
    for i, c in enumerate(out):
        c["id"] = f"r{i + 1}"
    return out[:12]


def crop_png(pdf_bytes: bytes, page_index: int, region: dict[str, float]) -> bytes:
    """The region as a PNG, sharp enough to read and no larger than needed."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        if not 0 <= page_index < len(doc):
            raise ValueError("No such sheet")
        page = doc[page_index]
        clip = fitz.Rect(region["x"], region["y"], region["x"] + region["w"], region["y"] + region["h"]) & page.rect
        if clip.is_empty or clip.width < 8 or clip.height < 8:
            raise ValueError("The region is empty")
        zoom = min(4.0, MAX_SIDE_PX / max(clip.width, clip.height))
        return page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip, alpha=False).tobytes("png")
    finally:
        doc.close()
