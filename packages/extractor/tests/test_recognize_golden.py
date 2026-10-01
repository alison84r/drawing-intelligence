"""Every recognizer change must reproduce the golden set exactly. Run: python -m pytest tests -q"""
from __future__ import annotations

import pytest

from golden_tools import DRAWINGS, FILES, GOLDEN, score

KEYS = sorted(p.stem for p in GOLDEN.glob("*.json"))


@pytest.mark.parametrize("key", KEYS)
def test_golden(key: str) -> None:
    if not (DRAWINGS / FILES[key]).exists():
        pytest.skip("drawing not available on this machine")
    r = score(key)
    assert not r["missed"], f"missed: {r['missed']}"
    assert not r["wrong"], f"wrong: {r['wrong']}"
    assert not r["extra"], f"extra: {r['extra']}"
    assert r["found"] == r["expected"]
