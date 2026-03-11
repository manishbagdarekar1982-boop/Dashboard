"""
Earnings Analysis API — /api/v1/earnings/
"""

import asyncio
import logging

from fastapi import APIRouter

from backend.schemas.common import StandardResponse
from backend.schemas.earnings import EarningsAnalysisResponse
from backend.services import earnings_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("", response_model=StandardResponse[EarningsAnalysisResponse])
async def get_earnings_analysis():
    """Return pre-joined earnings data with growth metrics for all companies.

    Client-side filtering by quarter, industry, mcap, index, SME status.
    Cached for 6 hours.
    """
    try:
        data = await asyncio.to_thread(earnings_service.get_earnings_analysis)
        return StandardResponse(success=True, data=data)
    except Exception as e:
        logger.exception("earnings failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)
