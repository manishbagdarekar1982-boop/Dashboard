export interface EarningsCompany {
  co_code: number;
  company_name: string;
  nse_symbol: string | null;
  bse_code: string | null;
  sector: string | null;
  industry: string | null;
  mcap: number | null;
  mcap_type: string | null;
  exchange: string | null;  // "NSE", "BSE", or "Both"
  is_sme: boolean;
  nifty_indices: string[];

  sales: Record<string, number | null>;
  operating_profit: Record<string, number | null>;
  pat: Record<string, number | null>;
  ebitda: Record<string, number | null>;
  depreciation: Record<string, number | null>;

  sales_growth_yoy: Record<string, number | null>;
  sales_growth_qoq: Record<string, number | null>;
  op_growth_yoy: Record<string, number | null>;
  op_growth_qoq: Record<string, number | null>;
  pat_growth_yoy: Record<string, number | null>;
  pat_growth_qoq: Record<string, number | null>;
  eps_growth_yoy: Record<string, number | null>;
  eps_growth_qoq: Record<string, number | null>;

  operating_profit_margin: Record<string, number | null>;
  pat_margin: Record<string, number | null>;
  op_margin_growth_yoy: Record<string, number | null>;
  pat_margin_growth_yoy: Record<string, number | null>;

  pe: number | null;
  peg_ratio: number | null;
}

export interface EarningsTrendPoint {
  quarter: string;
  median_sales_growth: number | null;
  median_op_growth: number | null;
  median_pat_growth: number | null;
  median_eps_growth: number | null;
}

export interface EarningsAnalysisResponse {
  total_companies: number;
  companies: EarningsCompany[];
  available_quarters: string[];
  results_per_quarter: Record<string, number>;
  trends: EarningsTrendPoint[];
  distinct_industries: string[];
  distinct_indices: string[];
  distinct_mcap_types: string[];
}
