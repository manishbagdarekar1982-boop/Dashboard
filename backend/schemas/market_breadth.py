"""Pydantic response models for the Market Breadth page."""

from pydantic import BaseModel


# --- Atomic building blocks ---

class BreadthPoint(BaseModel):
    date: str
    value: float


class MultiSeriesPoint(BaseModel):
    date: str
    largecap: float = 0
    midcap: float = 0
    smallcap: float = 0


# --- Chart responses ---

class DmaTrendsResponse(BaseModel):
    pct_above_200dma: list[BreadthPoint]
    pct_above_50dma: list[BreadthPoint]
    pct_above_20dma: list[BreadthPoint]
    trend_200dma_above: list[BreadthPoint]
    trend_200dma_below: list[BreadthPoint]
    trend_50dma_above: list[BreadthPoint]
    trend_50dma_below: list[BreadthPoint]
    trend_20dma_above: list[BreadthPoint]
    trend_20dma_below: list[BreadthPoint]


class EmaBreadthResponse(BaseModel):
    pct_above_40w_by_mcap: list[MultiSeriesPoint]


class VolumeBreadthPoint(BaseModel):
    date: str
    above_avg: float
    below_avg: float


class HighLow52wPoint(BaseModel):
    date: str
    new_highs: int
    new_lows: int


class VwapBreadthPoint(BaseModel):
    date: str
    above: int
    below: int


class SpecialChartSeries(BaseModel):
    name: str
    data: list[BreadthPoint]


class ChartsResponse(BaseModel):
    dma: DmaTrendsResponse
    ema_by_mcap: list[MultiSeriesPoint]
    volume: list[VolumeBreadthPoint]
    high_low_52w: list[HighLow52wPoint]
    vwap: list[VwapBreadthPoint]
    momentum_peaks: list[BreadthPoint]
    drawdown_peaks: list[BreadthPoint]
    gold_vs_nifty: list[SpecialChartSeries]
    nifty_yoy: list[SpecialChartSeries]
    cache_ts: str | None = None


# --- Table responses ---

class SectorEmaRow(BaseModel):
    sector: str
    pct_4w: float
    pct_20w: float
    pct_30w: float
    pct_40w: float
    pct_52w: float


class DailyMovesRow(BaseModel):
    date: str
    abv_3: int
    blw_3: int
    abv_5: int
    blw_5: int
    abv_10: int
    blw_10: int


class ReturnRow(BaseModel):
    symbol: str
    pct_change: float


class VwapStockRow(BaseModel):
    symbol: str
    ltp: float
    vwap: float


class IndexDistRow(BaseModel):
    symbol: str
    pct_from_40w: float


class IndexChangeRow(BaseModel):
    symbol: str
    pct_change: float


class Stock52wRow(BaseModel):
    symbol: str
    close: float
    yearhigh: float
    marketcap: float
    mcap_category: str
    industry: str
    sector: str
    weekly_return: float
    vol_multiple: float


class TablesResponse(BaseModel):
    sector_ema: list[SectorEmaRow]
    daily_moves: list[DailyMovesRow]
    return_1w: list[ReturnRow]
    return_2w: list[ReturnRow]
    return_1m: list[ReturnRow]
    return_3m: list[ReturnRow]
    return_6m: list[ReturnRow]
    return_1y: list[ReturnRow]
    vwap_largecap: list[VwapStockRow]
    vwap_midcap: list[VwapStockRow]
    vwap_smallcap: list[VwapStockRow]
    vwap_microcap: list[VwapStockRow]
    stocks_52w_high: list[Stock52wRow]
    cache_ts: str | None = None


# --- Index analysis ---

class IndexReturnsResponse(BaseModel):
    dist_from_40w: list[IndexDistRow]
    yearly_change: list[IndexChangeRow]
    quarterly_change: list[IndexChangeRow]
    weekly_change: list[IndexChangeRow]
    cache_ts: str | None = None


# --- Screener responses ---

class ScreenerRow(BaseModel):
    symbol: str
    sector: str
    mcap_category: str
    week_1_pct: float
    vol_vs_yr_avg: float


class ScreenersResponse(BaseModel):
    minervini: list[ScreenerRow]
    darvas: list[ScreenerRow]
    potential_breakouts: list[ScreenerRow]
    modified_rs: list[ScreenerRow]
    breakouts_v2: list[ScreenerRow]
    cci_weekly: list[ScreenerRow]
    cache_ts: str | None = None


# --- Shareholding movers ---

class ShareholdingMoverRow(BaseModel):
    symbol: str
    q3_ago: float
    q2_ago: float
    q1_ago: float
    current_qtr: float
    change_3q: float


class ShareholdingMoversResponse(BaseModel):
    retail_increasing: list[ShareholdingMoverRow]
    dii_increasing: list[ShareholdingMoverRow]
    promoter_increasing: list[ShareholdingMoverRow]
    fii_increasing: list[ShareholdingMoverRow]
    cache_ts: str | None = None


# --- Cache status ---

class CacheStatusResponse(BaseModel):
    universe_ts: str | None = None
    breadth_ts: str | None = None
    weekly_ema_ts: str | None = None
