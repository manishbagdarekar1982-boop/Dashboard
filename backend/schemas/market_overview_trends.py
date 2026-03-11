"""
Pydantic schemas for Market Overview Trends endpoint.
"""

from pydantic import BaseModel


class TrendDataPoint(BaseModel):
    """A single (period, value) data point for a trend chart."""

    period: str
    value: float | None = None


class MarketOverviewTrendsResponse(BaseModel):
    """Pre-aggregated time-series for 27 market trend metrics."""

    # --- Section 1: Financial Trends ---
    companies_listed: list[TrendDataPoint]
    total_market_cap: list[TrendDataPoint]
    total_operating_profit: list[TrendDataPoint]
    total_sales: list[TrendDataPoint]
    total_ebitda: list[TrendDataPoint]
    total_pat: list[TrendDataPoint]
    total_debt: list[TrendDataPoint]
    median_debt_to_equity: list[TrendDataPoint]
    total_net_fixed_assets: list[TrendDataPoint]

    # --- Section 2: Holdings & Returns ---
    median_promoter_holdings: list[TrendDataPoint]
    median_institutional_holdings: list[TrendDataPoint]
    median_public_holdings: list[TrendDataPoint]
    median_ebitda_margin: list[TrendDataPoint]
    median_operating_profit_margin: list[TrendDataPoint]
    median_pat_margin: list[TrendDataPoint]
    median_roe: list[TrendDataPoint]
    median_roce: list[TrendDataPoint]
    median_roa: list[TrendDataPoint]

    # --- Section 3: Cash Flow & Valuation ---
    median_receivable_days: list[TrendDataPoint]
    median_cfo_to_ebitda: list[TrendDataPoint]
    median_cfo_to_pbt: list[TrendDataPoint]
    median_pe: list[TrendDataPoint]
    median_price_to_book: list[TrendDataPoint]
    median_price_to_sales: list[TrendDataPoint]
    median_ev_ebitda: list[TrendDataPoint]
    median_ev_cfo: list[TrendDataPoint]
    median_mcap_netblock: list[TrendDataPoint]
