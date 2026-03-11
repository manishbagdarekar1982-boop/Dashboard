from pydantic import BaseModel


class ShareholdingCategory(BaseModel):
    name: str
    percentage: float
    shares: int = 0


class QuarterlyHolding(BaseModel):
    quarter: str        # e.g. "Sep 2025"
    yrc: int            # e.g. 202509
    promoter: float
    fii: float
    dii: float
    mutual_funds: float
    insurance: float
    retail: float
    others: float


class MajorShareholder(BaseModel):
    name: str
    type: str           # e.g. "Promoter", "Public", "FII"
    shares: int = 0
    percentage: float
    date: str = ""


class ShareholdingResponse(BaseModel):
    symbol: str
    co_code: int
    company_name: str
    sector: str = ""
    mcap_type: str = ""
    latest_quarter: str = ""
    total_shares: int = 0
    categories: list[ShareholdingCategory] = []
    quarterly_trend: list[QuarterlyHolding] = []
    major_shareholders: list[MajorShareholder] = []


# --- Industry-wise trend models ---

class IndustryQuarterData(BaseModel):
    quarter: str            # e.g. "Sep 2025"
    yrc: int                # e.g. 202509
    promoter: float
    fii: float
    dii: float
    public: float
    companies_count: int    # how many companies contributed data this quarter


class IndustryTrendResponse(BaseModel):
    sector: str
    total_companies: int
    quarters: list[IndustryQuarterData] = []


class SectorListResponse(BaseModel):
    sectors: list[str]


# --- All-sectors summary models ---

class SectorSparklinePoint(BaseModel):
    quarter: str
    yrc: int
    value: float


class SectorSummaryRow(BaseModel):
    sector: str
    companies_count: int
    latest_quarter: str
    promoter: float
    fii: float
    dii: float
    public: float
    others: float
    promoter_trend: list[SectorSparklinePoint] = []
    fii_trend: list[SectorSparklinePoint] = []
    dii_trend: list[SectorSparklinePoint] = []
    public_trend: list[SectorSparklinePoint] = []
    others_trend: list[SectorSparklinePoint] = []


class AllSectorsSummaryResponse(BaseModel):
    total_sectors: int
    latest_quarter: str
    sectors: list[SectorSummaryRow] = []


# --- Sector Analytics (cross-database decomposition) models ---

class HolderTypeDecomposition(BaseModel):
    holding_value: float
    prev_holding_value: float | None = None
    value_change: float | None = None
    price_effect: float | None = None
    holding_effect: float | None = None
    holding_change_pct: float | None = None
    share_pct: float


class SectorAggregateMetrics(BaseModel):
    promoter_flow: float | None = None
    promoter_change_pct: float | None = None
    promoter_accum_index: float | None = None
    fii_flow: float | None = None
    fii_change_pct: float | None = None
    fii_accum_index: float | None = None
    dii_flow: float | None = None
    dii_change_pct: float | None = None
    dii_accum_index: float | None = None
    public_flow: float | None = None
    public_change_pct: float | None = None
    public_accum_index: float | None = None


class SectorQuarterAnalytics(BaseModel):
    quarter: str
    yrc: int
    companies_matched: int
    companies_total: int
    total_sector_mcap: float
    promoter: HolderTypeDecomposition
    fii: HolderTypeDecomposition
    dii: HolderTypeDecomposition
    public: HolderTypeDecomposition
    mcap_weighted: SectorAggregateMetrics
    equal_weighted: SectorAggregateMetrics


class SectorAnalyticsResponse(BaseModel):
    sector: str
    total_companies: int
    matched_companies: int
    unmatched_symbols: list[str] = []
    quarters: list[SectorQuarterAnalytics] = []
