"""Which parts of a sheet are worth asking about, and the crop that would be sent. Nothing here leaves the machine."""
from __future__ import annotations

from typing import Any

import fitz  # PyMuPDF (demo build; replaced with the permissive renderer before shipping)

MAX_SIDE_PX = 1600


def _contains(outer: dict[str, float], inner: dict[str, float]) -> bool:
    return (outer["x"] <= inner["x"] + 1 and outer["y"] <= inner["y"] + 1
            and outer["x"] + outer["w"] >= inner["x"] + inner["w"] - 1 and outer["y"] + outer["h"] >= inner["y"] + inner["h"] - 1)


def candidates(pdf_bytes: bytes, page_index: int) -> list[dict[str, Any]]:
    """
    The regions of the sheet worth asking about, from the same detector the recognizer uses: pictures (their text
    cannot be read), the title block, and real tables. The sheet border and frames inside views are not offered.
    """
    from recognize.pipeline import recognize  # local import: the recognizer is heavy and only needed here

    pages = recognize(pdf_bytes, pages=[page_index])["pages"]
    if not pages:
        return []
    page = pages[0]
    grids = page.get("grids") or []
    out: list[dict[str, Any]] = []
    for r in page.get("protected") or []:
        box = r["bbox"]
        tolerance = any(g["kind"] == "tolerance" and _contains(box, g["bbox"]) for g in grids)
        if r.get("picture"):
            kind, label = "picture", "Title block (picture)" if r["kind"] == "title_block" else "Picture"
        else:
            kind, label = "table", "Tolerance table" if tolerance else "Title block" if r["kind"] == "title_block" else "Table"
        out.append({"kind": kind, "label": label, "task": "tolerance_table" if tolerance else "title_block" if r["kind"] == "title_block" else None, "bbox": box})
    # One entry per thing: a region inside a larger one of the same kind is the same thing.
    out = [c for c in out if not any(o is not c and o["kind"] == c["kind"] and _contains(o["bbox"], c["bbox"]) and o["bbox"] != c["bbox"] for o in out)]
    def overlap(a: dict[str, float], b: dict[str, float]) -> float:
        ix = max(0.0, min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"]))
        iy = max(0.0, min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"]))
        return ix * iy / max(1.0, min(a["w"] * a["h"], b["w"] * b["h"]))

    kept: list[dict[str, Any]] = []
    for c in sorted(out, key=lambda c: -(c["bbox"]["w"] * c["bbox"]["h"])):
        if not any(k["kind"] == c["kind"] and overlap(k["bbox"], c["bbox"]) > 0.6 for k in kept):
            kept.append(c)
    out = kept
    order = {"Tolerance table": 0, "Title block (picture)": 1, "Title block": 2, "Table": 3, "Picture": 4}
    out.sort(key=lambda c: (order.get(c["label"], 9), -(c["bbox"]["w"] * c["bbox"]["h"])))
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
