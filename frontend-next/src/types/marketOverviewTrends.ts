export interface TrendDataPoint {
  period: string;
  value: number | null;
}

export interface MarketOverviewTrendsResponse {
  // Section 1: Financial Trends
  companies_listed: TrendDataPoint[];
  total_market_cap: TrendDataPoint[];
  total_operating_profit: TrendDataPoint[];
  total_sales: TrendDataPoint[];
  total_ebitda: TrendDataPoint[];
  total_pat: TrendDataPoint[];
  total_debt: TrendDataPoint[];
  median_debt_to_equity: TrendDataPoint[];
  total_net_fixed_assets: TrendDataPoint[];

  // Section 2: Holdings & Returns
  median_promoter_holdings: TrendDataPoint[];
  median_institutional_holdings: TrendDataPoint[];
  median_public_holdings: TrendDataPoint[];
  median_ebitda_margin: TrendDataPoint[];
  median_operating_profit_margin: TrendDataPoint[];
  median_pat_margin: TrendDataPoint[];
  median_roe: TrendDataPoint[];
  median_roce: TrendDataPoint[];
  median_roa: TrendDataPoint[];

  // Section 3: Cash Flow & Valuation
  median_receivable_days: TrendDataPoint[];
  median_cfo_to_ebitda: TrendDataPoint[];
  median_cfo_to_pbt: TrendDataPoint[];
  median_pe: TrendDataPoint[];
  median_price_to_book: TrendDataPoint[];
  median_price_to_sales: TrendDataPoint[];
  median_ev_ebitda: TrendDataPoint[];
  median_ev_cfo: TrendDataPoint[];
  median_mcap_netblock: TrendDataPoint[];
}
