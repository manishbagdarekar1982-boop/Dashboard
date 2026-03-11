export interface CompanySymbol {
  symbol: string;
  latest_price?: number;
  latest_date?: string;
}

export interface CompanyListResponse {
  companies: CompanySymbol[];
  total: number;
}

export interface MarketCapBucket {
  label: string;
  category: string;
  min_cr: number;
  max_cr: number | null;
  count: number;
  total_cap_cr: number;
}

export interface MarketStatsResponse {
  total_symbols: number;
  total_market_cap_cr: number;
  latest_date: string | null;
  buckets: MarketCapBucket[];
}

export interface MarketCapTrendPoint {
  date: string;
  total_market_cap_cr: number;
  total_companies: number;
  nano_count: number;
  micro_count: number;
  small_count: number;
  mid_count: number;
  large_count: number;
}

export interface MarketCapTrendResponse {
  interval: string;
  start_date: string;
  end_date: string;
  total_points: number;
  data: MarketCapTrendPoint[];
}
