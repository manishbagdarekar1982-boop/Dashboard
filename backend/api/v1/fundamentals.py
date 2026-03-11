"""Fundamentals API — catalog and per-symbol time series."""

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query

from backend.schemas.common import StandardResponse
from backend.schemas.fundamental_timeseries import (
    FundamentalCatalogResponse,
    FundamentalTimeseriesResponse,
)
from backend.services import fundamental_timeseries_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/catalog", response_model=StandardResponse[FundamentalCatalogResponse])
async def get_catalog():
    """Return the static metric catalog (tabs + metric definitions)."""
    data = fundamental_timeseries_service.get_catalog()
    return StandardResponse(success=True, data=data)


@router.get(
    "/{symbol}/timeseries",
    response_model=StandardResponse[FundamentalTimeseriesResponse],
)
async def get_timeseries(
    symbol: str,
    metrics: str = Query(..., min_length=1, description="Comma-separated metric keys"),
    period: str = Query("quarterly", pattern="^(quarterly|annual)$"),
):
    """Return fundamental time series for requested metrics."""
    metric_keys = [m.strip() for m in metrics.split(",") if m.strip()]
    if not metric_keys:
        raise HTTPException(status_code=400, detail="No valid metric keys provided")

    try:
        data = await asyncio.to_thread(
            fundamental_timeseries_service.get_timeseries,
            symbol,
            metric_keys,
            period,
        )
        return StandardResponse(success=True, data=data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("fundamentals timeseries failed for %s", symbol)
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)
