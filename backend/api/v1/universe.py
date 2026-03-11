"""Universe API — browse all listed companies."""

import asyncio
import logging

from fastapi import APIRouter

from backend.schemas.common import StandardResponse
from backend.schemas.universe import UniverseResponse
from backend.services import universe_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=StandardResponse[UniverseResponse])
async def get_universe():
    """Return all listed companies with metadata."""
    try:
        companies, meta = await asyncio.gather(
            asyncio.to_thread(universe_service.get_all),
            asyncio.to_thread(universe_service.get_meta),
        )
        return StandardResponse(success=True, data=UniverseResponse(companies=companies, meta=meta))
    except Exception as e:
        logger.exception("Universe endpoint failed")
        return StandardResponse(success=False, errors=str(e) or type(e).__name__)
