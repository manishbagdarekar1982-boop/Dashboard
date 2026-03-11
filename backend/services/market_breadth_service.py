"""
Market Breadth Service — technical indicator engine for all-market breadth analysis.

Computes DMA, EMA, VWAP, returns, screeners, and shareholding movers from
PostgreSQL OHLC data + MongoDB company/shareholding data.

Architecture:
  _compute_universe()        — async, fetches OHLC from PostgreSQL, returns per-symbol indicators
  _compute_breadth_trends()  — async, historical daily breadth % time series
  _compute_weekly_ema()      — async, weekly EMA for all stocks
  get_*()                    — public functions deriving from cached internal data
"""

import logging
import time
from datetime import datetime

import numpy as np
import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database_mongo import get_mongo_db
from backend.services import company_master_service

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level caches: (timestamp, data)
# ---------------------------------------------------------------------------
_CACHE_TTL = 6 * 3600  # 6 hours

_universe_cache: tuple[float, pd.DataFrame] | None = None
_breadth_cache: tuple[float, dict] | None = None
_weekly_ema_cache: tuple[float, pd.DataFrame] | None = None
_company_cache: tuple[float, pd.DataFrame] | None = None
_shareholding_cache: tuple[float, dict] | None = None
_index_cache: tuple[float, dict] | None = None


def _cache_fresh(cache_entry: tuple | None) -> bool:
    if cache_entry is None:
        return False
    return (time.time() - cache_entry[0]) < _CACHE_TTL


def _ts_str(ts: float | None) -> str | None:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")


# ---------------------------------------------------------------------------
# Company master from MongoDB (sync, wrapped in to_thread at API layer)
# ---------------------------------------------------------------------------

def _load_company_master() -> pd.DataFrame:
    global _company_cache
    if _cache_fresh(_company_cache):
        return _company_cache[1]

    try:
        db = get_mongo_db()
    except RuntimeError:
        logger.warning("MongoDB unavailable — company master will be empty")
        _company_cache = (time.time(), pd.DataFrame())
        return _company_cache[1]

    docs = list(db["indira_cmots_company_master"].find(
        {},
        {"_id": 0, "co_code": 1, "nsesymbol": 1, "bsecode": 1, "companyname": 1,
         "sectorname": 1, "industryname": 1, "mcap": 1, "mcaptype": 1},
    ))
    rows = []
    for d in docs:
        sym = (d.get("nsesymbol") or "").strip().upper()
        if not sym:
            continue
        mcap_type = (d.get("mcaptype") or "").strip().lower()
        # Override sector/industry from Excel (try NSE symbol, then BSE code)
        bse_raw = d.get("bsecode")
        bse_str = str(bse_raw).split(".")[0] if bse_raw else None
        excel_info = company_master_service.get_sector_industry(sym, bse_str)
        if not excel_info:
            continue  # Skip companies not in Excel
        sector, industry = excel_info

        rows.append({
            "symbol": sym,
            "company_name": d.get("companyname", ""),
            "sector": sector,
            "industry": industry,
            "mcap_type": mcap_type,
        })
    df = pd.DataFrame(rows)
    _company_cache = (time.time(), df)
    logger.info("Company master loaded: %d symbols", len(df))
    return df


# ---------------------------------------------------------------------------
# Universe: latest indicators per stock (async PostgreSQL)
# ---------------------------------------------------------------------------

