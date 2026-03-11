from typing import List

from pydantic import BaseModel


class CompanySymbol(BaseModel):
    symbol: str
    latest_price: float | None = None
    latest_date: str | None = None

    model_config = {"from_attributes": True}


class CompanyListResponse(BaseModel):
    companies: List[CompanySymbol]
    total: int


class MarketCapBucket(BaseModel):
    label: str        # e.g. "100–1K Cr"
    category: str     # e.g. "Micro Cap"
    min_cr: float
    max_cr: float | None   # None = open-ended (last bucket)
    count: int
    total_cap_cr: float


class MarketStatsResponse(BaseModel):
    total_symbols: int
    total_market_cap_cr: float
    latest_date: str | None
    buckets: List[MarketCapBucket]


class MarketCapTrendPoint(BaseModel):
    """One data point in the market cap time series."""
    date: str
    total_market_cap_cr: float
    total_companies: int
    nano_count: int
    micro_count: int
    small_count: int
    mid_count: int
    large_count: int


class MarketCapTrendResponse(BaseModel):
    """Time series of market cap and company count by bucket."""
    interval: str
    start_date: str
    end_date: str
    total_points: int
    data: List[MarketCapTrendPoint]
