"""
The answer keys (tests/answer_keys) were checked by eye: every requirement on the views of seven customer-style
drawings. The recognizer must not fall back below the level reached on them. Run: python -m pytest tests -q
"""
from __future__ import annotations

import pytest

from score_keys import DRAWINGS, KEYS, score_all

import json


def _available() -> bool:
    return all((DRAWINGS / json.loads(p.read_text(encoding="utf-8"))["drawing"]).exists() for p in KEYS.glob("*.json"))


@pytest.fixture(scope="module")
def total() -> dict:
    if not _available():
        pytest.skip("drawings not available on this machine")
    return score_all()["total"]


def test_one_callout_one_balloon(total: dict) -> None:
    assert total["split"] == 0, "a callout was split into several balloons"


def test_frames_are_read_as_frames(total: dict) -> None:
    assert total["wrong"] == 0, "a feature control frame was read as a plain value"


def test_found_rate_does_not_fall(total: dict) -> None:
    assert total["requirements"] == 208
    assert total["found"] >= 204, f"found {total['found']} of 208"
    assert total["extra"] <= 1
