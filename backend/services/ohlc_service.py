"""
OHLC Service — queries public.historic_data and returns structured data.
Supports daily, weekly, and monthly interval aggregation via pandas.
"""

import logging
from datetime import date, timedelta
from typing import List

import pandas as pd
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.ohlc import OHLCData
from backend.schemas.ohlc import OHLCPoint, OHLCResponse
from backend.schemas.company import (
    MarketCapBucket, MarketStatsResponse,
    MarketCapTrendPoint, MarketCapTrendResponse,
)

logger = logging.getLogger(__name__)

DEFAULT_DAYS = 180  # 6 months default window


def _default_date_range() -> tuple[date, date]:
    end = date.today()
    start = end - timedelta(days=DEFAULT_DAYS)
    return start, end


def _aggregate_to_interval(df: pd.DataFrame, interval: str) -> pd.DataFrame:
    """Resample daily OHLC rows into weekly or monthly candles using pandas."""
    if interval not in ("weekly", "monthly") or df.empty:
        return df

    df = df.sort_values("date").copy()
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date")

    rule = "W-FRI" if interval == "weekly" else "ME"

    agg = df.resample(rule).agg(
        open=("open", "first"),
        high=("high", "max"),
        low=("low", "min"),
        close=("close", "last"),
        volume=("volume", "sum"),
        turnover=("turnover", "sum"),
        market_cap=("market_cap", "mean"),
    ).dropna(subset=["open", "close"])

    agg = agg.reset_index()
    agg["date"] = agg["date"].dt.strftime("%Y-%m-%d")
    return agg


async def get_ohlc(
    session: AsyncSession,
    symbol: str,
    start_date: date | None = None,
    end_date: date | None = None,
    interval: str = "daily",
) -> OHLCResponse:
    """Fetch OHLC data for a symbol, return aggregated by interval."""

    if start_date is None and end_date is None:
        start_date, end_date = _default_date_range()
    elif end_date is None:
        end_date = date.today()
    elif start_date is None:
        start_date = end_date - timedelta(days=DEFAULT_DAYS)

    symbol = symbol.upper()

    stmt = (
        select(
            OHLCData.date_time,
            OHLCData.open,
            OHLCData.high,
            OHLCData.low,
            OHLCData.curr_price.label("close"),
            OHLCData.volume,
            OHLCData.daily_turnover.label("turnover"),
            OHLCData.marketcap_value.label("market_cap"),
        )
        .where(
            OHLCData.symbol == symbol,
            OHLCData.date_time >= start_date,
            OHLCData.date_time <= end_date,
        )
        .order_by(OHLCData.date_time)
    )

    result = await session.execute(stmt)
    rows = result.fetchall()

    if not rows:
        return OHLCResponse(symbol=symbol, interval=interval, ohlc=[])

    if interval in ("weekly", "monthly"):
        # Only use pandas for aggregation when needed
        df = pd.DataFrame(rows, columns=["date", "open", "high", "low", "close", "volume", "turnover", "market_cap"])
        df["date"] = df["date"].astype(str)
        df = _aggregate_to_interval(df, interval)
        points = [
            OHLCPoint(
                date=str(row["date"]),
                open=round(row["open"], 2),
                high=round(row["high"], 2),
                low=round(row["low"], 2),
                close=round(row["close"], 2),
                volume=round(row["volume"], 0),
                turnover=round(row["turnover"], 2) if row["turnover"] else None,
                market_cap=round(row["market_cap"], 2) if row["market_cap"] else None,
            )
            for _, row in df.iterrows()
        ]
    else:
        # Daily: build points directly from rows — skip pandas overhead
        points = [
            OHLCPoint(
                date=str(r[0]),
                open=round(r[1], 2),
                high=round(r[2], 2),
                low=round(r[3], 2),
                close=round(r[4], 2),
                volume=round(r[5], 0),
                turnover=round(r[6], 2) if r[6] else None,
                market_cap=round(r[7], 2) if r[7] else None,
            )
            for r in rows
        ]

    return OHLCResponse(symbol=symbol, interval=interval, ohlc=points)


