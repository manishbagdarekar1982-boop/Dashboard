"""Pydantic schemas for Mutual Fund Holdings endpoints."""

from pydantic import BaseModel


class MFHoldingRow(BaseModel):
    change_type: str  # "New Entry", "Modified", "Unchanged", "Removed"
    fund_name: str
    stock_name: str
    mf_schcode: int
    co_code: int
    perc_aum: float  # current month % AUM
    perc_aum_prev: float  # previous month % AUM
    share_count: int  # current month shares
    share_count_prev: int  # previous month shares
    mkt_value: float  # current month market value (Cr)
    mkt_value_prev: float  # previous month market value (Cr)


class MFHoldingSummary(BaseModel):
    new_entries: int
    modified: int
    unchanged: int
    removed: int
    total_funds: int


class MFHoldingsResponse(BaseModel):
    month: str
    prev_month: str
    summary: MFHoldingSummary
    rows: list[MFHoldingRow]


class MFBuySellTrendPoint(BaseModel):
    month: str
    buy_value: float
    sell_value: float


class MFNetValueItem(BaseModel):
    name: str
    net_value: float


class MFBuySellResponse(BaseModel):
    total_buy: float
    total_sell: float
    trend: list[MFBuySellTrendPoint]
    by_stock: list[MFNetValueItem]
    by_sector: list[MFNetValueItem]


class MFPopularStock(BaseModel):
    name: str
    count: int


class MFInsightsResponse(BaseModel):
    month: str
    most_popular: list[MFPopularStock]
    least_popular: list[MFPopularStock]


class MFAssetAllocationItem(BaseModel):
    fund_name: str
    equity: float
    debt: float
    cash: float
    misc: float


class MFAssetAllocationResponse(BaseModel):
    month: str
    items: list[MFAssetAllocationItem]


class MFFiltersResponse(BaseModel):
    available_months: list[str]
    fund_names: list[str]
    stock_names: list[str]
    categories: list[str]
