"""
Returns Service — computes multi-period % price changes for all symbols
using PostgreSQL historic_data table.

Periods: 1D, 1W, 1M, 3M, 6M, 1Y, 2Y, 3Y, 5Y, 10Y
Cached for 6 hours.
"""

import logging
import time
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from dateutil.relativedelta import relativedelta
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.services import company_master_service
from backend.services import universe_service

logger = logging.getLogger(__name__)

# ── Cache ──────────────────────────────────────────────────────────
_cache: list[dict[str, Any]] | None = None
_cache_ts: float = 0.0
_CACHE_TTL = 6 * 60 * 60  # 6 hours

PERIOD_KEYS = ["1d", "1w", "1m", "3m", "6m", "1y", "2y", "3y", "5y", "10y"]


async def get_multi_period_returns(session: AsyncSession) -> list[dict[str, Any]]:
    """Compute % price changes for all symbols across 10 time periods."""
    global _cache, _cache_ts

    now = time.time()
    if _cache is not None and (now - _cache_ts) < _CACHE_TTL:
        logger.debug("Returns served from cache (%d symbols)", len(_cache))
        return _cache

    t0 = time.time()

    # Step 1: Get distinct trading dates (last ~2600 = 10+ years)
    result = await session.execute(
        sa_text(
            "SELECT DISTINCT date_time FROM historic_data "
            "ORDER BY date_time DESC LIMIT 2700"
        )
    )
    all_dates: list[date] = [row[0] for row in result.fetchall()]

    if not all_dates:
        logger.warning("Returns: no dates found in historic_data")
        return []

    latest_date = all_dates[0]

    # Step 2: For each period, find the nearest actual trading date
    target_offsets = {
        "1d": timedelta(days=1),
        "1w": timedelta(weeks=1),
        "1m": relativedelta(months=1),
        "3m": relativedelta(months=3),
        "6m": relativedelta(months=6),
        "1y": relativedelta(years=1),
        "2y": relativedelta(years=2),
        "3y": relativedelta(years=3),
        "5y": relativedelta(years=5),
        "10y": relativedelta(years=10),
    }

    actual_dates: dict[str, date | None] = {"latest": latest_date}
    for period, offset in target_offsets.items():
        target = latest_date - offset
        nearest = None
        for d in all_dates:
            if d <= target:
                nearest = d
                break
        actual_dates[period] = nearest

    # Step 3: Collect unique dates to query
    unique_dates = list({d for d in actual_dates.values() if d is not None})
    unique_dates.sort()

    logger.info(
        "Returns: latest=%s, querying %d unique dates for %d periods",
        latest_date, len(unique_dates), len(target_offsets),
    )

    # Step 4: Fetch prices for all symbols on these dates in ONE query
    result = await session.execute(
        sa_text(
            "SELECT symbol, date_time, curr_price, marketcap_value "
            "FROM historic_data "
            "WHERE date_time = ANY(:dates)"
        ),
        {"dates": unique_dates},
    )
    rows = result.fetchall()

    logger.info("Returns: fetched %d price rows in %.1fs", len(rows), time.time() - t0)

    # Step 5: Build price map — symbol → date → (price, mcap)
    price_map: dict[str, dict[date, float]] = defaultdict(dict)
    mcap_map: dict[str, float] = {}
    for row in rows:
        sym, dt, price, mcap = row[0], row[1], row[2], row[3]
        if price is not None and float(price) > 0:
            price_map[sym][dt] = float(price)
        # Keep marketcap from latest date
        if dt == latest_date and mcap is not None:
            try:
                mcap_val = float(mcap)
                if mcap_val > 0:
                    mcap_map[sym] = round(mcap_val, 2)  # Already in Crores
            except (ValueError, TypeError):
                pass

    # Step 6: Compute % changes and attach sector/industry
    all_universe_syms = universe_service.get_all_symbols()
    seen_co_codes: set[int] = set()  # Track which universe companies have price data
    results: list[dict[str, Any]] = []

    for symbol, date_prices in price_map.items():
        if symbol not in all_universe_syms:
            continue
        latest_price = date_prices.get(actual_dates["latest"])
        if latest_price is None or latest_price <= 0:
            continue

        # Sector/Industry/ISIN from universe Excel (matches NSE or BSE symbol)
        uni = universe_service.get_by_symbol(symbol)
        sector = uni.get("ace_sector") if uni else None
        industry = uni.get("ace_industry") if uni else None
        isin = uni.get("isin") if uni else None
        mcap_type = uni.get("mcaptype") if uni else None
        nse_flag = uni.get("nse_listed_flag") if uni else None
        bse_flag = uni.get("bse_listed_flag") if uni else None
        co_code = uni.get("co_code") if uni else None

        # Determine exchange listing
        if nse_flag == "Y" and bse_flag == "Y":
            exchange = "Both"
        elif nse_flag == "Y":
            exchange = "NSE"
        else:
            exchange = "BSE"

        if co_code is not None:
            seen_co_codes.add(int(co_code))

        entry: dict[str, Any] = {
            "symbol": symbol,
            "price": round(latest_price, 2),
            "mcap": mcap_map.get(symbol),
            "mcap_type": mcap_type,
            "exchange": exchange,
            "isin": isin,
            "sector": sector,
            "industry": industry,
        }

        for period in PERIOD_KEYS:
            target_date = actual_dates.get(period)
            past_price = date_prices.get(target_date) if target_date else None
            if past_price and past_price > 0:
                change = round((latest_price - past_price) / past_price * 100, 2)
                entry[period] = change
            else:
                entry[period] = None

        results.append(entry)

    # Step 7: Add universe companies that have NO price data (null returns)
    all_companies = universe_service.get_all()
    for comp in all_companies:
        cc = comp.get("co_code")
        if cc is not None and int(cc) in seen_co_codes:
            continue  # Already added via price data

        nse_sym = comp.get("nse_symbol") or None
        bse_sym = comp.get("bse_symbol") or None
        display_symbol = nse_sym or bse_sym or str(cc)

        nse_flag = comp.get("nse_listed_flag")
        bse_flag = comp.get("bse_listed_flag")
        if nse_flag == "Y" and bse_flag == "Y":
            exchange = "Both"
        elif nse_flag == "Y":
            exchange = "NSE"
        else:
            exchange = "BSE"

        entry = {
            "symbol": display_symbol,
            "price": None,
            "mcap": None,
            "mcap_type": comp.get("mcaptype"),
            "exchange": exchange,
            "isin": comp.get("isin"),
            "sector": comp.get("ace_sector"),
            "industry": comp.get("ace_industry"),
        }
        for period in PERIOD_KEYS:
            entry[period] = None

        results.append(entry)

    logger.info(
        "Returns: %d with price data, %d without (total %d universe companies)",
        len(seen_co_codes), len(results) - len(seen_co_codes), len(results),
    )

    # Sort by symbol
    results.sort(key=lambda x: x["symbol"] or "")

    _cache = results
    _cache_ts = now
    logger.info(
        "Returns: computed %d symbols in %.1fs (cached for 6h)",
        len(results), time.time() - t0,
    )
    return results
