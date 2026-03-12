"""
Star Investors API — /api/v1/star-investors/
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.schemas.common import StandardResponse
from backend.services import star_investor_service, returns_service

router = APIRouter()
logger = logging.getLogger(__name__)


async def _get_bulk_sparklines(
    session: AsyncSession, symbols: list[str], days: int = 60,
) -> dict[str, list[dict[str, float]]]:
    """Fetch last N days of closing prices for multiple symbols."""
    if not symbols:
        return {}
    cutoff = datetime.now() - timedelta(days=days)
    sql = text("""
        SELECT symbol, curr_price
        FROM public.historic_data
        WHERE symbol = ANY(:symbols) AND date_time >= :cutoff
        ORDER BY symbol, date_time
    """)
    try:
        result = await session.execute(sql, {"symbols": symbols, "cutoff": cutoff.date()})
        rows = result.fetchall()
    except Exception:
        logger.exception("Sparkline query failed")
        return {}

    sparklines: dict[str, list[dict[str, float]]] = {}
    for sym, price in rows:
        sparklines.setdefault(sym, []).append({"value": float(price)})
    return sparklines


def _attach_sparklines(
    items: list[dict[str, Any]], sparklines: dict[str, list[dict[str, float]]],
) -> None:
    """Attach sparkline arrays to holdings/changes by symbol."""
    for item in items:
        item["sparkline"] = sparklines.get(item.get("symbol", ""), [])


@router.get("/top")
async def get_top_investors(
    limit: int = Query(50, ge=1, le=500),
):
    """Return top investors by number of distinct holdings."""
    try:
        data = await asyncio.to_thread(star_investor_service.get_top_investors, limit)
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("star-investors/top failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/search")
async def search_investors(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Search investor names."""
    try:
        data = await asyncio.to_thread(star_investor_service.search_investors, q, limit)
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("star-investors/search failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/{investor_name}/holdings")
async def get_investor_holdings(
    investor_name: str,
    period: str = Query("1m"),
    session: AsyncSession = Depends(get_session),
):
    """Get investor holdings enriched with price returns + sparklines."""
    try:
        holdings = await asyncio.to_thread(
            star_investor_service.get_investor_holdings, investor_name,
        )
        returns_data = await returns_service.get_multi_period_returns(session)
        enriched = star_investor_service.enrich_with_returns(holdings, returns_data, period)
        symbols = [h["symbol"] for h in enriched if h.get("symbol")]
        sparklines = await _get_bulk_sparklines(session, symbols)
        _attach_sparklines(enriched, sparklines)
        return StandardResponse(success=True, data={
            "investor_name": investor_name,
            "total_holdings": len(enriched),
            "holdings": enriched,
        })
    except Exception as e:
        logger.exception("star-investors/%s/holdings failed", investor_name)
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/{investor_name}/key-changes")
async def get_investor_key_changes(
    investor_name: str,
    period: str = Query("1m"),
    session: AsyncSession = Depends(get_session),
):
    """Get quarter-over-quarter stake changes for investor + sparklines."""
    try:
        changes = await asyncio.to_thread(
            star_investor_service.get_investor_key_changes, investor_name,
        )
        returns_data = await returns_service.get_multi_period_returns(session)
        enriched = star_investor_service.enrich_with_returns(changes, returns_data, period)
        symbols = [c["symbol"] for c in enriched if c.get("symbol")]
        sparklines = await _get_bulk_sparklines(session, symbols)
        _attach_sparklines(enriched, sparklines)
        return StandardResponse(success=True, data={
            "investor_name": investor_name,
            "changes": enriched,
        })
    except Exception as e:
        logger.exception("star-investors/%s/key-changes failed", investor_name)
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/{investor_name}/gainers-losers")
async def get_investor_gainers_losers(
    investor_name: str,
    period: str = Query("1m"),
    session: AsyncSession = Depends(get_session),
):
    """Get investor holdings split into gainers and losers + sparklines."""
    try:
        holdings = await asyncio.to_thread(
            star_investor_service.get_investor_holdings, investor_name,
        )
        returns_data = await returns_service.get_multi_period_returns(session)
        enriched = star_investor_service.enrich_with_returns(holdings, returns_data, period)
        symbols = [h["symbol"] for h in enriched if h.get("symbol")]
        sparklines = await _get_bulk_sparklines(session, symbols)
        _attach_sparklines(enriched, sparklines)
        gainers, losers = star_investor_service.get_gainers_losers(enriched)
        return StandardResponse(success=True, data={
            "investor_name": investor_name,
            "period": period,
            "gainers": gainers,
            "losers": losers,
        })
    except Exception as e:
        logger.exception("star-investors/%s/gainers-losers failed", investor_name)
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)
