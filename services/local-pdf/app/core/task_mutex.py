from __future__ import annotations

from contextlib import contextmanager
from threading import Lock
from typing import Iterator


class TaskMutex:
    def __init__(self) -> None:
        self._lock = Lock()
        self.active_task: str | None = None

    @contextmanager
    def run(self, task_name: str) -> Iterator[None]:
        acquired = self._lock.acquire(blocking=False)
        if not acquired:
            raise RuntimeError("已有任务正在运行，请等待完成后再试")
        self.active_task = task_name
        try:
            yield
        finally:
            self.active_task = None
            self._lock.release()


task_mutex = TaskMutex()
