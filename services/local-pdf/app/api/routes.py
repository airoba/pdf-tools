from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.task_mutex import task_mutex
from app.models.pdf import ExtractRequest, MergeRequest, OcrRequest, TaskResponse
from app.services.pdf_service import extract_pages, merge_pdfs, recognize_pdf

router = APIRouter()


@router.get("/health")
def health() -> dict[str, object]:
    return {
        "service": "local-pdf",
        "status": "ready",
        "offline": True,
        "activeTask": task_mutex.active_task,
    }


@router.post("/pdf/extract", response_model=TaskResponse)
def extract_pdf(request: ExtractRequest) -> TaskResponse:
    try:
        with task_mutex.run("extract"):
            return extract_pages(request)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/pdf/merge", response_model=TaskResponse)
def merge_pdf(request: MergeRequest) -> TaskResponse:
    try:
        with task_mutex.run("merge"):
            return merge_pdfs(request)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/pdf/ocr", response_model=TaskResponse)
def ocr_pdf(request: OcrRequest) -> TaskResponse:
    try:
        with task_mutex.run("ocr"):
            return recognize_pdf(request)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
