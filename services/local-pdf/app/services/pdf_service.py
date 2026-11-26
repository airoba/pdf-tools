from __future__ import annotations

from pathlib import Path

from app.models.pdf import ExtractRequest, MergeRequest, OcrRequest, TaskResponse, ensure_pdf_path
from app.services.page_range import parse_page_range

try:
    import fitz
except ImportError:  # pragma: no cover
    fitz = None


def require_fitz() -> object:
    if fitz is None:
        raise RuntimeError("PyMuPDF 未安装，无法处理 PDF")
    return fitz


def extract_pages(request: ExtractRequest) -> TaskResponse:
    pymupdf = require_fitz()
    source = ensure_pdf_path(request.source_path)
    output = Path(request.output_path)

    with pymupdf.open(source) as doc:
        selected_pages = parse_page_range(request.page_range, doc.page_count)
        with pymupdf.open() as result:
            for page_index in selected_pages:
                result.insert_pdf(doc, from_page=page_index, to_page=page_index)
            result.save(output)

    return TaskResponse(ok=True, message="PDF截取任务执行完成，可前往保存文件", output_path=str(output))


def merge_pdfs(request: MergeRequest) -> TaskResponse:
    pymupdf = require_fitz()
    output = Path(request.output_path)

    with pymupdf.open() as result:
        for source_path in request.source_paths:
            source = ensure_pdf_path(source_path)
            with pymupdf.open(source) as doc:
                result.insert_pdf(doc)
        result.save(output)

    return TaskResponse(ok=True, message="PDF合并任务执行完成，可前往保存文件", output_path=str(output))


def recognize_pdf(request: OcrRequest) -> TaskResponse:
    ensure_pdf_path(request.source_path)
    return TaskResponse(
        ok=False,
        message="OCR引擎尚未接入。接口已预留，将接入离线 PaddleOCR 与 Word 导出。",
        text="",
    )
