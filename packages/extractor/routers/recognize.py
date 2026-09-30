"""
Recognize: deterministic characteristic extraction from a stored drawing revision.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import DrawingRevision, get_session
from recognize.pipeline import recognize

router = APIRouter(prefix="/api", tags=["recognize"])


class RecognizeRequest(BaseModel):
    pages: list[int] | None = None
    region: dict[str, float] | None = None  # x, y, w, h in page points; window re-extract
    relaxed: bool = False  # inside a window, take everything that reads as a value
    units: str = "mm"
    existing: list[dict[str, Any]] = []  # {page, bbox} of characteristics already on the sheet


@router.post("/revisions/{revision_id}/recognize")
def recognize_revision(revision_id: str, body: RecognizeRequest) -> dict[str, Any]:
    with get_session() as s:
        rev = s.get(DrawingRevision, revision_id)
        if not rev:
            raise HTTPException(404, "Revision not found")
        pdf_bytes = rev.pdf
    try:
        return recognize(pdf_bytes, pages=body.pages, region=body.region, relaxed=body.relaxed, units=body.units, existing_bboxes=body.existing)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Recognize failed: {exc}") from exc
