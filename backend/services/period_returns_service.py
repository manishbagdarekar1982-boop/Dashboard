"""
Period Returns Service — computes calendar-year % price changes for all symbols.

For each year (2000–current), return = (last_trading_price - first_trading_price)
                                       / first_trading_price * 100

Cached for 6 hours.
"""

import logging
import time
from collections import defaultdict
from datetime import date
from typing import Any

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.services import universe_service

logger = logging.getLogger(__name__)

# ── Cache ──────────────────────────────────────────────────────────
_cache: dict[str, Any] | None = None
_cache_ts: float = 0.0
_CACHE_TTL = 6 * 60 * 60  # 6 hours

START_YEAR = 2000


async def get_yearly_returns(session: AsyncSession) -> dict[str, Any]:
    """Compute calendar-year % returns for all symbols, years 2000–present."""
    global _cache, _cache_ts

    now = time.time()
    if _cache is not None and (now - _cache_ts) < _CACHE_TTL:
        logger.debug("Yearly returns served from cache")
        return _cache

    t0 = time.time()

    # Step 1: Get first and last trading date per year
    result = await session.execute(
        sa_text(
            "SELECT EXTRACT(YEAR FROM date_time)::int AS yr, "
            "       MIN(date_time) AS start_dt, "
            "       MAX(date_time) AS end_dt "
            "FROM historic_data "
            "WHERE date_time >= :start "
            "GROUP BY 1 ORDER BY 1"
        ),
        {"start": date(START_YEAR, 1, 1)},
    )
    year_bounds = result.fetchall()

    if not year_bounds:
        logger.warning("Period returns: no data found")
        return {"columns": [], "data": []}

    # Collect all boundary dates and build year→(start, end) map
    year_map: dict[int, tuple[date, date]] = {}
    all_boundary_dates: set[date] = set()
    for row in year_bounds:
        yr, start_dt, end_dt = int(row[0]), row[1], row[2]
        year_map[yr] = (start_dt, end_dt)
        all_boundary_dates.add(start_dt)
        all_boundary_dates.add(end_dt)

    sorted_dates = sorted(all_boundary_dates)
    years = sorted(year_map.keys(), reverse=True)

    logger.info(
        "Period returns: %d years (%d–%d), %d boundary dates",
        len(years), years[-1], years[0], len(sorted_dates),
    )

    # Step 2: Fetch prices on all boundary dates
    result = await session.execute(
        sa_text(
            "SELECT symbol, date_time, curr_price "
            "FROM historic_data "
            "WHERE date_time = ANY(:dates)"
        ),
        {"dates": sorted_dates},
    )
    rows = result.fetchall()

    logger.info("Period returns: fetched %d price rows in %.1fs", len(rows), time.time() - t0)

    # Build price map: symbol → date → price
    price_map: dict[str, dict[date, float]] = defaultdict(dict)
    for row in rows:
        sym, dt, price = row[0], row[1], row[2]
        if price is not None and float(price) > 0:
            price_map[sym][dt] = float(price)

    # Step 3: Compute % change per symbol per year
    all_universe_syms = universe_service.get_all_symbols()
    seen_co_codes: set[int] = set()
    data: list[dict[str, Any]] = []

    for symbol, date_prices in price_map.items():
        if symbol not in all_universe_syms:
            continue

        uni = universe_service.get_by_symbol(symbol)
        if not uni:
            continue

        co_code = uni.get("co_code")
        if co_code is not None:
            seen_co_codes.add(int(co_code))

        entry: dict[str, Any] = {
            "symbol": symbol,
            "sector": uni.get("ace_sector"),
            "industry": uni.get("ace_industry"),
            "mcap_type": uni.get("mcaptype"),
        }

        for yr in years:
            start_dt, end_dt = year_map[yr]
            start_price = date_prices.get(start_dt)
            end_price = date_prices.get(end_dt)
            if start_price and start_price > 0 and end_price and end_price > 0:
                entry[str(yr)] = round(
                    (end_price - start_price) / start_price * 100, 2
                )
            else:
                entry[str(yr)] = None

        data.append(entry)

    # Step 4: Add universe companies without price data
    all_companies = universe_service.get_all()
    for comp in all_companies:
        cc = comp.get("co_code")
        if cc is not None and int(cc) in seen_co_codes:
            continue

        nse_sym = comp.get("nse_symbol") or None
        bse_sym = comp.get("bse_symbol") or None
        display_symbol = nse_sym or bse_sym or str(cc)

        entry = {
            "symbol": display_symbol,
            "sector": comp.get("ace_sector"),
            "industry": comp.get("ace_industry"),
            "mcap_type": comp.get("mcaptype"),
        }
        for yr in years:
            entry[str(yr)] = None

        data.append(entry)

    data.sort(key=lambda x: x["symbol"] or "")

    result_payload = {
        "columns": [str(yr) for yr in years],
        "data": data,
    }

    _cache = result_payload
    _cache_ts = now
    logger.info(
        "Period returns: %d symbols, %d years in %.1fs (cached 6h)",
        len(data), len(years), time.time() - t0,
    )
    return result_payload
