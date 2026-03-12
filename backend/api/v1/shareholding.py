"""
Shareholding API — /api/v1/shareholding/
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.schemas.common import StandardResponse
from backend.schemas.shareholding import (
    AllSectorsSummaryResponse,
    IndustryTrendResponse,
    SectorAnalyticsResponse,
    SectorListResponse,
    ShareholdingResponse,
)
from backend.services import shareholding_service
from backend.services import sector_analytics_service

router = APIRouter()
logger = logging.getLogger(__name__)


# --- Static routes MUST come before /{symbol} ---

@router.get("/shareholder-names")
async def get_shareholder_names():
    """Return all unique shareholder names from the >1% shareholding collection."""
    try:
        names = await asyncio.to_thread(shareholding_service.get_all_shareholder_names)
        return StandardResponse(success=True, data=names)
    except Exception as e:
        logger.exception("shareholding/shareholder-names failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/sectors", response_model=StandardResponse[SectorListResponse])
async def get_sectors():
    """List all distinct sectors for the dropdown."""
    try:
        sectors = await asyncio.to_thread(shareholding_service.get_all_sectors)
        return StandardResponse(success=True, data=SectorListResponse(sectors=sectors))
    except Exception as e:
        logger.exception("shareholding/sectors failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/all-sectors-summary", response_model=StandardResponse[AllSectorsSummaryResponse])
async def get_all_sectors_summary():
    """Get shareholding summary for all sectors with sparkline data (last 8 quarters)."""
    try:
        data = await asyncio.to_thread(shareholding_service.get_all_sectors_summary)
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("shareholding/all-sectors-summary failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/industry-trend", response_model=StandardResponse[IndustryTrendResponse])
async def get_industry_trend(sector: str = Query(..., min_length=1, description="Sector name")):
    """Get industry-wise aggregated shareholding trends for a sector."""
    try:
        data = await asyncio.to_thread(shareholding_service.get_industry_trend, sector)
        if data.total_companies == 0:
            raise HTTPException(status_code=404, detail=f"No companies found for sector '{sector}'")
        return StandardResponse(success=True, data=data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("shareholding/industry-trend failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/sector-analytics", response_model=StandardResponse[SectorAnalyticsResponse])
async def get_sector_analytics(
    sector: str = Query(..., min_length=1, description="Sector name"),
    quarters: int = Query(8, ge=2, le=20, description="Number of quarters"),
    session: AsyncSession = Depends(get_session),
):
    """Cross-database sector shareholding decomposition (MongoDB + PostgreSQL)."""
    try:
        mongo_data = await asyncio.to_thread(
            sector_analytics_service.get_sector_mongo_data, sector, quarters,
        )
        if not mongo_data["companies"]:
            raise HTTPException(status_code=404, detail=f"No companies found for sector '{sector}'")

        prices = await sector_analytics_service.get_month_end_prices(
            session, mongo_data["symbols"], mongo_data["extended_yrcs"],
        )
        result = await asyncio.to_thread(
            sector_analytics_service.compute_sector_analytics, sector, mongo_data, prices,
        )
        return StandardResponse(success=True, data=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("shareholding/sector-analytics failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


# --- Dynamic route ---

@router.get("/{symbol}", response_model=StandardResponse[ShareholdingResponse])
async def get_shareholding(symbol: str):
    """Get shareholding pattern data for a stock symbol."""
    try:
        # Resolve symbol → co_code (synchronous pymongo → run in thread)
        result = await asyncio.to_thread(shareholding_service.resolve_symbol, symbol.upper())
        if result is None:
            raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found in company master")

        co_code, company_info = result

        # Fetch shareholding data
        data = await asyncio.to_thread(
            shareholding_service.get_shareholding,
            symbol.upper(),
            co_code,
            company_info,
        )

        return StandardResponse(success=True, data=data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("shareholding/%s failed", symbol)
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)
