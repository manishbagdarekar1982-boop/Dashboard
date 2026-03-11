"""Pydantic schemas for the Universe endpoint."""

from typing import Any

from pydantic import BaseModel


class UniverseMeta(BaseModel):
    total: int
    columns: list[str]
    sectors: list[str]
    industries: list[str]
    mcap_counts: dict[str, int]


class UniverseResponse(BaseModel):
    companies: list[dict[str, Any]]
    meta: UniverseMeta