async def _compute_universe(session: AsyncSession) -> pd.DataFrame:
    global _universe_cache
    if _cache_fresh(_universe_cache):
        return _universe_cache[1]

    logger.info("Computing universe snapshot — split queries...")
    t0 = time.time()

    # Step 1: Latest row per symbol (fast — only scans recent data)
    sql_latest = text("""
        SELECT symbol, curr_price, high, low, volume, marketcap_value, date_time
        FROM (
            SELECT symbol, curr_price, high, low, volume, marketcap_value, date_time,
                   ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date_time DESC) AS rn
            FROM public.historic_data
            WHERE date_time >= CURRENT_DATE - INTERVAL '30 days'
        ) sub WHERE rn = 1
    """)
    latest_result = await session.execute(sql_latest)
    latest_rows = {r.symbol: r for r in latest_result.fetchall()}
    logger.info("Step 1 (latest): %d symbols in %.1fs", len(latest_rows), time.time() - t0)

    if not latest_rows:
        _universe_cache = (time.time(), pd.DataFrame())
        return _universe_cache[1]

    t1 = time.time()

    # Step 2: SMA + volume averages + 52W high/low via GROUP BY + FILTER
    # Only uses 1 window function (ROW_NUMBER), then aggregates
    sql_sma = text("""
        SELECT symbol,
               AVG(curr_price) FILTER (WHERE rn <= 20) AS sma_20,
               AVG(curr_price) FILTER (WHERE rn <= 50) AS sma_50,
               AVG(curr_price) FILTER (WHERE rn <= 150) AS sma_150,
               AVG(curr_price) FILTER (WHERE rn <= 200) AS sma_200,
               MAX(high) AS high_52w,
               MIN(low) AS low_52w,
               AVG(volume) FILTER (WHERE rn <= 20) AS vol_avg_20,
               AVG(volume) FILTER (WHERE rn <= 200) AS vol_avg_200,
               AVG(volume) AS vol_avg_yr,
               COUNT(*) AS total_rows
        FROM (
            SELECT symbol, curr_price, high, low, volume,
                   ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date_time DESC) AS rn
            FROM public.historic_data
            WHERE date_time >= CURRENT_DATE - INTERVAL '18 months'
        ) sub
        WHERE rn <= 252
        GROUP BY symbol
    """)
    sma_result = await session.execute(sql_sma)
    sma_map = {r.symbol: r for r in sma_result.fetchall()}
    logger.info("Step 2 (SMA): %d symbols in %.1fs", len(sma_map), time.time() - t1)

    t2 = time.time()

    # Step 3: Returns — price at specific offsets (prev_close, 5d, 10d, 22d, 66d, 132d, 252d)
    sql_returns = text("""
        SELECT symbol, rn, curr_price
        FROM (
            SELECT symbol, curr_price,
                   ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date_time DESC) AS rn
            FROM public.historic_data
            WHERE date_time >= CURRENT_DATE - INTERVAL '18 months'
        ) sub
        WHERE rn IN (2, 6, 11, 23, 67, 133, 253)
    """)
    ret_result = await session.execute(sql_returns)
    # Build symbol → {rn: price} lookup
    ret_map: dict[str, dict[int, float]] = {}
    for r in ret_result.fetchall():
        ret_map.setdefault(r.symbol, {})[r.rn] = float(r.curr_price)
    logger.info("Step 3 (returns): %d symbols in %.1fs", len(ret_map), time.time() - t2)

    # Build results from the 3 queries
    results = []
    for symbol, lr in latest_rows.items():
        ltp = float(lr.curr_price or 0)
        sr = sma_map.get(symbol)
        rr = ret_map.get(symbol, {})

        total_rows = int(sr.total_rows) if sr else 0
        prev_close = rr.get(2, ltp)
        daily_chg = ((ltp - prev_close) / prev_close * 100) if prev_close > 0 else 0.0
        typical = (float(lr.high or 0) + float(lr.low or 0) + ltp) / 3

        def _calc_ret(old_price: float | None) -> float:
            if old_price and old_price > 0:
                return (ltp - old_price) / old_price * 100
            return np.nan

        sma_200 = float(sr.sma_200) if sr and sr.sma_200 else np.nan
        sma_200_check = total_rows >= 200

        results.append({
            "symbol": symbol,
            "ltp": ltp,
            "prev_close": prev_close,
            "daily_chg": daily_chg,
            "sma_20": float(sr.sma_20) if sr and sr.sma_20 and total_rows >= 20 else np.nan,
            "sma_50": float(sr.sma_50) if sr and sr.sma_50 and total_rows >= 50 else np.nan,
            "sma_150": float(sr.sma_150) if sr and sr.sma_150 and total_rows >= 150 else np.nan,
            "sma_200": sma_200 if sma_200_check else np.nan,
            "sma_200_prev": sma_200 if sma_200_check else np.nan,
            "high_52w": float(sr.high_52w) if sr and sr.high_52w else 0,
            "low_52w": float(sr.low_52w) if sr and sr.low_52w else 0,
            "vol_avg_20": float(sr.vol_avg_20) if sr and sr.vol_avg_20 else np.nan,
            "vol_avg_200": float(sr.vol_avg_200) if sr and sr.vol_avg_200 else np.nan,
            "vol_avg_yr": float(sr.vol_avg_yr) if sr and sr.vol_avg_yr else np.nan,
            "volume": float(lr.volume or 0),
            "vwap": typical,
            "marketcap": float(lr.marketcap_value or 0),
            "ret_1w": _calc_ret(rr.get(6)),
            "ret_2w": _calc_ret(rr.get(11)),
            "ret_1m": _calc_ret(rr.get(23)),
            "ret_3m": _calc_ret(rr.get(67)),
            "ret_6m": _calc_ret(rr.get(133)),
            "ret_1y": _calc_ret(rr.get(253)),
            "latest_date": str(lr.date_time)[:10],
            "was_below_200": (prev_close < sma_200) if sma_200_check and not np.isnan(sma_200) else False,
        })

    uni = pd.DataFrame(results)

    # Filter to project universe (INE stocks only)
    from backend.services import company_master_service
    universe_syms = company_master_service.get_universe_symbols()
    if universe_syms and not uni.empty:
        before = len(uni)
        uni = uni[uni["symbol"].isin(universe_syms)].reset_index(drop=True)
        logger.info("Universe filtered: %d → %d stocks (INE only)", before, len(uni))

    # Join with company master (may be empty if MongoDB is down)
    comp = _load_company_master()
    if not comp.empty and "symbol" in comp.columns and not uni.empty:
        uni = uni.merge(comp[["symbol", "sector", "industry", "mcap_type"]], on="symbol", how="left")
    # Ensure columns always exist
    for col in ["sector", "industry", "mcap_type"]:
        if col not in uni.columns:
            uni[col] = ""
        else:
            uni[col] = uni[col].fillna("")

    _universe_cache = (time.time(), uni)
    logger.info("Universe computed: %d stocks in %.1fs", len(uni), time.time() - t0)
    return uni


# ---------------------------------------------------------------------------
# Breadth trends: historical daily breadth % (async PostgreSQL)
# ---------------------------------------------------------------------------

