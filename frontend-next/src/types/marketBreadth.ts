/* Market Breadth response types — mirrors backend Pydantic schemas */

export interface BreadthPoint {
  date: string;
  value: number;
}

export interface MultiSeriesPoint {
  date: string;
  largecap: number;
  midcap: number;
  smallcap: number;
}

export interface VolumeBreadthPoint {
  date: string;
  above_avg: number;
  below_avg: number;
}

export interface HighLow52wPoint {
  date: string;
  new_highs: number;
  new_lows: number;
}

export interface VwapBreadthPoint {
  date: string;
  above: number;
  below: number;
}

export interface SpecialChartSeries {
  name: string;
  data: BreadthPoint[];
}

export interface DmaTrendsResponse {
  pct_above_200dma: BreadthPoint[];
  pct_above_50dma: BreadthPoint[];
  pct_above_20dma: BreadthPoint[];
  trend_200dma_above: BreadthPoint[];
  trend_200dma_below: BreadthPoint[];
  trend_50dma_above: BreadthPoint[];
  trend_50dma_below: BreadthPoint[];
  trend_20dma_above: BreadthPoint[];
  trend_20dma_below: BreadthPoint[];
}

export interface ChartsResponse {
  dma: DmaTrendsResponse;
  ema_by_mcap: MultiSeriesPoint[];
  volume: VolumeBreadthPoint[];
  high_low_52w: HighLow52wPoint[];
  vwap: VwapBreadthPoint[];
  momentum_peaks: BreadthPoint[];
  drawdown_peaks: BreadthPoint[];
  gold_vs_nifty: SpecialChartSeries[];
  nifty_yoy: SpecialChartSeries[];
  cache_ts: string | null;
}

export interface SectorEmaRow {
  sector: string;
  pct_4w: number;
  pct_20w: number;
  pct_30w: number;
  pct_40w: number;
  pct_52w: number;
}

export interface DailyMovesRow {
  date: string;
  abv_3: number;
  blw_3: number;
  abv_5: number;
  blw_5: number;
  abv_10: number;
  blw_10: number;
}

export interface ReturnRow {
  symbol: string;
  pct_change: number;
}

export interface VwapStockRow {
  symbol: string;
  ltp: number;
  vwap: number;
}

export interface Stock52wRow {
  symbol: string;
  close: number;
  yearhigh: number;
  marketcap: number;
  mcap_category: string;
  industry: string;
  sector: string;
  weekly_return: number;
  vol_multiple: number;
}

export interface TablesResponse {
  sector_ema: SectorEmaRow[];
  daily_moves: DailyMovesRow[];
  return_1w: ReturnRow[];
  return_2w: ReturnRow[];
  return_1m: ReturnRow[];
  return_3m: ReturnRow[];
  return_6m: ReturnRow[];
  return_1y: ReturnRow[];
  vwap_largecap: VwapStockRow[];
  vwap_midcap: VwapStockRow[];
  vwap_smallcap: VwapStockRow[];
  vwap_microcap: VwapStockRow[];
  stocks_52w_high: Stock52wRow[];
  cache_ts: string | null;
}

export interface ScreenerRow {
  symbol: string;
  sector: string;
  mcap_category: string;
  week_1_pct: number;
  vol_vs_yr_avg: number;
}

export interface ScreenersResponse {
  minervini: ScreenerRow[];
  darvas: ScreenerRow[];
  potential_breakouts: ScreenerRow[];
  modified_rs: ScreenerRow[];
  breakouts_v2: ScreenerRow[];
  cci_weekly: ScreenerRow[];
  cache_ts: string | null;
}

export interface IndexDistRow {
  symbol: string;
  pct_from_40w: number;
}

export interface IndexChangeRow {
  symbol: string;
  pct_change: number;
}

export interface IndexReturnsResponse {
  dist_from_40w: IndexDistRow[];
  yearly_change: IndexChangeRow[];
  quarterly_change: IndexChangeRow[];
  weekly_change: IndexChangeRow[];
  cache_ts: string | null;
}

export interface ShareholdingMoverRow {
  symbol: string;
  q3_ago: number;
  q2_ago: number;
  q1_ago: number;
  current_qtr: number;
  change_3q: number;
}

export interface ShareholdingMoversResponse {
  retail_increasing: ShareholdingMoverRow[];
  dii_increasing: ShareholdingMoverRow[];
  promoter_increasing: ShareholdingMoverRow[];
  fii_increasing: ShareholdingMoverRow[];
  cache_ts: string | null;
}
