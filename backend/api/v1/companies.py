import math
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.schemas.common import PaginationMeta, StandardResponse
from backend.schemas.company import (
    CompanyListResponse, CompanySymbol, MarketStatsResponse, MarketCapTrendResponse,
)
from backend.services import ohlc_service

router = APIRouter()


@router.get("", response_model=StandardResponse[CompanyListResponse])
async def list_companies(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=500)] = 100,
    session: AsyncSession = Depends(get_session),
):
    """List all available stock symbols with latest price."""
    rows, total = await ohlc_service.get_symbols_list(session, page=page, page_size=page_size)
    companies = [CompanySymbol(**r) for r in rows]

    return StandardResponse(
        success=True,
        data=CompanyListResponse(companies=companies, total=total),
        meta=PaginationMeta(
            total=total,
            page=page,
            page_size=page_size,
            total_pages=math.ceil(total / page_size),
        ),
    )


@router.get("/symbols")
async def list_all_symbols(session: AsyncSession = Depends(get_session)):
    """Return all distinct symbol names as a plain list — for client-side autocomplete."""
    symbols = await ohlc_service.get_all_symbol_names(session)
    return {"symbols": symbols, "total": len(symbols)}


@router.get("/search", response_model=StandardResponse[CompanyListResponse])
async def search_companies(
    q: Annotated[str, Query(min_length=1, description="Search query (symbol prefix/contains)")],
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
    session: AsyncSession = Depends(get_session),
):
    """Search symbols by query string — used for autocomplete."""
    rows, total = await ohlc_service.get_symbols_list(session, search=q, page=1, page_size=limit)
    companies = [CompanySymbol(**r) for r in rows]
    return StandardResponse(
        success=True,
        data=CompanyListResponse(companies=companies, total=total),
    )


@router.get("/market-stats", response_model=MarketStatsResponse)
async def get_market_stats(session: AsyncSession = Depends(get_session)):
    """Market-wide statistics: total stocks, market cap buckets, totals."""
    return await ohlc_service.get_market_stats(session)


@router.get("/market-cap-trend", response_model=MarketCapTrendResponse)
async def get_market_cap_trend(
    start_date: Annotated[date | None, Query(description="Start date YYYY-MM-DD")] = None,
    end_date: Annotated[date | None, Query(description="End date YYYY-MM-DD")] = None,
    interval: Annotated[
        Literal["daily", "weekly", "monthly"],
        Query(description="Aggregation interval"),
    ] = "weekly",
    session: AsyncSession = Depends(get_session),
):
    """Time series of total market cap and company count per bucket."""
    return await ohlc_service.get_market_cap_trend(session, start_date, end_date, interval)


@router.get("/{symbol}")
async def get_company(
    symbol: str,
    session: AsyncSession = Depends(get_session),
):
    """Return metadata and latest price for a single symbol."""
    row = await ohlc_service.get_symbol_latest(session, symbol)
    if not row:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found")
    return StandardResponse(success=True, data=row)
