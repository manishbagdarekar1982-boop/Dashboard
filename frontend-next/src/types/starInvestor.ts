export interface TopInvestorItem {
  name: string;
  holdings_count: number;
  latest_date: string;
}

export interface InvestorSearchResult {
  name: string;
}

export interface SparklinePoint {
  value: number;
}

export interface InvestorHolding {
  co_code: number;
  symbol: string;
  company_name: string;
  sector: string;
  perstake: number;
  shares: number;
  date: string;
  price: number | null;
  price_change: number | null;
  pct_change: number | null;
  sparkline?: SparklinePoint[];
}

export interface InvestorKeyChange {
  co_code: number;
  symbol: string;
  company_name: string;
  sector: string;
  current_stake: number;
  prev_stake: number | null;
  stake_change: number | null;
  shares_current: number;
  shares_prev: number;
  change_type: string;
  price: number | null;
  pct_change: number | null;
  sparkline?: SparklinePoint[];
}

export interface InvestorDetailResponse {
  investor_name: string;
  total_holdings: number;
  holdings: InvestorHolding[];
}

export interface InvestorKeyChangesResponse {
  investor_name: string;
  changes: InvestorKeyChange[];
}

export interface InvestorGainersLosersResponse {
  investor_name: string;
  period: string;
  gainers: InvestorHolding[];
  losers: InvestorHolding[];
}