async def _compute_breadth_trends(session: AsyncSession) -> dict:
    global _breadth_cache
    if _cache_fresh(_breadth_cache):
        return _breadth_cache[1]

    logger.info("Computing breadth trends — using SQL aggregation...")
    t0 = time.time()

    # Push all rolling + aggregation to SQL — avoids loading millions of rows into Python
    sql = text("""
        WITH indicators AS (
            SELECT symbol, date_time, curr_price, high, low, volume,
                   AVG(curr_price) OVER w20 AS sma_20,
                   AVG(curr_price) OVER w50 AS sma_50,
                   AVG(curr_price) OVER w200 AS sma_200,
                   AVG(volume) OVER w200 AS vol_avg_200,
                   MAX(high) OVER w252 AS high_52w,
                   MIN(low) OVER w252 AS low_52w,
                   (high + low + curr_price) / 3.0 AS typical_price,
                   LAG(curr_price) OVER (PARTITION BY symbol ORDER BY date_time) AS prev_price,
                   COUNT(*) OVER (PARTITION BY symbol ORDER BY date_time ROWS BETWEEN 199 PRECEDING AND CURRENT ROW) AS cnt_200
            FROM public.historic_data
            WHERE date_time >= CURRENT_DATE - INTERVAL '30 months'
            WINDOW
                w20 AS (PARTITION BY symbol ORDER BY date_time ROWS BETWEEN 19 PRECEDING AND CURRENT ROW),
                w50 AS (PARTITION BY symbol ORDER BY date_time ROWS BETWEEN 49 PRECEDING AND CURRENT ROW),
                w200 AS (PARTITION BY symbol ORDER BY date_time ROWS BETWEEN 199 PRECEDING AND CURRENT ROW),
                w252 AS (PARTITION BY symbol ORDER BY date_time ROWS BETWEEN 251 PRECEDING AND CURRENT ROW)
        )
        SELECT
            date_time,
            COUNT(*) AS total,
            SUM(CASE WHEN cnt_200 >= 200 AND curr_price > sma_200 THEN 1 ELSE 0 END) AS above_200,
            SUM(CASE WHEN curr_price > sma_50 THEN 1 ELSE 0 END) AS above_50,
            SUM(CASE WHEN curr_price > sma_20 THEN 1 ELSE 0 END) AS above_20,
            SUM(CASE WHEN volume > vol_avg_200 THEN 1 ELSE 0 END) AS vol_above,
            SUM(CASE WHEN curr_price >= high_52w * 0.98 THEN 1 ELSE 0 END) AS new_highs,
            SUM(CASE WHEN curr_price <= low_52w * 1.02 THEN 1 ELSE 0 END) AS new_lows,
            SUM(CASE WHEN curr_price > typical_price THEN 1 ELSE 0 END) AS vwap_above,
            SUM(CASE WHEN prev_price > 0 AND ((curr_price - prev_price) / prev_price * 100) > 1 THEN 1 ELSE 0 END) AS momentum,
            SUM(CASE WHEN prev_price > 0 AND ((curr_price - prev_price) / prev_price * 100) < -1 THEN 1 ELSE 0 END) AS drawdown
        FROM indicators
        WHERE date_time >= CURRENT_DATE - INTERVAL '2 years'
        GROUP BY date_time
        ORDER BY date_time
    """)
    result = await session.execute(sql)
    rows = result.fetchall()
    logger.info("Breadth SQL completed: %d dates in %.1fs", len(rows), time.time() - t0)

    if not rows:
        empty = {"dates": [], "pct_above_200": [], "pct_above_50": [], "pct_above_20": [],
                 "above_200": [], "below_200": [], "above_50": [], "below_50": [],
                 "above_20": [], "below_20": [], "vol_above": [], "vol_below": [],
                 "new_highs": [], "new_lows": [], "vwap_above": [], "vwap_below": [],
                 "momentum": [], "drawdown": []}
        _breadth_cache = (time.time(), empty)
        return empty

    dates = []
    above_200_l, above_50_l, above_20_l = [], [], []
    total_l, vol_above_l = [], []
    new_highs_l, new_lows_l, vwap_above_l = [], [], []
    momentum_l, drawdown_l = [], []

    for r in rows:
        total = max(int(r.total), 1)
        a200 = int(r.above_200)
        a50 = int(r.above_50)
        a20 = int(r.above_20)
        va = int(r.vol_above)

        dates.append(str(r.date_time)[:10])
        total_l.append(total)
        above_200_l.append(a200)
        above_50_l.append(a50)
        above_20_l.append(a20)
        vol_above_l.append(va)
        new_highs_l.append(int(r.new_highs))
        new_lows_l.append(int(r.new_lows))
        vwap_above_l.append(int(r.vwap_above))
        momentum_l.append(int(r.momentum))
        drawdown_l.append(int(r.drawdown))

    result_dict = {
        "dates": dates,
        "pct_above_200": [round(a / t * 100, 2) for a, t in zip(above_200_l, total_l)],
        "pct_above_50": [round(a / t * 100, 2) for a, t in zip(above_50_l, total_l)],
        "pct_above_20": [round(a / t * 100, 2) for a, t in zip(above_20_l, total_l)],
        "above_200": above_200_l,
        "below_200": [t - a for t, a in zip(total_l, above_200_l)],
        "above_50": above_50_l,
        "below_50": [t - a for t, a in zip(total_l, above_50_l)],
        "above_20": above_20_l,
        "below_20": [t - a for t, a in zip(total_l, above_20_l)],
        "vol_above": vol_above_l,
        "vol_below": [t - a for t, a in zip(total_l, vol_above_l)],
        "new_highs": new_highs_l,
        "new_lows": new_lows_l,
        "vwap_above": vwap_above_l,
        "vwap_below": [t - a for t, a in zip(total_l, vwap_above_l)],
        "momentum": momentum_l,
        "momentum_dates": dates,
        "drawdown": drawdown_l,
        "drawdown_dates": dates,
    }

    _breadth_cache = (time.time(), result_dict)
    logger.info("Breadth trends computed: %d dates in %.1fs", len(dates), time.time() - t0)
    return result_dict


