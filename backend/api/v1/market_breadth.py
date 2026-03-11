"""
Market Breadth API — /api/v1/market-breadth/
"""

import asyncio
import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.schemas.common import StandardResponse
from backend.schemas.market_breadth import (
    CacheStatusResponse,
    ChartsResponse,
    IndexReturnsResponse,
    ScreenersResponse,
    ShareholdingMoversResponse,
    TablesResponse,
)
from backend.services import market_breadth_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/charts", response_model=StandardResponse[ChartsResponse])
async def get_charts(session: AsyncSession = Depends(get_session)):
    """All chart data: DMA/EMA breadth trends, volume, 52W, VWAP, momentum, drawdowns."""
    try:
        data = await market_breadth_service.get_charts_data(session)
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("market-breadth/charts failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/tables", response_model=StandardResponse[TablesResponse])
async def get_tables(session: AsyncSession = Depends(get_session)):
    """All table data: returns, VWAP stocks, daily moves, sector EMA, 52W high."""
    try:
        data = await market_breadth_service.get_tables_data(session)
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("market-breadth/tables failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/screeners", response_model=StandardResponse[ScreenersResponse])
async def get_screeners(session: AsyncSession = Depends(get_session)):
    """Screener results: Minervini, Darvas, Breakouts, CCI, Modified RS."""
    try:
        data = await market_breadth_service.get_screeners_data(session)
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("market-breadth/screeners failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/index-analysis", response_model=StandardResponse[IndexReturnsResponse])
async def get_index_analysis(session: AsyncSession = Depends(get_session)):
    """Index returns and distance from 40W EMA."""
    try:
        data = await market_breadth_service.get_index_analysis(session)
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("market-breadth/index-analysis failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/shareholding", response_model=StandardResponse[ShareholdingMoversResponse])
async def get_shareholding():
    """Stocks where shareholding is increasing by type."""
    try:
        data = await asyncio.to_thread(market_breadth_service.get_shareholding_movers)
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("market-breadth/shareholding failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/status", response_model=StandardResponse[CacheStatusResponse])
async def get_status():
    """Cache freshness info."""
    data = market_breadth_service.get_cache_status()
    return StandardResponse(success=True, data=data)
