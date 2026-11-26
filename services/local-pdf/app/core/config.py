from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    host: str = "127.0.0.1"
    port: int = 17321
    max_file_mb: int = 100
    max_pages: int = 500


settings = Settings()