# ---------------------------------------------------------------------------
# Weekly EMA computation (async PostgreSQL)
# ---------------------------------------------------------------------------

async def _compute_weekly_ema(session: AsyncSession) -> pd.DataFrame:
    global _weekly_ema_cache
    if _cache_fresh(_weekly_ema_cache):
        return _weekly_ema_cache[1]

    logger.info("Computing weekly EMA...")
    t0 = time.time()

    sql = text("""
        SELECT symbol,
               DATE_TRUNC('week', date_time)::date AS week,
               (ARRAY_AGG(curr_price ORDER BY date_time DESC))[1] AS close
        FROM public.historic_data
        WHERE date_time >= CURRENT_DATE - INTERVAL '3 years'
        GROUP BY symbol, DATE_TRUNC('week', date_time)
        ORDER BY symbol, week
    """)
    result = await session.execute(sql)
    rows = result.fetchall()

    if not rows:
        _weekly_ema_cache = (time.time(), pd.DataFrame())
        return _weekly_ema_cache[1]

    df = pd.DataFrame(rows, columns=["symbol", "week", "close"])
    df["close"] = pd.to_numeric(df["close"], errors="coerce")

    # Compute EMA per symbol
    ema_results = []
    for sym, g in df.groupby("symbol"):
        g = g.sort_values("week").reset_index(drop=True)
        if len(g) < 10:
            continue

        close = g["close"]
        ltp = close.iloc[-1]

        ema_4w = close.ewm(span=4, adjust=False).mean().iloc[-1]
        ema_20w = close.ewm(span=20, adjust=False).mean().iloc[-1]
        ema_30w = close.ewm(span=30, adjust=False).mean().iloc[-1]
        ema_40w = close.ewm(span=40, adjust=False).mean().iloc[-1]
        ema_52w = close.ewm(span=52, adjust=False).mean().iloc[-1]

        ema_results.append({
            "symbol": sym,
            "ltp": ltp,
            "ema_4w": ema_4w,
            "ema_20w": ema_20w,
            "ema_30w": ema_30w,
            "ema_40w": ema_40w,
            "ema_52w": ema_52w,
        })

    ema_df = pd.DataFrame(ema_results)
    _weekly_ema_cache = (time.time(), ema_df)
    logger.info("Weekly EMA computed: %d stocks in %.1fs", len(ema_df), time.time() - t0)
    return ema_df


# ============================= PUBLIC FUNCTIONS =============================


