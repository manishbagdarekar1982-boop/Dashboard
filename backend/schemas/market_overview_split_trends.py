"""Schemas for split-trend analysis on market overview."""

from pydantic import BaseModel


class SplitTrendPoint(BaseModel):
    period: str
    value: float | None = None


class SplitTrendSeries(BaseModel):
    label: str
    data: list[SplitTrendPoint]


class SplitTrendResponse(BaseModel):
    metric: str
    metric_label: str
    split_by: str
    split_by_label: str
    title: str
    subtitle: str
    splits: list[SplitTrendSeries]