async def get_symbols_list(
    session: AsyncSession,
    search: str | None = None,
    page: int = 1,
    page_size: int = 100,
) -> tuple[List[dict], int]:
    """Return distinct symbols from historic_data, optionally filtered by search string."""

    # Filter to project universe
    from backend.services import company_master_service
    universe = company_master_service.get_universe_symbols()

    base_query = select(
        OHLCData.symbol,
        func.max(OHLCData.date_time).label("latest_date"),
        func.max(OHLCData.curr_price).label("latest_price"),
    ).group_by(OHLCData.symbol)

    if universe:
        base_query = base_query.where(OHLCData.symbol.in_(universe))
    if search:
        base_query = base_query.where(OHLCData.symbol.ilike(f"%{search.upper()}%"))

    # Count
    count_stmt = select(func.count()).select_from(
        base_query.subquery()
    )
    total = (await session.execute(count_stmt)).scalar_one()

    # Paginated
    offset = (page - 1) * page_size
    paged_stmt = base_query.order_by(OHLCData.symbol).offset(offset).limit(page_size)
    rows = (await session.execute(paged_stmt)).fetchall()

    return [{"symbol": r.symbol, "latest_date": str(r.latest_date), "latest_price": r.latest_price} for r in rows], total


async def get_symbol_latest(session: AsyncSession, symbol: str) -> dict | None:
    """Return the most recent OHLC row for a symbol."""
    symbol = symbol.upper()
    stmt = (
        select(
            OHLCData.symbol,
            OHLCData.date_time,
            OHLCData.curr_price,
            OHLCData.open,
            OHLCData.high,
            OHLCData.low,
            OHLCData.volume,
        )
        .where(OHLCData.symbol == symbol)
        .order_by(OHLCData.date_time.desc())
        .limit(1)
    )
    row = (await session.execute(stmt)).fetchone()
    if not row:
        return None
    return {
        "symbol": row.symbol,
        "date": str(row.date_time),
        "close": row.curr_price,
        "open": row.open,
        "high": row.high,
        "low": row.low,
        "volume": row.volume,
    }


# In-memory symbols cache with TTL (warmed at startup)
_symbols_cache: list[str] = []
_symbols_cache_ts: float = 0
_SYMBOLS_CACHE_TTL: float = 12 * 3600  # 12 hours


async def get_all_symbol_names(session: AsyncSession) -> list[str]:
    """Return distinct symbols filtered to the project universe (INE stocks only)."""
    global _symbols_cache, _symbols_cache_ts
    import time
    from backend.services import company_master_service

    if _symbols_cache and (time.time() - _symbols_cache_ts) < _SYMBOLS_CACHE_TTL:
        return _symbols_cache
    stmt = (
        select(OHLCData.symbol)
        .group_by(OHLCData.symbol)
        .order_by(OHLCData.symbol)
    )
    result = await session.execute(stmt)
    all_symbols = [row[0] for row in result.fetchall()]

    # Filter to universe (INE ISIN, Listed, not excluded)
    universe = company_master_service.get_universe_symbols()
    if universe:
        _symbols_cache = [s for s in all_symbols if s in universe]
    else:
        _symbols_cache = all_symbols
    _symbols_cache_ts = time.time()
    logger.info("Symbols cache populated: %d symbols (from %d total)", len(_symbols_cache), len(all_symbols))
    return _symbols_cache


# Market cap bucket definitions (ranges in Crores)
# NOTE: marketcap_value is assumed to be stored in Crores.
# If your DB stores it in Rupees, set CRORE_DIVISOR = 10_000_000.
CRORE_DIVISOR: float = 1.0

_BUCKETS: list[tuple[float, float | None, str, str]] = [
    (0,            100,       "0–100 Cr",    "Nano Cap"),
    (100,          1_000,     "100–1K Cr",   "Micro Cap"),
    (1_000,        10_000,    "1K–10K Cr",   "Small Cap"),
    (10_000,       1_00_000,  "10K–1L Cr",   "Mid Cap"),
    (1_00_000,     None,      "1L+ Cr",      "Large Cap"),
]