async def get_charts_data(session: AsyncSession) -> dict:
    """Get all chart data for the Market Breadth page."""
    bt = await _compute_breadth_trends(session)
    uni = await _compute_universe(session)
    ema_df = await _compute_weekly_ema(session)

    dates = bt.get("dates", [])

    # DMA trends
    dma = {
        "pct_above_200dma": [{"date": d, "value": v} for d, v in zip(dates, bt["pct_above_200"])],
        "pct_above_50dma": [{"date": d, "value": v} for d, v in zip(dates, bt["pct_above_50"])],
        "pct_above_20dma": [{"date": d, "value": v} for d, v in zip(dates, bt["pct_above_20"])],
        "trend_200dma_above": [{"date": d, "value": v} for d, v in zip(dates, bt["above_200"])],
        "trend_200dma_below": [{"date": d, "value": v} for d, v in zip(dates, bt["below_200"])],
        "trend_50dma_above": [{"date": d, "value": v} for d, v in zip(dates, bt["above_50"])],
        "trend_50dma_below": [{"date": d, "value": v} for d, v in zip(dates, bt["below_50"])],
        "trend_20dma_above": [{"date": d, "value": v} for d, v in zip(dates, bt["above_20"])],
        "trend_20dma_below": [{"date": d, "value": v} for d, v in zip(dates, bt["below_20"])],
    }

    # EMA breadth by mcap
    ema_by_mcap = []
    comp = _load_company_master()
    if not ema_df.empty and not uni.empty and not comp.empty and "symbol" in comp.columns:
        ema_merged = ema_df.merge(comp[["symbol", "mcap_type"]], on="symbol", how="left")
        ema_merged["mcap_type"] = ema_merged["mcap_type"].fillna("")
        ema_merged["above_40w"] = ema_merged["ltp"] > ema_merged["ema_40w"]

        # Aggregate by mcap type — use latest universe date for single point
        for mtype, label in [("largecap", "largecap"), ("midcap", "midcap"), ("smallcap", "smallcap")]:
            subset = ema_merged[ema_merged["mcap_type"] == mtype]
            if len(subset) > 0:
                pct = subset["above_40w"].mean() * 100
            else:
                pct = 0
            ema_by_mcap.append({"date": dates[-1] if dates else "", "largecap" if mtype == "largecap" else "midcap" if mtype == "midcap" else "smallcap": round(pct, 2)})

        # Build a single summary point with all three mcap types
        summary = {"date": dates[-1] if dates else ""}
        for mtype in ["largecap", "midcap", "smallcap"]:
            subset = ema_merged[ema_merged["mcap_type"] == mtype]
            summary[mtype] = round(subset["above_40w"].mean() * 100, 2) if len(subset) > 0 else 0
        ema_by_mcap = [summary]

    # Volume breadth
    volume = [{"date": d, "above_avg": a, "below_avg": b}
              for d, a, b in zip(dates, bt.get("vol_above", []), bt.get("vol_below", []))]

    # 52W high/low
    high_low = [{"date": d, "new_highs": h, "new_lows": l}
                for d, h, l in zip(dates, bt.get("new_highs", []), bt.get("new_lows", []))]

    # VWAP breadth
    vwap = [{"date": d, "above": a, "below": b}
            for d, a, b in zip(dates, bt.get("vwap_above", []), bt.get("vwap_below", []))]

    # Momentum peaks
    momentum = [{"date": d, "value": v}
                for d, v in zip(bt.get("momentum_dates", []), bt.get("momentum", []))]

    # Drawdown peaks
    drawdown = [{"date": d, "value": v}
                for d, v in zip(bt.get("drawdown_dates", []), bt.get("drawdown", []))]

    # Gold vs Nifty
    gold_nifty = await _get_special_charts(session, ["GOLDBEES", "NIFTY 50"], days=730)

    # Nifty YoY
    nifty_yoy = await _get_nifty_yoy(session)

    return {
        "dma": dma,
        "ema_by_mcap": ema_by_mcap,
        "volume": volume,
        "high_low_52w": high_low,
        "vwap": vwap,
        "momentum_peaks": momentum,
        "drawdown_peaks": drawdown,
        "gold_vs_nifty": gold_nifty,
        "nifty_yoy": nifty_yoy,
        "cache_ts": _ts_str(_breadth_cache[0] if _breadth_cache else None),
    }


async def get_tables_data(session: AsyncSession) -> dict:
    """Get all table data for the Market Breadth page."""
    uni = await _compute_universe(session)
    ema_df = await _compute_weekly_ema(session)

    if uni.empty:
        return _empty_tables()

    latest_date = uni["latest_date"].iloc[0] if not uni.empty else ""

    # Sector EMA table
    sector_ema = _compute_sector_ema(ema_df)

    # Daily market moves
    daily_moves = _compute_daily_moves(uni)

    # Return tables
    return_tables = {}
    for period, col in [("1w", "ret_1w"), ("2w", "ret_2w"), ("1m", "ret_1m"),
                        ("3m", "ret_3m"), ("6m", "ret_6m"), ("1y", "ret_1y")]:
        valid = uni[uni[col].notna()].nlargest(10, col)
        return_tables[f"return_{period}"] = [
            {"symbol": r["symbol"], "pct_change": round(r[col], 2)}
            for _, r in valid.iterrows()
        ]

    # VWAP stocks
    vwap_stocks = {}
    for mcap, label in [("largecap", "vwap_largecap"), ("midcap", "vwap_midcap"),
                        ("smallcap", "vwap_smallcap"), ("microcap", "vwap_microcap")]:
        subset = uni[(uni.get("mcap_type", pd.Series(dtype=str)) == mcap) & (uni["ltp"] > uni["vwap"])]
        subset = subset.nlargest(10, "ltp")
        vwap_stocks[label] = [
            {"symbol": r["symbol"], "ltp": round(r["ltp"], 2), "vwap": round(r["vwap"], 2)}
            for _, r in subset.iterrows()
        ]

    # Stocks at 52W high
    at_52w = uni[uni["ltp"] >= uni["high_52w"] * 0.98].copy()
    at_52w = at_52w.nlargest(20, "ret_1w") if not at_52w.empty else at_52w
    stocks_52w = [
        {
            "symbol": r["symbol"],
            "close": round(r["ltp"], 2),
            "yearhigh": round(r["high_52w"], 2),
            "marketcap": round(r.get("marketcap", 0), 2),
            "mcap_category": r.get("mcap_type", ""),
            "industry": r.get("industry", ""),
            "sector": r.get("sector", ""),
            "weekly_return": round(r.get("ret_1w", 0), 2),
            "vol_multiple": round(r["volume"] / r["vol_avg_yr"], 2) if r.get("vol_avg_yr", 0) > 0 else 0,
        }
        for _, r in at_52w.iterrows()
    ]

    return {
        "sector_ema": sector_ema,
        "daily_moves": daily_moves,
        **return_tables,
        **vwap_stocks,
        "stocks_52w_high": stocks_52w,
        "cache_ts": _ts_str(_universe_cache[0] if _universe_cache else None),
    }


