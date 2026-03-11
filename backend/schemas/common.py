from typing import Any, Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PaginationMeta(BaseModel):
    total: int
    page: int
    page_size: int
    total_pages: int


class StandardResponse(BaseModel, Generic[T]):
    success: bool = True
    data: T | None = None
    meta: PaginationMeta | None = None
    errors: str | None = None
