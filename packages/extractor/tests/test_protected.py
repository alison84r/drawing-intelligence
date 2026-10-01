"""No balloons in the title block or under a picture, whichever tool asks."""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from recognize.pipeline import recognize

HEAT_SINK = Path(__file__).resolve().parents[4] / "Drawings" / "01270007-01_heat-sink-plate (1) (1).pdf"
pytestmark = pytest.mark.skipif(not HEAT_SINK.exists(), reason="sample drawings not present")


@pytest.fixture(scope="module")
def pdf() -> bytes:
    return HEAT_SINK.read_bytes()


def test_title_block_is_found(pdf):
    page = recognize(pdf)["pages"][0]
    blocks = [p for p in page["protected"] if p["kind"] == "title_block"]
    assert blocks and all(b["bbox"]["y"] > 0.7 * page["height"] for b in blocks)


def test_window_over_the_title_block_places_nothing(pdf):
    page = recognize(pdf)["pages"][0]
    b = max((p for p in page["protected"] if p["kind"] == "title_block"), key=lambda p: p["bbox"]["w"] * p["bbox"]["h"])["bbox"]
    region = {"x": b["x"] - 20, "y": b["y"] - 20, "w": b["w"] + 40, "h": b["h"] + 40}
    out = recognize(pdf, region=region, relaxed=True)["pages"][0]
    assert out["characteristics"] == []
    assert out["withheld"]["title_block"] + out["withheld"]["picture"] > 0
    assert not any(t["guess"] for t in out["tokens"])  # not even offered


def test_window_over_a_table_offers_but_does_not_place(pdf):
    page = recognize(pdf)["pages"][0]
    # The general tolerance table at the bottom left: merged cells, missed by the plain table finder.
    tables = [p["bbox"] for p in page["protected"] if p["kind"] == "table" and p["bbox"]["w"] > 200 and p["bbox"]["y"] > 0.8 * page["height"]]
    assert tables
    out = recognize(pdf, region=tables[0], relaxed=True)["pages"][0]
    assert out["characteristics"] == [] and out["withheld"]["table"] > 0
    assert any(t["guess"] for t in out["tokens"])  # offered for picking


def test_window_over_a_view_still_places_balloons(pdf):
    page = recognize(pdf)["pages"][0]
    view = next(v for v in page["views"] if v["callouts"] >= 20)["bbox"]
    out = recognize(pdf, region={"x": view["x"] - 150, "y": view["y"] - 150, "w": view["w"] + 300, "h": view["h"] + 300}, relaxed=True)["pages"][0]
    assert len(out["characteristics"]) >= 10


def test_vector_title_block_is_protected_too():
    """A title block drawn as text and rules (no picture): a window over it places nothing."""
    path = HEAT_SINK.parent / "18_1209_001.pdf"
    if not path.exists():
        pytest.skip("sample drawing not present")
    data = path.read_bytes()
    page = recognize(data)["pages"][0]
    blocks = [p["bbox"] for p in page["protected"] if p["kind"] == "title_block" and p["bbox"]["w"] > 200]
    assert blocks
    region = {"x": 0.55 * page["width"], "y": 0.8 * page["height"], "w": 0.45 * page["width"], "h": 0.2 * page["height"]}
    out = recognize(data, region=region, relaxed=True)["pages"][0]
    assert out["withheld"]["title_block"] > 0
    # Real dimensions near the corner may be placed; nothing that reads like title-block text is.
    assert not any(re.search(r"SHEET|WEIGHT|VOLUME|DRAWN|CHECKED|APPROVED|SCALE|MATERIAL", c["specification"], re.I) for c in out["characteristics"])
    for c in out["characteristics"]:
        cx, cy = c["bbox"]["x"] + c["bbox"]["w"] / 2, c["bbox"]["y"] + c["bbox"]["h"] / 2
        assert not any(b["x"] + 0.1 * b["w"] <= cx <= b["x"] + 0.9 * b["w"] and b["y"] + 0.25 * b["h"] <= cy <= b["y"] + b["h"] for b in blocks)


def test_text_hidden_under_a_white_patch_is_never_read(pdf):
    """The heat sink keeps an old revision table in the file, covered by a white rectangle."""
    w = recognize(pdf, region={"x": 794, "y": 950, "w": 871, "h": 95}, relaxed=True)["pages"][0]
    assert w["characteristics"] == []
    assert any(t["reason"] == "in the file but not visible on the drawing" for t in w["tokens"])
