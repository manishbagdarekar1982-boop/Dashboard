export interface ShareholdingCategory {
  name: string;
  percentage: number;
  shares: number;
}

export interface QuarterlyHolding {
  quarter: string;
  yrc: number;
  promoter: number;
  fii: number;
  dii: number;
  mutual_funds: number;
  insurance: number;
  retail: number;
  others: number;
}

export interface MajorShareholder {
  name: string;
  type: string;
  shares: number;
  percentage: number;
  date: string;
}

export interface ShareholdingResponse {
  symbol: string;
  co_code: number;
  company_name: string;
  sector: string;
  mcap_type: string;
  latest_quarter: string;
  total_shares: number;
  categories: ShareholdingCategory[];
  quarterly_trend: QuarterlyHolding[];
  major_shareholders: MajorShareholder[];
}

// --- Industry-wise trend types ---

export interface IndustryQuarterData {
  quarter: string;
  yrc: number;
  promoter: number;
  fii: number;
  dii: number;
  public: number;
  companies_count: number;
}

export interface IndustryTrendResponse {
  sector: string;
  total_companies: number;
  quarters: IndustryQuarterData[];
}

// --- All-sectors summary types ---

export interface SectorSparklinePoint {
  quarter: string;
  yrc: number;
  value: number;
}

export interface SectorSummaryRow {
  sector: string;
  companies_count: number;
  latest_quarter: string;
  promoter: number;
  fii: number;
  dii: number;
  public: number;
  others: number;
  promoter_trend: SectorSparklinePoint[];
  fii_trend: SectorSparklinePoint[];
  dii_trend: SectorSparklinePoint[];
  public_trend: SectorSparklinePoint[];
  others_trend: SectorSparklinePoint[];
}

export interface AllSectorsSummaryResponse {
  total_sectors: number;
  latest_quarter: string;
  sectors: SectorSummaryRow[];
}

// --- Sector Analytics (cross-database decomposition) types ---

export interface HolderTypeDecomposition {
  holding_value: number;
  prev_holding_value: number | null;
  value_change: number | null;
  price_effect: number | null;
  holding_effect: number | null;
  holding_change_pct: number | null;
  share_pct: number;
}

export interface SectorAggregateMetrics {
  promoter_flow: number | null;
  promoter_change_pct: number | null;
  promoter_accum_index: number | null;
  fii_flow: number | null;
  fii_change_pct: number | null;
  fii_accum_index: number | null;
  dii_flow: number | null;
  dii_change_pct: number | null;
  dii_accum_index: number | null;
  public_flow: number | null;
  public_change_pct: number | null;
  public_accum_index: number | null;
}

export interface SectorQuarterAnalytics {
  quarter: string;
  yrc: number;
  companies_matched: number;
  companies_total: number;
  total_sector_mcap: number;
  promoter: HolderTypeDecomposition;
  fii: HolderTypeDecomposition;
  dii: HolderTypeDecomposition;
  public: HolderTypeDecomposition;
  mcap_weighted: SectorAggregateMetrics;
  equal_weighted: SectorAggregateMetrics;
}

export interface SectorAnalyticsResponse {
  sector: string;
  total_companies: number;
  matched_companies: number;
  unmatched_symbols: string[];
  quarters: SectorQuarterAnalytics[];
}
