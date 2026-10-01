"""
Second readers for a model's answer.

A value read from a picture is trusted only when an independent reader saw the same characters in the same crop:
    cad  the exact text stored in the PDF inside the region (when the region is not a picture)
    ocr  a local OCR engine reading the crop's pixels
The model decides which text is which field; these readers only confirm that the characters are really there.
Confusable characters (O/0, I/1) are deliberately not folded together: that is exactly the error to catch.
"""
from __future__ import annotations

import io
import re
import threading
from difflib import SequenceMatcher
from typing import Any

import pdfplumber

from tolerance.standards import ISO_2768_LINEAR

NUMBER = re.compile(r"\d+(?:\.\d+)?")
_engine: Any = None
_engine_lock = threading.Lock()


def norm(text: str) -> str:
    """Letters, digits and decimal points only: OCR drops spaces and underscores, so they cannot count."""
    return re.sub(r"[^A-Z0-9.]", "", str(text).upper())


def ocr_available() -> bool:
    try:
        import rapidocr_onnxruntime  # noqa: F401
    except Exception:  # noqa: BLE001
        return False
    return True


def ocr_text(image_png: bytes) -> str | None:
    """Every line the OCR engine reads in the crop, top to bottom; None when the engine is not installed or fails."""
    global _engine
    try:
        from rapidocr_onnxruntime import RapidOCR

        with _engine_lock:  # one engine, one read at a time: the models are loaded once
            if _engine is None:
                _engine = RapidOCR()
            result, _ = _engine(image_png)
    except Exception:  # noqa: BLE001 - a missing or failing second reader leaves values unconfirmed, never wrong
        return None
    lines = sorted(result or [], key=lambda r: (round(r[0][0][1] / 12), r[0][0][0]))
    return "\n".join(str(r[1]) for r in lines)


def cad_text(pdf_bytes: bytes, page_index: int, region: dict[str, float]) -> str:
    """The characters the PDF itself stores inside the region. Empty for a picture."""
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            page = pdf.pages[page_index]
            x0, y0 = max(0.0, region["x"]), max(0.0, region["y"])
            x1, y1 = min(float(page.width), region["x"] + region["w"]), min(float(page.height), region["y"] + region["h"])
            return page.crop((x0, y0, x1, y1)).extract_text() or ""
    except Exception:  # noqa: BLE001
        return ""


def check_text(value: str, readers: dict[str, str]) -> dict[str, Any]:
    """
    agree    a second reader has exactly these characters
    differs  a second reader has something close but not the same: both are shown, a person picks
    single   no second reader saw anything like it
    """
    want = norm(value)
    if len(want) < 3:
        return {"status": "single", "reader": None, "seen": ""}  # too short to tell from coincidence
    near: tuple[float, str, str] | None = None
    for name, text in readers.items():
        have = norm(text)
        if not have:
            continue
        if want in have:
            return {"status": "agree", "reader": name, "seen": ""}
        m = SequenceMatcher(None, have, want, autojunk=False)
        block = max(m.get_matching_blocks(), key=lambda b: b.size)
        start = max(0, block.a - block.b)
        window = have[start : start + len(want)]
        ratio = SequenceMatcher(None, window, want, autojunk=False).ratio()
        if near is None or ratio > near[0]:
            near = (ratio, name, window)
    if near and near[0] >= 0.8:
        return {"status": "differs", "reader": near[1], "seen": near[2]}
    return {"status": "single", "reader": None, "seen": ""}


def check_numbers(values: list[float], readers: dict[str, str]) -> dict[str, Any]:
    """Every number must be printed in the crop according to a second reader."""
    for name, text in readers.items():
        seen = {round(float(n), 6) for n in NUMBER.findall(text)}
        if seen and all(round(float(v), 6) in seen for v in values):
            return {"status": "agree", "reader": name, "seen": ""}
    return {"status": "single", "reader": None, "seen": ""}


def standard_class(linear: list[list[float]]) -> str:
    """The ISO 2768-1 class whose table contains every row read, or ''."""
    for cls, table in ISO_2768_LINEAR.items():
        rows = {(float(lo), float(hi)): float(tol) for lo, hi, tol in table}
        if linear and all(rows.get((float(lo), float(hi))) == float(tol) for lo, hi, tol in linear):
            return cls
    return ""


def verify(task: str, fields: dict[str, Any], readers: dict[str, str]) -> dict[str, dict[str, Any]]:
    """One check per value the model returned."""
    checks: dict[str, dict[str, Any]] = {}
    for name, value in fields.items():
        if isinstance(value, str) and value and name not in ("units", "class", "notes"):
            checks[name] = check_text(value, readers)
    if task == "tolerance_table":
        rows = fields.get("linear") or []
        if rows:
            checks["linear"] = check_numbers([n for row in rows for n in row], readers)
            cls = standard_class(rows)
            if cls:
                checks["linear"]["standardClass"] = cls  # a third, independent confirmation: the published table
        decimals = fields.get("decimals") or {}
        if decimals:
            checks["decimals"] = check_numbers(list(decimals.values()), readers)
        if fields.get("angular") is not None:
            checks["angular"] = check_numbers([fields["angular"]], readers)
    return checks
