"""
Pydantic schemas for Earnings Analysis endpoint.
"""

from pydantic import BaseModel


class EarningsCompany(BaseModel):
    """Per-company earnings data with growth metrics across multiple quarters."""

    co_code: int
    company_name: str
    nse_symbol: str | None = None
    bse_code: str | None = None
    sector: str | None = None
    industry: str | None = None
    mcap: float | None = None
    mcap_type: str | None = None
    exchange: str | None = None  # "NSE", "BSE", or "Both"
    is_sme: bool = False
    nifty_indices: list[str] = []

    # Per-quarter raw values keyed by quarter label e.g. "Q3FY26"
    sales: dict[str, float | None] = {}
    operating_profit: dict[str, float | None] = {}
    pat: dict[str, float | None] = {}
    ebitda: dict[str, float | None] = {}
    depreciation: dict[str, float | None] = {}

    # Per-quarter growth rates (%)
    sales_growth_yoy: dict[str, float | None] = {}
    sales_growth_qoq: dict[str, float | None] = {}
    op_growth_yoy: dict[str, float | None] = {}
    op_growth_qoq: dict[str, float | None] = {}
    pat_growth_yoy: dict[str, float | None] = {}
    pat_growth_qoq: dict[str, float | None] = {}
    eps_growth_yoy: dict[str, float | None] = {}
    eps_growth_qoq: dict[str, float | None] = {}

    # Margin data (%)
    operating_profit_margin: dict[str, float | None] = {}
    pat_margin: dict[str, float | None] = {}

    # Margin growth (percentage-point change YoY)
    op_margin_growth_yoy: dict[str, float | None] = {}
    pat_margin_growth_yoy: dict[str, float | None] = {}

    # Valuation
    pe: float | None = None
    peg_ratio: float | None = None


class EarningsTrendPoint(BaseModel):
    """One quarter in the earnings trend chart."""

    quarter: str
    median_sales_growth: float | None = None
    median_op_growth: float | None = None
    median_pat_growth: float | None = None
    median_eps_growth: float | None = None


class EarningsAnalysisResponse(BaseModel):
    """Full response for GET /api/v1/earnings."""

    total_companies: int
    companies: list[EarningsCompany]
    available_quarters: list[str]
    results_per_quarter: dict[str, int] = {}
    trends: list[EarningsTrendPoint]
    distinct_industries: list[str]
    distinct_indices: list[str]
    distinct_mcap_types: list[str]