async def get_screeners_data(session: AsyncSession) -> dict:
    """Get screener results."""
    uni = await _compute_universe(session)
    ema_df = await _compute_weekly_ema(session)

    if uni.empty:
        return {"minervini": [], "darvas": [], "potential_breakouts": [],
                "modified_rs": [], "breakouts_v2": [], "cci_weekly": [],
                "cache_ts": None}

    def _row(r: pd.Series) -> dict:
        return {
            "symbol": r["symbol"],
            "sector": r.get("sector", ""),
            "mcap_category": r.get("mcap_type", ""),
            "week_1_pct": round(r.get("ret_1w", 0), 2),
            "vol_vs_yr_avg": round(r["volume"] / r["vol_avg_yr"], 2) if r.get("vol_avg_yr", 0) > 0 else 0,
        }

    # Minervini: price > SMA150 > SMA200, price > SMA50, price >= 1.3*52W low, price >= 0.75*52W high
    m = uni.dropna(subset=["sma_50", "sma_150", "sma_200"])
    minervini = m[
        (m["ltp"] > m["sma_150"]) &
        (m["sma_150"] > m["sma_200"]) &
        (m["ltp"] > m["sma_50"]) &
        (m["ltp"] >= m["low_52w"] * 1.3) &
        (m["ltp"] >= m["high_52w"] * 0.75)
    ].nlargest(20, "ret_1w")

    # Darvas: near 52W high (within 5%), volume > 20D avg
    darvas = uni.dropna(subset=["vol_avg_20"])
    darvas = darvas[
        (darvas["ltp"] >= darvas["high_52w"] * 0.95) &
        (darvas["volume"] > darvas["vol_avg_20"])
    ].nlargest(20, "ret_1w")

    # Potential Breakouts: within 5% of 52W high, volume > 20D avg
    breakouts = uni.dropna(subset=["vol_avg_20"])
    breakouts = breakouts[
        (breakouts["ltp"] >= breakouts["high_52w"] * 0.95) &
        (breakouts["volume"] > breakouts["vol_avg_20"])
    ].nlargest(20, "vol_vs_yr_avg" if "vol_vs_yr_avg" in breakouts.columns else "volume")

    # Modified RS: weighted return rank
    mrs = uni.dropna(subset=["ret_1m", "ret_3m", "ret_6m", "ret_1y"]).copy()
    mrs["rs_score"] = (mrs["ret_3m"] * 0.4 + mrs["ret_6m"] * 0.3 + mrs["ret_1y"] * 0.2 + mrs["ret_1m"] * 0.1)
    mrs = mrs.nlargest(20, "rs_score")

    # Breakouts v2: crossed above 200 DMA (was below yesterday, above today)
    b2 = uni.dropna(subset=["sma_200"])
    b2 = b2[
        (b2["ltp"] > b2["sma_200"]) &
        (b2["was_below_200"] == True) &  # noqa: E712
        (b2["volume"] > b2["vol_avg_20"] * 1.5)
    ].nlargest(20, "ret_1w")

    # CCI Weekly > 100: approximate using weekly EMA data
    cci_stocks = _compute_cci_weekly(ema_df, uni)

    return {
        "minervini": [_row(r) for _, r in minervini.iterrows()],
        "darvas": [_row(r) for _, r in darvas.iterrows()],
        "potential_breakouts": [_row(r) for _, r in breakouts.iterrows()],
        "modified_rs": [_row(r) for _, r in mrs.iterrows()],
        "breakouts_v2": [_row(r) for _, r in b2.iterrows()],
        "cci_weekly": cci_stocks,
        "cache_ts": _ts_str(_universe_cache[0] if _universe_cache else None),
    }


async def get_index_analysis(session: AsyncSession) -> dict:
    """Get index returns and distance from 40W EMA."""
    global _index_cache
    if _cache_fresh(_index_cache):
        return _index_cache[1]

    ema_df = await _compute_weekly_ema(session)
    uni = await _compute_universe(session)

    # Get index symbols from MongoDB (if available)
    index_symbols = []
    try:
        db = get_mongo_db()
        index_docs = list(db["indices_stocks"].find({}, {"_id": 0, "indicesName": 1}))
        index_names = [d["indicesName"] for d in index_docs if d.get("indicesName")]
        index_symbols = [n for n in index_names if n in uni["symbol"].values] if not uni.empty else []
    except RuntimeError:
        logger.warning("MongoDB unavailable — using common index list")

    # If no index symbols found, try common indices
    if not index_symbols:
        common_indices = ["NIFTY 50", "NIFTYMETAL", "NIFTYPSUBANK", "NIFTYINDDEFENCE",
                          "NIFTYCOMMODITIES", "CNXPHARMA", "NIFTYAUTO", "CNXENERGY",
                          "NIFTYHEALTHCARE", "INDIAVIX"]
        index_symbols = [s for s in common_indices if s in uni["symbol"].values] if not uni.empty else []

    # Distance from 40W EMA
    dist_40w = []
    if not ema_df.empty and index_symbols:
        idx_ema = ema_df[ema_df["symbol"].isin(index_symbols)]
        for _, r in idx_ema.iterrows():
            if r["ema_40w"] > 0:
                pct = (r["ltp"] - r["ema_40w"]) / r["ema_40w"] * 100
                dist_40w.append({"symbol": r["symbol"], "pct_from_40w": round(pct, 2)})
        dist_40w.sort(key=lambda x: x["pct_from_40w"], reverse=True)

    # Index returns
    def _idx_returns(col: str) -> list[dict]:
        if uni.empty or col not in uni.columns:
            return []
        idx_uni = uni[uni["symbol"].isin(index_symbols)].dropna(subset=[col])
        idx_uni = idx_uni.sort_values(col, ascending=False)
        return [{"symbol": r["symbol"], "pct_change": round(r[col], 2)} for _, r in idx_uni.iterrows()]

    result = {
        "dist_from_40w": dist_40w,
        "yearly_change": _idx_returns("ret_1y"),
        "quarterly_change": _idx_returns("ret_3m"),
        "weekly_change": _idx_returns("ret_1w"),
        "cache_ts": _ts_str(time.time()),
    }

    _index_cache = (time.time(), result)
    return result


