"""Pydantic schemas for Fundamental Timeseries endpoints."""

from pydantic import BaseModel


class FundamentalDataPoint(BaseModel):
    date: str
    value: float | None = None


class FundamentalMetricInfo(BaseModel):
    key: str
    label: str
    tab: str       # income_statement | balance_sheet | cash_flow | statistics
    unit: str      # cr | pct | ratio | days
    chart_type: str  # bar | line


class FundamentalCatalogResponse(BaseModel):
    tabs: list[str]
    metrics: list[FundamentalMetricInfo]


class FundamentalTimeseriesResponse(BaseModel):
    symbol: str
    co_code: int
    metrics: dict[str, list[FundamentalDataPoint]]
