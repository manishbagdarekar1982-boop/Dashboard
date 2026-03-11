"""
Mutual Fund Holdings API — /api/v1/mutual-funds/
"""

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query

from backend.schemas.common import StandardResponse
from backend.schemas.mutual_fund import (
    MFAssetAllocationResponse,
    MFBuySellResponse,
    MFFiltersResponse,
    MFHoldingsResponse,
    MFInsightsResponse,
)
from backend.services import mutual_fund_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/months", response_model=StandardResponse[list[str]])
async def get_months():
    """List available month-end dates."""
    try:
        months = await asyncio.to_thread(mutual_fund_service.get_available_months)
        return StandardResponse(success=True, data=months)
    except Exception as e:
        logger.exception("mutual-funds/months failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/holdings", response_model=StandardResponse[MFHoldingsResponse])
async def get_holdings(
    month: str = Query(..., description="Month-end date, e.g. 2025-08-31T00:00:00"),
):
    """Get holdings with ChangeType comparison vs previous month."""
    try:
        months = await asyncio.to_thread(mutual_fund_service.get_available_months)
        if month not in months:
            raise HTTPException(status_code=404, detail=f"Month '{month}' not found")

        data = await asyncio.to_thread(mutual_fund_service.get_holdings, month)
        return StandardResponse(success=True, data=data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("mutual-funds/holdings failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/buy-sell", response_model=StandardResponse[MFBuySellResponse])
async def get_buy_sell(
    start_date: str | None = Query(None, description="Start date filter"),
    end_date: str | None = Query(None, description="End date filter"),
):
    """Get buy/sell analysis across months."""
    try:
        data = await asyncio.to_thread(
            mutual_fund_service.get_buy_sell, start_date, end_date,
        )
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("mutual-funds/buy-sell failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/insights", response_model=StandardResponse[MFInsightsResponse])
async def get_insights(
    month: str = Query(..., description="Month-end date"),
):
    """Get most/least popular stocks for a month."""
    try:
        data = await asyncio.to_thread(mutual_fund_service.get_insights, month)
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("mutual-funds/insights failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/asset-allocation", response_model=StandardResponse[MFAssetAllocationResponse])
async def get_asset_allocation(
    month: str = Query(..., description="Month-end date"),
):
    """Get per-fund asset allocation breakdown."""
    try:
        data = await asyncio.to_thread(mutual_fund_service.get_asset_allocation, month)
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("mutual-funds/asset-allocation failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)


@router.get("/filters", response_model=StandardResponse[MFFiltersResponse])
async def get_filters(
    month: str = Query(..., description="Month-end date"),
):
    """Get available filter values for a given month."""
    try:
        data = await asyncio.to_thread(mutual_fund_service.get_filters, month)
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("mutual-funds/filters failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)
