"""
Pydantic schemas for Market Overview endpoint.
"""

from pydantic import BaseModel


class MarketOverviewCompany(BaseModel):
    """Flat, pre-joined company record for client-side filtering."""

    co_code: int
    company_name: str
    nse_symbol: str | None = None
    bse_code: str | None = None
    sector: str | None = None
    industry: str | None = None
    mcap: float | None = None
    mcap_type: str | None = None
    bse_group: str | None = None
    exchange: str | None = None  # "NSE", "BSE", or "Both"
    is_sme: bool = False
    nifty_indices: list[str] = []

    sales: float | None = None
    pat: float | None = None
    ebitda: float | None = None
    financial_year: str | None = None

    # Valuation ratios
    price_to_book: float | None = None
    pe: float | None = None
    price_to_sales: float | None = None
    ev_ebitda: float | None = None

    # Return ratios
    roe: float | None = None

    # Financial stability
    debt_to_equity: float | None = None

    # Margin ratios
    ebitda_margin: float | None = None
    operating_profit_margin: float | None = None

    # Cash flow ratios
    cfo_to_ebitda: float | None = None


class MarketOverviewResponse(BaseModel):
    """Response for GET /api/v1/market-overview."""

    total_companies: int
    companies: list[MarketOverviewCompany]
    distinct_sectors: list[str]
    distinct_industries: list[str]
    distinct_indices: list[str]
    distinct_mcap_types: list[str]
