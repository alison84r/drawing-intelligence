"""What the model is asked, and how its answer is checked before anyone sees it."""
from __future__ import annotations

import json
import re
from typing import Any

PROMPTS = {
    "tolerance_table": (
        "This image is cropped from an engineering drawing. It should show the general tolerance statement or table "
        "(tolerances that apply when a dimension has none printed). Read it exactly as printed. Do not guess or fill gaps.\n"
        "Answer with JSON only:\n"
        '{"found": true|false, "standard": "e.g. ISO 2768-1 or empty", "class": "f|m|c|v or empty", '
        '"linear": [[from, to, plus_minus], ...] for size-range rows, '
        '"decimals": {"0": tol, "1": tol, "2": tol, "3": tol} for X / X.X / X.XX / X.XXX rows, '
        '"angular": number or null, "units": "mm|in or empty", "notes": "anything relevant, short"}'
    ),
    "title_block": (
        "This image is cropped from the title block of an engineering drawing. Read the fields exactly as printed. "
        "Leave a field empty when it is not there. Do not guess.\n"
        "Answer with JSON only:\n"
        '{"found": true|false, "partNumber": "", "partName": "", "drawingNumber": "", "revision": "", "material": "", '
        '"scale": "", "units": "mm|in or empty", "generalTolerance": "the general tolerance note if printed, else empty"}'
    ),
}

TEXT_FIELDS = ("partNumber", "partName", "drawingNumber", "revision", "material", "scale", "units", "generalTolerance", "standard", "class", "notes")


def _number(v: Any) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if 0 <= f < 1e6 else None


def parse_answer(task: str, raw: str) -> dict[str, Any]:
    """The model's reply as checked fields. Anything malformed is dropped rather than passed on."""
    match = re.search(r"\{.*\}", raw, flags=re.S)
    try:
        data = json.loads(match.group(0)) if match else {}
    except json.JSONDecodeError:
        data = {}
    if not isinstance(data, dict):
        data = {}
    out: dict[str, Any] = {"found": bool(data.get("found"))}
    for name in TEXT_FIELDS:
        if isinstance(data.get(name), (str, int, float)):
            out[name] = str(data[name]).strip()[:200]
    if task == "tolerance_table":
        rows = []
        for row in data.get("linear") or []:
            if isinstance(row, (list, tuple)) and len(row) == 3:
                lo, hi, tol = (_number(x) for x in row)
                if lo is not None and hi is not None and tol is not None and hi > lo and tol > 0:
                    rows.append([lo, hi, tol])
        out["linear"] = sorted(rows)
        decimals = {}
        for places, tol in (data.get("decimals") or {}).items() if isinstance(data.get("decimals"), dict) else []:
            t = _number(tol)
            if str(places) in ("0", "1", "2", "3") and t:
                decimals[str(places)] = t
        out["decimals"] = decimals
        out["angular"] = _number(data.get("angular"))
        if out.get("class") not in ("f", "m", "c", "v"):
            out["class"] = ""
        out["found"] = out["found"] and bool(rows or decimals or out.get("standard"))
    return out
