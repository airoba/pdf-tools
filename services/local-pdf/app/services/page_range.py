from __future__ import annotations


def parse_page_range(raw: str, total_pages: int) -> list[int]:
    pages: list[int] = []
    for part in raw.replace(" ", "").split(","):
        if not part:
            continue
        if "-" in part:
            start_raw, end_raw = part.split("-", 1)
            start = int(start_raw)
            end = int(end_raw)
            if start > end:
                raise ValueError("页码范围格式错误")
            pages.extend(range(start, end + 1))
        else:
            pages.append(int(part))

    normalized = []
    seen = set()
    for page in pages:
        if page < 1 or page > total_pages:
            raise ValueError("页码超出范围")
        if page not in seen:
            normalized.append(page - 1)
            seen.add(page)
    if not normalized:
        raise ValueError("请选择有效页码")
    return normalized
