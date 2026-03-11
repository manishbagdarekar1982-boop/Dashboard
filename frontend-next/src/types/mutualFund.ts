export interface MFHoldingRow {
  change_type: string;
  fund_name: string;
  stock_name: string;
  mf_schcode: number;
  co_code: number;
  perc_aum: number;
  perc_aum_prev: number;
  share_count: number;
  share_count_prev: number;
  mkt_value: number;
  mkt_value_prev: number;
}

export interface MFHoldingSummary {
  new_entries: number;
  modified: number;
  unchanged: number;
  removed: number;
  total_funds: number;
}

export interface MFHoldingsResponse {
  month: string;
  prev_month: string;
  summary: MFHoldingSummary;
  rows: MFHoldingRow[];
}

export interface MFBuySellTrendPoint {
  month: string;
  buy_value: number;
  sell_value: number;
}

export interface MFNetValueItem {
  name: string;
  net_value: number;
}

export interface MFBuySellResponse {
  total_buy: number;
  total_sell: number;
  trend: MFBuySellTrendPoint[];
  by_stock: MFNetValueItem[];
  by_sector: MFNetValueItem[];
}

export interface MFPopularStock {
  name: string;
  count: number;
}

export interface MFInsightsResponse {
  month: string;
  most_popular: MFPopularStock[];
  least_popular: MFPopularStock[];
}

export interface MFAssetAllocationItem {
  fund_name: string;
  equity: number;
  debt: number;
  cash: number;
  misc: number;
}

export interface MFAssetAllocationResponse {
  month: string;
  items: MFAssetAllocationItem[];
}

export interface MFFiltersResponse {
  available_months: string[];
  fund_names: string[];
  stock_names: string[];
  categories: string[];
}
