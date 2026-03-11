from fastapi import APIRouter

from backend.api.v1 import ohlc, companies, shareholding, market_overview, mutual_fund, market_breadth, earnings, universe, news, fundamentals

router = APIRouter(prefix="/api/v1")
router.include_router(ohlc.router, prefix="/ohlc", tags=["OHLC"])
router.include_router(companies.router, prefix="/companies", tags=["Companies"])
router.include_router(shareholding.router, prefix="/shareholding", tags=["Shareholding"])
router.include_router(market_overview.router, prefix="/market-overview", tags=["Market Overview"])
router.include_router(mutual_fund.router, prefix="/mutual-funds", tags=["Mutual Funds"])
router.include_router(market_breadth.router, prefix="/market-breadth", tags=["Market Breadth"])
router.include_router(earnings.router, prefix="/earnings", tags=["Earnings Analysis"])
router.include_router(universe.router, prefix="/universe", tags=["Universe"])
router.include_router(news.router, prefix="/news", tags=["News"])
router.include_router(fundamentals.router, prefix="/fundamentals", tags=["Fundamentals"])
