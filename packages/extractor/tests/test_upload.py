"""Upload checks: the file type is decided by content, and every refusal has a plain reason."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from routers import library


def _reason(data: bytes) -> tuple[int, str]:
    with pytest.raises(HTTPException) as err:
        library._inspect_pdf(data)
    return err.value.status_code, str(err.value.detail)


def test_empty_file_is_refused():
    assert _reason(b"") == (400, "The file is empty")


def test_non_pdf_is_refused_by_content():
    code, text = _reason(b"PK\x03\x04 this is a zip renamed to .pdf")
    assert code == 415 and "not a PDF" in text


def test_damaged_pdf_is_refused():
    code, text = _reason(b"%PDF-1.7\nnot really a pdf")
    assert code == 422 and "damaged" in text


def test_page_limit(monkeypatch):
    monkeypatch.setattr(library, "_page_sizes", lambda _b: [{"width": 1.0, "height": 1.0}] * (library.MAX_PAGES + 1))
    code, text = _reason(b"%PDF-1.7")
    assert code == 413 and "limit" in text


def test_password_protected(monkeypatch):
    class PDFPasswordIncorrect(Exception):
        pass

    def boom(_b):
        raise PDFPasswordIncorrect()

    monkeypatch.setattr(library, "_page_sizes", boom)
    code, text = _reason(b"%PDF-1.7")
    assert code == 422 and "password" in text


def test_part_number_from_file_name():
    assert library._guess_part_number("01270007-01_heat-sink-plate.pdf") == "01270007-01"
