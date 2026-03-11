export interface OHLCPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number;
  market_cap?: number;
}

export interface OHLCResponse {
  symbol: string;
  company_name?: string;
  interval: string;
  ohlc: OHLCPoint[];
}

export interface StandardResponse<T> {
  success: boolean;
  data: T | null;
  meta?: {
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
  } | null;
  errors?: string | null;
}

export type Interval = 'daily' | 'weekly' | 'monthly';
export type QuickRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | '5Y' | 'MAX';
export type ChartType = 'candlestick' | 'line' | 'area';
