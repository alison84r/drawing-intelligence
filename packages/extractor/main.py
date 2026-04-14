"""
Drawing Intelligence — PDF Extraction Service
FastAPI microservice on port 8000.

POST /extract  — multipart PDF → ExtractionResult JSON
GET  /health   — liveness check (includes TATR model status)
"""
from __future__ import annotations
import io
from typing import Any

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from extractors import pdfplumber_extractor, pymupdf_extractor, table_transformer_extractor

app = FastAPI(title="Drawing Intelligence — PDF Extractor", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "pdf-extractor",
        "tatr_available": table_transformer_extractor.is_available(),
    }


@app.post("/extract")
async def extract(file: UploadFile = File(...)) -> dict[str, Any]:
    if not (file.filename or "").lower().endswith(".pdf"):
        ct = file.content_type or ""
        if "pdf" not in ct:
            raise HTTPException(400, "Only PDF files are supported")

    pdf_bytes = await file.read()

    if not pdf_bytes.startswith(b"%PDF"):
        raise HTTPException(400, "File does not appear to be a valid PDF")

    pdf_io = io.BytesIO(pdf_bytes)

    # ── pdfplumber ────────────────────────────────────────────────────────────
    try:
        pp_result = pdfplumber_extractor.extract(pdf_io)
    except Exception as e:
        raise HTTPException(500, f"pdfplumber extraction failed: {e}") from e

    pdf_io.seek(0)

    # ── PyMuPDF ───────────────────────────────────────────────────────────────
    try:
        mu_result = pymupdf_extractor.extract(pdf_bytes)
    except Exception as e:
        raise HTTPException(500, f"PyMuPDF extraction failed: {e}") from e

    # ── Table Transformer (optional — silent failure keeps other results) ─────
    tatr_result: dict[str, Any] = {"entities": [], "tables": [], "stats": {"table_transformer": 0}}
    if table_transformer_extractor.is_available():
        try:
            tatr_result = table_transformer_extractor.extract(pdf_bytes)
        except Exception as e:
            print(f"[tatr] extraction failed (non-fatal): {e}")

    # ── Merge ─────────────────────────────────────────────────────────────────
    all_entities = pp_result["entities"] + mu_result["entities"] + tatr_result["entities"]
    all_tables   = pp_result.get("tables", []) + tatr_result["tables"]

    return {
        "pageWidth":  pp_result["pageWidth"],
        "pageHeight": pp_result["pageHeight"],
        "entities":   all_entities,
        "tables":     all_tables,
        "stats": {
            "pdfplumber":        pp_result["stats"]["pdfplumber"],
            "pymupdf":           mu_result["stats"]["pymupdf"],
            "table_transformer": tatr_result["stats"]["table_transformer"],
            "tables":            len(all_tables),
            "total":             len(all_entities),
        },
    }
