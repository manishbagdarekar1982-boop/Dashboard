"""
StockAsk — FastAPI Application Entry Point
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.config import settings
from backend.database import (
    close_engine,
    get_session,
    init_engine,
    start_ssh_tunnel,
    stop_ssh_tunnel,
)
from backend.database_mongo import connect_mongo, close_mongo
from backend.services import ohlc_service
from backend.services import company_master_service
from backend.services import universe_service
from backend.services import news_service
from backend.api.v1.router import router as v1_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s — %(message)s",
)
# Suppress noisy loggers
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
logging.getLogger("asyncio").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: open SSH tunnel + DB engine. Shutdown: tear them down."""
    logger.info("=== StockAsk starting up ===")
    tunnel = start_ssh_tunnel()
    app.state.tunnel = tunnel
    init_engine()

    # Connect to MongoDB
    try:
        connect_mongo()
        logger.info("MongoDB connected successfully")
    except Exception as exc:
        logger.warning("MongoDB connection failed (shareholding features unavailable): %s", exc)

    # Load company master from Excel (sector/industry mapping)
    try:
        company_master_service.load_excel()
    except Exception as exc:
        logger.warning("Company master Excel load failed: %s", exc)

    # Load exchange flags from MongoDB
    try:
        company_master_service.load_exchange_from_mongo()
    except Exception as exc:
        logger.warning("Exchange lookup load failed: %s", exc)

    # Load universe (All_companies_data.xlsx) for browsable company list
    try:
        universe_service.load()
    except Exception as exc:
        logger.warning("Universe Excel load failed: %s", exc)

    logger.info("=== StockAsk ready ===")

    # Warm the symbols cache in the background (avoids 20s delay on first search)
    async def _warm_symbols():
        try:
            async for session in get_session():
                await ohlc_service.get_all_symbol_names(session)
                break
        except Exception as exc:
            logger.warning("Symbols cache warm-up failed: %s", exc)

    asyncio.create_task(_warm_symbols())

    # Background news polling — fetch every 5 minutes
    NEWS_POLL_INTERVAL = 60  # seconds

    async def _news_poller():
        # Initial fetch on startup
        try:
            result = await news_service.fetch_and_store()
            logger.info("News startup fetch: %d new, %d existing", result["new"], result["existing"])
        except Exception as exc:
            logger.warning("News startup fetch failed: %s", exc)

        while True:
            await asyncio.sleep(NEWS_POLL_INTERVAL)
            try:
                result = await news_service.fetch_and_store()
                if result["new"] > 0:
                    logger.info("News poll: %d new articles saved", result["new"])
            except Exception as exc:
                logger.warning("News poll failed: %s", exc)

    news_task = asyncio.create_task(_news_poller())

    yield  # <-- application runs here

    news_task.cancel()

    logger.info("=== StockAsk shutting down ===")
    await close_engine()
    close_mongo()
    stop_ssh_tunnel()


app = FastAPI(
    title="StockAsk API",
    description="Financial analytics dashboard — OHLC, technical indicators, fundamentals",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"success": False, "data": None, "errors": str(exc)},
    )


# Routers
app.include_router(v1_router)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "version": "1.0.0"}