async def get_market_stats(session: AsyncSession) -> MarketStatsResponse:
    """Return market-wide statistics from the universe (same mcap source as market overview)."""
    from backend.services import universe_service

    all_companies = universe_service.get_all()
    if not all_companies:
        return MarketStatsResponse(
            total_symbols=0,
            total_market_cap_cr=0.0,
            latest_date=None,
            buckets=[],
        )

    # Collect mcap values (in Crores) from universe — same source as market overview
    caps: list[float] = []
    for c in all_companies:
        m = c.get("mcap")
        if m is not None:
            try:
                caps.append(float(m) / CRORE_DIVISOR)
            except (ValueError, TypeError):
                pass

    total_symbols = len(all_companies)
    total_cap = sum(caps)

    # Get latest date from DB for display
    from sqlalchemy import text as sa_text
    result = await session.execute(
        sa_text("SELECT MAX(date_time) FROM public.historic_data")
    )
    latest_row = result.scalar()
    latest_date = str(latest_row) if latest_row else None

    # Build buckets (only from companies that have mcap data)
    buckets: list[MarketCapBucket] = []
    for lo, hi, label, category in _BUCKETS:
        if hi is None:
            matched = [c for c in caps if c >= lo]
        else:
            matched = [c for c in caps if lo <= c < hi]
        buckets.append(
            MarketCapBucket(
                label=label,
                category=category,
                min_cr=lo,
                max_cr=hi,
                count=len(matched),
                total_cap_cr=round(sum(matched), 2),
            )
        )

    logger.info(
        "Market stats: %d companies (%d with mcap), total cap = %.2f Cr",
        total_symbols, len(caps), total_cap,
    )

    return MarketStatsResponse(
        total_symbols=total_symbols,
        total_market_cap_cr=round(total_cap, 2),
        latest_date=latest_date,
        buckets=buckets,
    )


async def get_market_cap_trend(
    session: AsyncSession,
    start_date: date | None = None,
    end_date: date | None = None,
    interval: str = "weekly",
) -> MarketCapTrendResponse:
    """Return time series of total market cap and company counts per bucket."""

    if end_date is None:
        end_date = date.today()

    t = OHLCData
    mcap = t.marketcap_value

    # Filter to project universe (All_companies_data.xlsx — 5,172 companies)
    from backend.services import universe_service
    universe = universe_service.get_all_symbols()

    conditions = [mcap > 0, t.date_time <= end_date]
    if start_date is not None:
        conditions.append(t.date_time >= start_date)
    if universe:
        conditions.append(t.symbol.in_(universe))

    stmt = (
        select(
            t.date_time.label("date"),
            func.sum(mcap).label("total_market_cap"),
            func.count().label("total_companies"),
            func.count().filter(mcap < 100).label("nano_count"),
            func.count().filter(and_(mcap >= 100, mcap < 1_000)).label("micro_count"),
            func.count().filter(and_(mcap >= 1_000, mcap < 10_000)).label("small_count"),
            func.count().filter(and_(mcap >= 10_000, mcap < 1_00_000)).label("mid_count"),
            func.count().filter(mcap >= 1_00_000).label("large_count"),
        )
        .where(*conditions)
        .group_by(t.date_time)
        .order_by(t.date_time)
    )

    result = await session.execute(stmt)
    rows = result.fetchall()

    effective_start = str(start_date) if start_date else "all"

    if not rows:
        return MarketCapTrendResponse(
            interval=interval,
            start_date=effective_start,
            end_date=str(end_date),
            total_points=0,
            data=[],
        )

    df = pd.DataFrame(rows, columns=[
        "date", "total_market_cap", "total_companies",
        "nano_count", "micro_count", "small_count", "mid_count", "large_count",
    ])

    if interval in ("weekly", "monthly"):
        df["date"] = pd.to_datetime(df["date"])
        df = df.set_index("date")
        rule = "W-FRI" if interval == "weekly" else "ME"
        df = df.resample(rule).last().dropna(subset=["total_market_cap"])
        df = df.reset_index()

    points = [
        MarketCapTrendPoint(
            date=str(row["date"].date() if hasattr(row["date"], "date") else row["date"]),
            total_market_cap_cr=round(float(row["total_market_cap"]), 2),
            total_companies=int(row["total_companies"]),
            nano_count=int(row["nano_count"]),
            micro_count=int(row["micro_count"]),
            small_count=int(row["small_count"]),
            mid_count=int(row["mid_count"]),
            large_count=int(row["large_count"]),
        )
        for _, row in df.iterrows()
    ]

    logger.info(
        "Market cap trend: %d points (%s, %s → %s)",
        len(points), interval, start_date, end_date,
    )

    return MarketCapTrendResponse(
        interval=interval,
        start_date=effective_start,
        end_date=str(end_date),
        total_points=len(points),
        data=points,
    )