def get_shareholding_movers() -> dict:
    """Get stocks where shareholding is increasing (sync, wrap in to_thread)."""
    global _shareholding_cache
    if _cache_fresh(_shareholding_cache):
        return _shareholding_cache[1]

    try:
        db = get_mongo_db()
    except RuntimeError:
        logger.warning("MongoDB unavailable — shareholding movers empty")
        empty = {"retail_increasing": [], "dii_increasing": [],
                 "promoter_increasing": [], "fii_increasing": [], "cache_ts": None}
        _shareholding_cache = (time.time(), empty)
        return empty

    # Get last 4 quarters
    all_yrcs = sorted(db["indira_cmots_shareholding_pattern"].distinct("YRC"))
    if len(all_yrcs) < 4:
        empty = {"retail_increasing": [], "dii_increasing": [],
                 "promoter_increasing": [], "fii_increasing": [], "cache_ts": None}
        _shareholding_cache = (time.time(), empty)
        return empty

    target_yrcs = all_yrcs[-4:]

    # Fetch all shareholding data for these quarters
    docs = list(db["indira_cmots_shareholding_pattern"].find(
        {"YRC": {"$in": target_yrcs}},
        {"_id": 0, "co_code": 1, "YRC": 1,
         "TotalPromoter_PerShares": 1, "PPIFII": 1, "PPIMF": 1, "PPIINS": 1,
         "PPINDL1L": 1, "PPINDM1L": 1},
    ))

    # Build co_code → symbol mapping
    comp = _load_company_master()
    co_code_to_symbol = {}
    if not comp.empty:
        comp_docs = list(db["indira_cmots_company_master"].find(
            {}, {"_id": 0, "co_code": 1, "nsesymbol": 1}
        ))
        for d in comp_docs:
            sym = (d.get("nsesymbol") or "").strip().upper()
            if sym and d.get("co_code"):
                co_code_to_symbol[int(d["co_code"])] = sym

    # Organize by co_code and quarter
    holdings: dict[int, dict[int, dict]] = {}
    for doc in docs:
        cc = int(doc.get("co_code", 0))
        yrc = int(doc.get("YRC", 0))
        if not cc or not yrc:
            continue
        if cc not in holdings:
            holdings[cc] = {}
        promoter = _safe_float(doc, "TotalPromoter_PerShares")
        fii = _safe_float(doc, "PPIFII")
        dii = _safe_float(doc, "PPIMF") + _safe_float(doc, "PPIINS")
        retail = _safe_float(doc, "PPINDL1L") + _safe_float(doc, "PPINDM1L")
        holdings[cc][yrc] = {"promoter": promoter, "fii": fii, "dii": dii, "retail": retail}

    # Compute movers for each holder type
    result = {}
    for holder_type in ["retail", "dii", "promoter", "fii"]:
        movers = []
        for cc, q_data in holdings.items():
            if len(q_data) < 4:
                continue
            vals = [q_data.get(yrc, {}).get(holder_type, 0) for yrc in target_yrcs]
            change = vals[-1] - vals[0]
            if change > 0:
                sym = co_code_to_symbol.get(cc, f"CO_{cc}")
                movers.append({
                    "symbol": sym,
                    "q3_ago": round(vals[0], 2),
                    "q2_ago": round(vals[1], 2),
                    "q1_ago": round(vals[2], 2),
                    "current_qtr": round(vals[3], 2),
                    "change_3q": round(change, 2),
                })
        movers.sort(key=lambda x: x["change_3q"], reverse=True)
        result[f"{holder_type}_increasing"] = movers[:20]

    result["cache_ts"] = _ts_str(time.time())
    _shareholding_cache = (time.time(), result)
    return result


def get_cache_status() -> dict:
    return {
        "universe_ts": _ts_str(_universe_cache[0] if _universe_cache else None),
        "breadth_ts": _ts_str(_breadth_cache[0] if _breadth_cache else None),
        "weekly_ema_ts": _ts_str(_weekly_ema_cache[0] if _weekly_ema_cache else None),
    }


# ============================= HELPER FUNCTIONS =============================


