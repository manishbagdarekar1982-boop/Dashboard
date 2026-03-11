from datetime import date
from typing import List

from pydantic import BaseModel


class OHLCPoint(BaseModel):
    date: str           # ISO "YYYY-MM-DD" — lightweight-charts expects string dates
    open: float
    high: float
    low: float
    close: float
    volume: float
    turnover: float | None = None
    market_cap: float | None = None

    model_config = {"from_attributes": True}


class OHLCMeta(BaseModel):
    symbol: str
    company_name: str | None = None
    interval: str
    total_records: int
    start_date: str
    end_date: str
    latest_close: float | None = None
    change: float | None = None
    change_pct: float | None = None


class OHLCResponse(BaseModel):
    symbol: str
    company_name: str | None = None
    interval: str
    ohlc: List[OHLCPoint]
