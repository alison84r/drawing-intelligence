"""Assist: off unless configured, the key never shown, and a model's answer checked before anyone sees it."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from assist import config
from assist.tasks import parse_answer
from routers import assist as router


def _configure(monkeypatch, tmp_path, text=""):
    env = tmp_path / ".env"
    env.write_text(text, encoding="utf-8")
    monkeypatch.setattr(config, "ENV_FILE", env)
    for name in ("OPENROUTER_API_KEY", "DI_ASSIST_MODEL", "DI_ASSIST_PROVIDER"):
        monkeypatch.delenv(name, raising=False)


def test_off_without_a_key(monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path)
    s = config.settings()
    assert not s.enabled and "key" in s.reason


def test_off_without_a_model(monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path, "OPENROUTER_API_KEY=sk-test\n")
    assert not config.settings().enabled


def test_on_from_env_file_and_key_never_public(monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path, "OPENROUTER_API_KEY=sk-test-secret\nDI_ASSIST_MODEL=vendor/model\n")
    s = config.settings()
    assert s.enabled and s.model == "vendor/model"
    assert "sk-test-secret" not in str(s.public()) and s.public()["leavesMachine"] is True


def test_read_refused_when_off(monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path)
    body = router.ReadRequest(page=0, region=router.Region(x=0, y=0, w=10, h=10), task="title_block", consent=True)
    with pytest.raises(HTTPException) as err:
        router.assist_read("any", body)
    assert err.value.status_code == 503


def test_read_refused_without_consent(monkeypatch, tmp_path):
    _configure(monkeypatch, tmp_path, "OPENROUTER_API_KEY=sk-test\nDI_ASSIST_MODEL=vendor/model\n")
    body = router.ReadRequest(page=0, region=router.Region(x=0, y=0, w=10, h=10), task="title_block")
    with pytest.raises(HTTPException) as err:
        router.assist_read("any", body)
    assert err.value.status_code == 403


def test_tolerance_answer_is_checked():
    raw = 'Here you go: {"found": true, "standard": "ISO 2768-1", "class": "m", "linear": [[0.5, 3, 0.1], [3, 6, "0.1"], [6, 3, 0.2], ["a", 1, 2], [30, 120, -1]], "angular": "0.5", "decimals": {"1": 0.2, "9": 1}}'
    out = parse_answer("tolerance_table", raw)
    assert out["found"] and out["class"] == "m"
    assert out["linear"] == [[0.5, 3.0, 0.1], [3.0, 6.0, 0.1]]  # reversed range, text and negative rows are dropped
    assert out["decimals"] == {"1": 0.2} and out["angular"] == 0.5


def test_nonsense_answer_is_not_found():
    assert parse_answer("tolerance_table", "I cannot read this image.") == {"found": False, "linear": [], "decimals": {}, "angular": None, "class": ""}
    assert parse_answer("title_block", '{"found": true, "partNumber": 18120001, "extra": {"x": 1}}') == {"found": True, "partNumber": "18120001"}
