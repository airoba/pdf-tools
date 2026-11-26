# 本地服务 API

Base URL: `http://127.0.0.1:17321/api`

## GET /health

返回本地服务状态。

```json
{
  "service": "local-pdf",
  "status": "ready",
  "offline": true,
  "activeTask": null
}
```

## POST /pdf/extract

按页码范围截取单个 PDF。

```json
{
  "source_path": "D:/demo/input.pdf",
  "page_range": "1-3,5",
  "output_path": "D:/demo/output.pdf"
}
```

## POST /pdf/merge

合并多份 PDF。

```json
{
  "source_paths": ["D:/demo/a.pdf", "D:/demo/b.pdf"],
  "output_path": "D:/demo/merged.pdf"
}
```

## POST /pdf/ocr

OCR 接口预留。后续接入离线 PaddleOCR，并支持 Word 导出。

```json
{
  "source_path": "D:/demo/scan.pdf",
  "output_docx_path": "D:/demo/scan.docx"
}
```
