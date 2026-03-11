export interface MarketOverviewCompany {
  co_code: number;
  company_name: string;
  nse_symbol: string | null;
  bse_code: string | null;
  sector: string | null;
  industry: string | null;
  mcap: number | null;
  mcap_type: string | null;
  bse_group: string | null;
  exchange: string | null;  // "NSE", "BSE", or "Both"
  is_sme: boolean;
  nifty_indices: string[];

  sales: number | null;
  pat: number | null;
  ebitda: number | null;
  financial_year: string | null;

  // Valuation ratios
  price_to_book: number | null;
  pe: number | null;
  price_to_sales: number | null;
  ev_ebitda: number | null;

  // Return ratios
  roe: number | null;

  // Financial stability
  debt_to_equity: number | null;

  // Margin ratios
  ebitda_margin: number | null;
  operating_profit_margin: number | null;

  // Cash flow ratios
  cfo_to_ebitda: number | null;
}

export interface MarketOverviewResponse {
  total_companies: number;
  companies: MarketOverviewCompany[];
  distinct_sectors: string[];
  distinct_industries: string[];
  distinct_indices: string[];
  distinct_mcap_types: string[];
}
