export interface FundamentalDataPoint {
  date: string;
  value: number | null;
}

export interface FundamentalMetricInfo {
  key: string;
  label: string;
  tab: string;       // income_statement | balance_sheet | cash_flow | statistics
  unit: string;      // cr | pct | ratio | days
  chart_type: string; // bar | line
}

export interface FundamentalCatalogResponse {
  tabs: string[];
  metrics: FundamentalMetricInfo[];
}

export interface FundamentalTimeseriesResponse {
  symbol: string;
  co_code: number;
  metrics: Record<string, FundamentalDataPoint[]>;
}