def _safe_float(doc: dict, key: str) -> float:
    val = doc.get(key)
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def _compute_sector_ema(ema_df: pd.DataFrame) -> list[dict]:
    """Compute % of stocks above each EMA level per sector."""
    if ema_df.empty:
        return []

    comp = _load_company_master()
    if comp.empty or "symbol" not in comp.columns:
        return []
    merged = ema_df.merge(comp[["symbol", "sector"]], on="symbol", how="left")
    merged["sector"] = merged["sector"].fillna("Unknown")

    rows = []
    for sector, g in merged.groupby("sector"):
        if len(g) < 3 or not sector:
            continue
        total = len(g)
        rows.append({
            "sector": sector,
            "pct_4w": round((g["ltp"] > g["ema_4w"]).sum() / total * 100, 2),
            "pct_20w": round((g["ltp"] > g["ema_20w"]).sum() / total * 100, 2),
            "pct_30w": round((g["ltp"] > g["ema_30w"]).sum() / total * 100, 2),
            "pct_40w": round((g["ltp"] > g["ema_40w"]).sum() / total * 100, 2),
            "pct_52w": round((g["ltp"] > g["ema_52w"]).sum() / total * 100, 2),
        })

    rows.sort(key=lambda x: x["pct_40w"], reverse=True)
    return rows


def _compute_daily_moves(uni: pd.DataFrame) -> list[dict]:
    """Compute daily market moves (stocks above/below % thresholds)."""
    if uni.empty:
        return []

    chg = uni["daily_chg"]
    latest_date = uni["latest_date"].iloc[0] if not uni.empty else ""

    return [{
        "date": latest_date,
        "abv_3": int((chg > 3).sum()),
        "blw_3": int((chg < -3).sum()),
        "abv_5": int((chg > 5).sum()),
        "blw_5": int((chg < -5).sum()),
        "abv_10": int((chg > 10).sum()),
        "blw_10": int((chg < -10).sum()),
    }]


def _compute_cci_weekly(ema_df: pd.DataFrame, uni: pd.DataFrame) -> list[dict]:
    """Approximate CCI Weekly > 100 screener."""
    if ema_df.empty or uni.empty:
        return []

    # CCI uses typical price and its 20-period SMA
    # We approximate using weekly EMA data
    # CCI > 100 indicates strong uptrend
    # As proxy: stocks where ltp is significantly above 20W EMA
    merged = ema_df.merge(
        uni[["symbol", "sector", "mcap_type", "ret_1w", "volume", "vol_avg_yr"]],
        on="symbol", how="inner",
    )

    # CCI proxy: (ltp - ema_20w) / ema_20w * 100 > some threshold
    merged["cci_proxy"] = (merged["ltp"] - merged["ema_20w"]) / merged["ema_20w"].replace(0, np.nan) * 100
    cci_stocks = merged[merged["cci_proxy"] > 5].nlargest(20, "cci_proxy")

    return [
        {
            "symbol": r["symbol"],
            "sector": r.get("sector", ""),
            "mcap_category": r.get("mcap_type", ""),
            "week_1_pct": round(r.get("ret_1w", 0), 2),
            "vol_vs_yr_avg": round(r["volume"] / r["vol_avg_yr"], 2) if r.get("vol_avg_yr", 0) > 0 else 0,
        }
        for _, r in cci_stocks.iterrows()
    ]


async def _get_special_charts(session: AsyncSession, symbols: list[str], days: int = 730) -> list[dict]:
    """Get price series for special chart overlays (Gold vs Nifty etc.)."""
    from datetime import timedelta
    cutoff = datetime.now() - timedelta(days=days)
    sql = text("""
        SELECT symbol, date_time, curr_price
        FROM public.historic_data
        WHERE symbol = ANY(:symbols) AND date_time >= :cutoff
        ORDER BY symbol, date_time
    """)

    result = await session.execute(sql, {"symbols": symbols, "cutoff": cutoff.date()})
    rows = result.fetchall()

    series = []
    from itertools import groupby as igroupby
    for sym, group in igroupby(rows, key=lambda r: r[0]):
        data = [{"date": str(r[1])[:10], "value": float(r[2])} for r in group]
        series.append({"name": sym, "data": data})

    return series


async def _get_nifty_yoy(session: AsyncSession) -> list[dict]:
    """Get Nifty current year vs previous year."""
    sql = text("""
        SELECT date_time, curr_price
        FROM public.historic_data
        WHERE symbol = 'NIFTY 50' AND date_time >= CURRENT_DATE - INTERVAL '2 years'
        ORDER BY date_time
    """)
    result = await session.execute(sql)
    rows = result.fetchall()

    if not rows:
        return []

    # Split into current year and previous year
    df = pd.DataFrame(rows, columns=["date_time", "curr_price"])
    df["date_time"] = pd.to_datetime(df["date_time"])
    current_year = df["date_time"].dt.year.max()

    current = df[df["date_time"].dt.year == current_year]
    previous = df[df["date_time"].dt.year == current_year - 1]

    series = []
    if not current.empty:
        series.append({
            "name": f"Nifty {current_year}",
            "data": [{"date": str(r["date_time"])[:10], "value": float(r["curr_price"])}
                     for _, r in current.iterrows()],
        })
    if not previous.empty:
        series.append({
            "name": f"Nifty {current_year - 1}",
            "data": [{"date": str(r["date_time"])[:10], "value": float(r["curr_price"])}
                     for _, r in previous.iterrows()],
        })
    return series


def _empty_tables() -> dict:
    return {
        "sector_ema": [], "daily_moves": [],
        "return_1w": [], "return_2w": [], "return_1m": [],
        "return_3m": [], "return_6m": [], "return_1y": [],
        "vwap_largecap": [], "vwap_midcap": [], "vwap_smallcap": [], "vwap_microcap": [],
        "stocks_52w_high": [], "cache_ts": None,
    }
