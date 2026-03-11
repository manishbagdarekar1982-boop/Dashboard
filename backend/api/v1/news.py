"""News API endpoints — fetch from Redbox API, retrieve stored news, serve newspaper PDFs."""

import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from backend.services import news_service

router = APIRouter()


@router.post("/fetch")
async def fetch_news():
    """Fetch latest news from Redbox API and store in SQLite."""
    result = await news_service.fetch_and_store()
    return result


@router.get("")
async def get_news(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    category: Optional[str] = None,
    symbol: Optional[str] = None,
):
    """Retrieve stored news articles with optional filters."""
    articles, total = await asyncio.to_thread(
        news_service.get_news, skip, limit, category, symbol
    )
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "articles": articles,
    }


@router.get("/categories")
async def get_categories():
    """Return distinct news categories."""
    categories = await asyncio.to_thread(news_service.get_categories)
    return {"categories": categories}


@router.get("/stats")
async def get_stats():
    """Return news collection statistics."""
    stats = await asyncio.to_thread(news_service.get_stats)
    return stats


@router.get("/newspapers")
async def list_newspapers():
    """List available newspaper PDFs grouped by date."""
    result = await asyncio.to_thread(news_service.list_newspaper_files)
    return result


@router.get("/newspapers/file")
async def get_newspaper_file(filename: str = Query(..., min_length=1)):
    """Serve a newspaper PDF file."""
    file_path = news_service.get_newspaper_path(filename)
    if file_path is None:
        raise HTTPException(status_code=404, detail="File not found or invalid filename")
    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        filename=filename,
        headers={"Content-Disposition": "inline"},
    )
