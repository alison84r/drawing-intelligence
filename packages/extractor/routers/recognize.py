"""
Recognize: deterministic characteristic extraction from a stored drawing revision.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import DrawingRevision, RevisionScene, get_session
from recognize.intake import RECOGNIZER_VERSION, intake
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
        out = recognize(pdf_bytes, pages=body.pages, region=body.region, relaxed=body.relaxed, units=body.units, existing_bboxes=body.existing)
        out["recognizerVersion"] = RECOGNIZER_VERSION
        if body.region is None and body.pages is None:
            # Keep what was read on this revision, so reopening shows it and audits can cite it.
            stored = {"pages": [{k: v for k, v in p.items() if k != "characteristics"} | {"characteristics": []} for p in out["pages"]]}
            with get_session() as s:
                row = s.get(RevisionScene, revision_id)
                if row:
                    row.recognizer_version, row.payload = RECOGNIZER_VERSION, stored
                else:
                    s.add(RevisionScene(revision_id=revision_id, recognizer_version=RECOGNIZER_VERSION, payload=stored))
                s.commit()
        return out
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Recognize failed: {exc}") from exc


@router.get("/revisions/{revision_id}/intake")
def intake_revision(revision_id: str) -> dict[str, Any]:
    """Can this drawing be recognised, and what should the inspector watch for?"""
    with get_session() as s:
        rev = s.get(DrawingRevision, revision_id)
        if not rev:
            raise HTTPException(404, "Revision not found")
        pdf_bytes = rev.pdf
    try:
        return intake(pdf_bytes)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Intake check failed: {exc}") from exc


@router.get("/revisions/{revision_id}/scene")
def revision_scene(revision_id: str) -> dict[str, Any]:
    """The stored recognizer scene for a revision, or {pages: []} when Recognize has not run on it."""
    with get_session() as s:
        row = s.get(RevisionScene, revision_id)
        if not row:
            return {"pages": [], "recognizerVersion": None, "current": RECOGNIZER_VERSION}
        return {**row.payload, "recognizerVersion": row.recognizer_version, "current": RECOGNIZER_VERSION, "storedAt": row.created_at.isoformat()}
