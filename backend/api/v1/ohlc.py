from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_session
from backend.schemas.common import StandardResponse
from backend.schemas.ohlc import OHLCResponse
from backend.services import ohlc_service

router = APIRouter()

IntervalType = Literal["daily", "weekly", "monthly"]


@router.get("/{symbol}", response_model=StandardResponse[OHLCResponse])
async def get_ohlc(
    symbol: str,
    start_date: Annotated[date | None, Query(description="Start date YYYY-MM-DD")] = None,
    end_date: Annotated[date | None, Query(description="End date YYYY-MM-DD")] = None,
    interval: Annotated[IntervalType, Query(description="Aggregation interval")] = "daily",
    session: AsyncSession = Depends(get_session),
):
    """
    Return OHLC candlestick data for a symbol.

    - **symbol**: NSE/BSE ticker (e.g. RELIANCE, NIFTY 50)
    - **interval**: daily | weekly | monthly
    - **start_date / end_date**: defaults to last 6 months
    """
    try:
        data = await ohlc_service.get_ohlc(
            session, symbol, start_date, end_date, interval
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if not data.ohlc:
        raise HTTPException(status_code=404, detail=f"No data found for symbol '{symbol}'")

    meta_info = {
        "total_records": len(data.ohlc),
        "start_date": data.ohlc[0].date if data.ohlc else None,
        "end_date": data.ohlc[-1].date if data.ohlc else None,
    }

    return StandardResponse(
        success=True,
        data=data,
        meta=None,
    )


@router.get("/{symbol}/latest")
async def get_latest(
    symbol: str,
    session: AsyncSession = Depends(get_session),
):
    """Return the most recent trading day data for a symbol."""
    row = await ohlc_service.get_symbol_latest(session, symbol)
    if not row:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found")
    return StandardResponse(success=True, data=row)
