"""
Score the recognizer against answer keys that were checked by eye.

    python tests/score_keys.py            # table per sheet and totals
    python tests/score_keys.py --json     # the same as JSON, for comparing runs

A key lists every requirement on the views of a drawing as an inspector would balloon it. For each one:
    found      exactly one balloon sits on it, and a feature control frame was read as one
    wrong      one balloon, but its content is not what the drawing says (a frame read as a plain value)
    split      several balloons on what is one requirement
    merged     its balloon also covers another requirement
    suggested  no balloon, only an amber suggestion
    missed     nothing
Balloons that sit on no requirement are "extra".

Two percentages follow. Found: requirements found out of all requirements (does the inspector have to add or fix).
Clean: balloons that are right out of all balloons placed (does the inspector have to delete or merge).
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent))

from recognize.pipeline import recognize  # noqa: E402

KEYS = HERE / "answer_keys"
DRAWINGS = Path(os.environ.get("DI_DRAWINGS_DIR", r"C:/Users/Dell/OneDrive/BrainstormingMVP_IDEAS/Drawings"))
STATES = ("found", "wrong", "split", "merged", "suggested", "missed")


def _centre(b: dict[str, float]) -> tuple[float, float]:
    return b["x"] + b["w"] / 2, b["y"] + b["h"] / 2


def _inside(p: tuple[float, float], box: list[float], pad: float = 2.0) -> bool:
    return box[0] - pad <= p[0] <= box[2] + pad and box[1] - pad <= p[1] <= box[3] + pad


def score_sheet(entries: list[dict[str, Any]], page: dict[str, Any]) -> dict[str, Any]:
    balloons = [c for c in page["characteristics"] if c["descriptionType"] != "Note"]
    guesses = list({t["guess"]["id"]: t["guess"] for t in page["tokens"] if t["guess"]}.values())
    on: list[list[int]] = [[i for i, c in enumerate(balloons) if _inside(_centre(c["bbox"]), e["bbox"])] for e in entries]
    owners: dict[int, int] = {}
    for hits in on:
        for i in hits:
            owners[i] = owners.get(i, 0) + 1
    # A balloon whose own box spans two requirements has merged them, even if its centre sits on one.
    for i, c in enumerate(balloons):
        b = c["bbox"]
        covered = sum(1 for e in entries if b["x"] - 2 <= e["bbox"][0] and e["bbox"][2] <= b["x"] + b["w"] + 2 and b["y"] - 2 <= e["bbox"][1] and e["bbox"][3] <= b["y"] + b["h"] + 2)
        if covered >= 2:
            owners[i] = max(owners.get(i, 0), covered)
    counts = dict.fromkeys(STATES, 0)
    details = []
    ids = [c["id"] for c in balloons]
    for e, hits in zip(entries, on):
        b = e["bbox"]
        here = {ids[i] for i in hits}
        # A callout is one balloon however many sub-rows it carries (7, 7.1): only first rows are counted.
        roots = [i for i in hits if balloons[i].get("subOf") not in here]
        spanning = [i for i, c in enumerate(balloons) if owners.get(i, 0) >= 2 and c["bbox"]["x"] - 2 <= b[0] and b[2] <= c["bbox"]["x"] + c["bbox"]["w"] + 2
                    and c["bbox"]["y"] - 2 <= b[1] and b[3] <= c["bbox"]["y"] + c["bbox"]["h"] + 2]
        if spanning or any(owners.get(i, 0) >= 2 for i in hits):
            state = "merged"
        elif len(roots) > 1:
            state = "split"
        elif len(roots) == 1:
            c = balloons[roots[0]]
            unread = e.get("gdt") and (c.get("toleranceType") != "GD&T" or (c.get("gdt") or {}).get("symbol") in (None, "", "?"))
            state = "wrong" if unread else "found"
        else:
            state = "suggested" if any(_inside(_centre(g["bbox"]), b) for g in guesses) else "missed"
        counts[state] += 1
        if state != "found":
            details.append(f"{state}: {e['text'][:44]}")
    extra = [c for i, c in enumerate(balloons) if owners.get(i, 0) == 0 and not c.get("subOf")]
    for c in extra:
        details.append(f"extra: {c['specification'][:44]}")
    right = counts["found"]
    return {"requirements": len(entries), **counts, "balloons": sum(1 for c in balloons if not c.get("subOf")), "extra": len(extra), "right": right, "details": details}


def score_all() -> dict[str, Any]:
    out: dict[str, Any] = {"sheets": {}}
    total = {"requirements": 0, **dict.fromkeys(STATES, 0), "balloons": 0, "extra": 0}
    for path in sorted(KEYS.glob("*.json")):
        key = json.loads(path.read_text(encoding="utf-8"))
        pdf = DRAWINGS / key["drawing"]
        if not pdf.exists():
            continue
        pages = {p["page"]: p for p in recognize(pdf.read_bytes(), pages=[int(s) for s in key["sheets"]])["pages"]}
        for sheet, entries in key["sheets"].items():
            res = score_sheet(entries, pages[int(sheet)])
            out["sheets"][f"{path.stem} s{int(sheet) + 1}"] = res
            for k in total:
                total[k] += res[k]
    total["foundPct"] = round(100 * total["found"] / max(1, total["requirements"]), 1)
    total["cleanPct"] = round(100 * total["found"] / max(1, total["balloons"]), 1)
    out["total"] = total
    return out


def main() -> None:
    res = score_all()
    if "--json" in sys.argv:
        print(json.dumps(res, indent=1, ensure_ascii=False))
        return
    print(f"{'sheet':10s} {'req':>4s} {'found':>5s} {'wrong':>5s} {'split':>5s} {'merged':>6s} {'sugg':>4s} {'miss':>4s} | {'balloons':>8s} {'extra':>5s}")
    for name, r in res["sheets"].items():
        print(f"{name:10s} {r['requirements']:4d} {r['found']:5d} {r['wrong']:5d} {r['split']:5d} {r['merged']:6d} {r['suggested']:4d} {r['missed']:4d} | {r['balloons']:8d} {r['extra']:5d}")
        if "-v" in sys.argv:
            for d in r["details"]:
                print("      ", d)
    t = res["total"]
    print(f"{'TOTAL':10s} {t['requirements']:4d} {t['found']:5d} {t['wrong']:5d} {t['split']:5d} {t['merged']:6d} {t['suggested']:4d} {t['missed']:4d} | {t['balloons']:8d} {t['extra']:5d}")
    print(f"\nFound: {t['foundPct']}% of requirements have exactly one right balloon.   Clean: {t['cleanPct']}% of balloons placed are right.")


if __name__ == "__main__":
    main()
