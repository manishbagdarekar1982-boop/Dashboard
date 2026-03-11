"""Schemas for market overview scanner — companies with biggest metric changes."""

from pydantic import BaseModel


class ScannerRow(BaseModel):
    company_name: str
    industry: str | None = None
    market_cap: float | None = None
    q3_ago: float | None = None
    q2_ago: float | None = None
    q1_ago: float | None = None
    current_qtr: float | None = None
    change_3q: float | None = None


class ScannerResponse(BaseModel):
    metric: str
    metric_label: str
    title: str
    subtitle: str
    periods: list[str]
    period_type: str  # "quarterly" or "annual"
    rows: list[ScannerRow]
