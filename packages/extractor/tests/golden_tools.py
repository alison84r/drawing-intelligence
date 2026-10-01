"""
Golden set for the Recognize pass.

Each golden file lists the characteristics a drawing must yield. `score` compares a fresh run with it:
found (right place, right content), wrong (right place, different content), missed, extra.

    python tests/golden_tools.py score            # table for every drawing
    python tests/golden_tools.py freeze <key>     # write the current output as the new truth (after review!)

Drawings are customer documents and stay outside the repository: set DI_DRAWINGS_DIR.
"""
from __future__ import annotations

import io
import json
import math
import os
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent))

from recognize.pipeline import recognize  # noqa: E402

GOLDEN = HERE / "golden"
DRAWINGS = Path(os.environ.get("DI_DRAWINGS_DIR", r"C:/Users/Dell/OneDrive/BrainstormingMVP_IDEAS/Drawings"))
FILES = {
    "heatsink": "01270007-01_heat-sink-plate (1) (1).pdf",
    "b1100": "18_1100_011.pdf",
    "b1120": "18_1120_001.pdf",
    "b1124": "18_1124_000.pdf",
    "b1208": "18_1208_002.pdf",
    "b1209": "18_1209_001.pdf",
    "cmp1": "COMPARISON  REVISIONS_DATAVERSION_V1.pdf",
    "cmp2": "COMPARISON  REVISIONS_DATAVERSION_V2.pdf",
}
FIELDS = ("specification", "descriptionType", "toleranceType", "nominal", "tolHigh", "tolLow", "count", "designator", "zone")


def slim(c: dict[str, Any]) -> dict[str, Any]:
    out = {k: c.get(k) for k in FIELDS}
    out["gdt"] = c.get("gdt")
    out["at"] = [round(c["bbox"]["x"] + c["bbox"]["w"] / 2, 1), round(c["bbox"]["y"] + c["bbox"]["h"] / 2, 1)]
    return out


def run(key: str) -> list[dict[str, Any]]:
    data = (DRAWINGS / FILES[key]).read_bytes()
    pages = recognize(data)["pages"]
    return [slim(c) | {"page": p["page"]} for p in pages for c in p["characteristics"]]


def freeze(key: str, verified: bool) -> None:
    GOLDEN.mkdir(exist_ok=True)
    body = {"drawing": FILES[key], "verifiedByEye": verified, "characteristics": run(key)}
    (GOLDEN / f"{key}.json").write_text(json.dumps(body, indent=1, ensure_ascii=False), encoding="utf-8")


def score(key: str) -> dict[str, Any]:
    truth = json.loads((GOLDEN / f"{key}.json").read_text(encoding="utf-8"))["characteristics"]
    got = run(key)
    used: set[int] = set()
    found, wrong, missed = 0, [], []
    for t in truth:
        best, best_d = None, 14.0
        for i, g in enumerate(got):
            if i in used or g["page"] != t.get("page", 0):
                continue
            d = math.hypot(g["at"][0] - t["at"][0], g["at"][1] - t["at"][1])
            if d < best_d:
                best, best_d = i, d
        if best is None:
            missed.append(t["specification"])
            continue
        used.add(best)
        g = got[best]
        diff = [k for k in FIELDS + ("gdt",) if g.get(k) != t.get(k)]
        if diff:
            wrong.append(f"{t['specification']} -> {g['specification']} ({', '.join(diff)})")
        else:
            found += 1
    extra = [g["specification"] for i, g in enumerate(got) if i not in used]
    return {"key": key, "expected": len(truth), "found": found, "wrong": wrong, "missed": missed, "extra": extra}


def main(argv: list[str]) -> int:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    cmd = argv[1] if len(argv) > 1 else "score"
    if cmd == "freeze":
        for key in argv[2:]:
            verified = not key.endswith("?")
            freeze(key.rstrip("?"), verified)
            print("frozen", key)
        return 0
    bad = 0
    print(f"{'drawing':10} {'expected':>8} {'found':>6} {'wrong':>6} {'missed':>7} {'extra':>6}")
    for key in sorted(p.stem for p in GOLDEN.glob("*.json")):
        if not (DRAWINGS / FILES[key]).exists():
            print(f"{key:10} drawing not available")
            continue
        r = score(key)
        print(f"{key:10} {r['expected']:8} {r['found']:6} {len(r['wrong']):6} {len(r['missed']):7} {len(r['extra']):6}")
        for label in ("wrong", "missed", "extra"):
            for item in r[label]:
                print(f"     {label}: {item}")
        bad += len(r["wrong"]) + len(r["missed"]) + len(r["extra"])
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
