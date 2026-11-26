from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field, field_validator


class TaskResponse(BaseModel):
    ok: bool
    message: str
    output_path: str | None = None
    text: str | None = None


class ExtractRequest(BaseModel):
    source_path: str
    page_range: str = Field(min_length=1, examples=["1-3,5,8"])
    output_path: str

    @field_validator("source_path", "output_path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("路径不能为空")
        return value


class MergeRequest(BaseModel):
    source_paths: list[str] = Field(min_length=2)
    output_path: str

    @field_validator("source_paths")
    @classmethod
    def validate_sources(cls, value: list[str]) -> list[str]:
        unique = list(dict.fromkeys(value))
        if len(unique) < 2:
            raise ValueError("至少需要 2 个不同的 PDF 文件")
        return unique


class OcrRequest(BaseModel):
    source_path: str
    output_docx_path: str | None = None


def ensure_pdf_path(path: str) -> Path:
    pdf_path = Path(path)
    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError("仅支持 PDF 文件")
    if not pdf_path.exists() or pdf_path.stat().st_size == 0:
        raise ValueError("文件异常，请重新选择有效PDF文件")
    return pdf_path
