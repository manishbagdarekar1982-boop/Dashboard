"""
Market Overview API — /api/v1/market-overview/
"""

import asyncio
import logging

from fastapi import APIRouter, Query

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.schemas.common import StandardResponse
from backend.schemas.market_overview import MarketOverviewResponse
from backend.schemas.market_overview_trends import MarketOverviewTrendsResponse
from backend.schemas.market_overview_split_trends import SplitTrendResponse
from backend.schemas.market_overview_scanner import ScannerResponse
from backend.services import (
    market_overview_service,
    market_overview_trends_service,
    market_overview_split_trends_service,
    market_overview_scanner_service,
    returns_service,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("", response_model=StandardResponse[MarketOverviewResponse])
async def get_market_overview():
    """Return all companies with pre-joined financial, index, and SME data.
    Client-side filtering is preferred since the dataset is ~6500 records.
    """
    try:
        data = await asyncio.to_thread(market_overview_service.get_market_overview)
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("market-overview failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/trends", response_model=StandardResponse[MarketOverviewTrendsResponse])
async def get_market_overview_trends():
    """Return pre-aggregated trend data for 27 market metrics.
    Data is cached for 6 hours. Aggregates across ALL companies.
    """
    try:
        data = await asyncio.to_thread(
            market_overview_trends_service.get_market_overview_trends
        )
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("market-overview/trends failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get(
    "/trends/split", response_model=StandardResponse[SplitTrendResponse]
)
async def get_split_trends(
    metric: str = Query("total_companies", description="Metric to plot"),
    split_by: str = Query("mcap_bucket", description="Category to split by"),
):
    """Return time-series data for a metric split by a category dimension."""
    try:
        data = await asyncio.to_thread(
            market_overview_split_trends_service.get_split_trends, metric, split_by
        )
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("market-overview/trends/split failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/trends/split/options")
async def get_split_options():
    """Return available metrics and split dimensions."""
    return StandardResponse(
        success=True,
        data=market_overview_split_trends_service.get_available_options(),
    )


@router.get("/scanner", response_model=StandardResponse[ScannerResponse])
async def get_scanner_data(
    metric: str = Query("promoter_holding", description="Scanner metric to query"),
):
    """Return top companies by change in the selected metric over the last 4 periods."""
    try:
        data = await asyncio.to_thread(
            market_overview_scanner_service.get_scanner_data, metric
        )
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("market-overview/scanner failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/scanner/options")
async def get_scanner_options():
    """Return available scanner metrics."""
    return StandardResponse(
        success=True,
        data=market_overview_scanner_service.get_scanner_options(),
    )


@router.get("/returns")
async def get_multi_period_returns(
    session: AsyncSession = Depends(get_session),
):
    """Return % price change for all symbols across 10 time periods."""
    try:
        data = await returns_service.get_multi_period_returns(session)
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("market-overview/returns failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)
