"""
Sector Analytics Service — cross-database shareholding decomposition engine.

Joins MongoDB shareholding (share counts) with PostgreSQL (market prices) to compute:
- Per-holder-type holding values, price effects, and holding effects
- Sector-level aggregates (market-cap weighted and equal weighted)
- Accumulation Index

Architecture:
  get_sector_mongo_data()   — sync pymongo, run in asyncio.to_thread()
  get_month_end_prices()    — async, uses existing AsyncSession
  compute_sector_analytics() — sync pure computation, run in asyncio.to_thread()
"""

import datetime
import logging
import time
from collections import defaultdict
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database_mongo import get_mongo_db
from backend.schemas.shareholding import (
    HolderTypeDecomposition,
    SectorAggregateMetrics,
    SectorAnalyticsResponse,
    SectorQuarterAnalytics,
)
from backend.services import company_master_service
from backend.services.shareholding_service import _safe_float, _safe_int, _yrc_to_label

logger = logging.getLogger(__name__)

# Module-level cache: cache_key -> (timestamp, response)
_analytics_cache: dict[str, tuple[float, SectorAnalyticsResponse]] = {}
_CACHE_TTL = 3600  # 1 hour

HOLDER_TYPES = ("promoter", "fii", "dii", "public")


# ---------------------------------------------------------------------------
# 1. MongoDB data fetcher (synchronous — run in asyncio.to_thread)
# ---------------------------------------------------------------------------

def get_sector_mongo_data(sector: str, num_quarters: int = 8) -> dict[str, Any]:
    """
    Fetch all shareholding data for a sector from MongoDB.

    Returns dict with:
      companies: dict[int, str]  — co_code → nsesymbol
      holdings: dict[(int, int), dict]  — (co_code, yrc) → holder shares + pcts
      target_yrcs: list[int]  — the N quarters to display
      extended_yrcs: list[int]  — N+1 quarters (includes prev for decomposition)
    """
    db = get_mongo_db()

    # Get companies in sector (Excel-aware: match by NSE symbol + BSE code)
    excel_syms = company_master_service.get_symbols_for_sector(sector)
    excel_bse_codes = company_master_service.get_co_codes_for_sector_via_bse(sector)
    if excel_syms or excel_bse_codes:
        query_or: list[dict] = []
        if excel_syms:
            query_or.append({"nsesymbol": {"$in": excel_syms}})
        if excel_bse_codes:
            # BSE codes may be int or string in MongoDB
            bse_ints = [int(b) for b in excel_bse_codes if b.isdigit()]
            bse_strs = excel_bse_codes
            query_or.append({"bsecode": {"$in": bse_ints + bse_strs}})
        company_docs = list(db["indira_cmots_company_master"].find(
            {"$or": query_or} if len(query_or) > 1 else query_or[0],
            {"co_code": 1, "nsesymbol": 1, "_id": 0},
        ))
    else:
        company_docs = list(db["indira_cmots_company_master"].find(
            {"sectorname": sector},
            {"co_code": 1, "nsesymbol": 1, "_id": 0},
        ))

    companies: dict[int, str] = {}
    for d in company_docs:
        cc = d.get("co_code")
        sym = (d.get("nsesymbol") or "").strip().upper()
        if cc and sym:
            companies[int(cc)] = sym

    if not companies:
        return {"companies": {}, "holdings": {}, "target_yrcs": [], "extended_yrcs": []}

    # Determine quarter range
    all_yrcs = sorted(db["indira_cmots_shareholding_pattern"].distinct("YRC"))
    target_yrcs = all_yrcs[-num_quarters:] if len(all_yrcs) >= num_quarters else all_yrcs
    # Need one extra previous quarter for QoQ decomposition
    idx = all_yrcs.index(target_yrcs[0]) if target_yrcs and target_yrcs[0] in all_yrcs else 0
    extended_yrcs = all_yrcs[max(0, idx - 1):]
    extended_yrcs = [y for y in extended_yrcs if y <= target_yrcs[-1]] if target_yrcs else []

    # Fetch shareholding data
    co_codes = list(companies.keys())
    pipeline = [
        {"$match": {"co_code": {"$in": co_codes}, "YRC": {"$in": extended_yrcs}}},
        {"$project": {
            "_id": 0, "co_code": 1, "YRC": 1,
            "TotalPromoter_Shares": 1, "NPIFII": 1, "NPIMF": 1, "NPIINS": 1,
            "NPINDL1L": 1, "NPINDM1L": 1,
            "TotalPromoter_PerShares": 1, "PPIFII": 1, "PPIMF": 1, "PPIINS": 1,
            "PPINDL1L": 1, "PPINDM1L": 1,
            "Total_Promoter_NonPromoter_Shares": 1,
        }},
    ]
    docs = list(db["indira_cmots_shareholding_pattern"].aggregate(pipeline, allowDiskUse=True))

    holdings: dict[tuple[int, int], dict] = {}
    for doc in docs:
        cc = int(doc.get("co_code", 0))
        yrc = int(doc.get("YRC", 0))
        if not cc or not yrc:
            continue
        holdings[(cc, yrc)] = {
            "shares_promoter": _safe_int(doc, "TotalPromoter_Shares"),
            "shares_fii": _safe_int(doc, "NPIFII"),
            "shares_dii": _safe_int(doc, "NPIMF") + _safe_int(doc, "NPIINS"),
            "shares_public": _safe_int(doc, "NPINDL1L") + _safe_int(doc, "NPINDM1L"),
            "pct_promoter": _safe_float(doc, "TotalPromoter_PerShares"),
            "pct_fii": _safe_float(doc, "PPIFII"),
            "pct_dii": _safe_float(doc, "PPIMF") + _safe_float(doc, "PPIINS"),
            "pct_public": _safe_float(doc, "PPINDL1L") + _safe_float(doc, "PPINDM1L"),
        }

    symbols = list(set(companies.values()))

    logger.info(
        "Sector '%s': %d companies, %d holdings docs, %d target quarters",
        sector, len(companies), len(holdings), len(target_yrcs),
    )

    return {
        "companies": companies,
        "holdings": holdings,
        "target_yrcs": target_yrcs,
        "extended_yrcs": extended_yrcs,
        "symbols": symbols,
    }


# ---------------------------------------------------------------------------
# 2. PostgreSQL price fetcher (async — uses existing AsyncSession)
# ---------------------------------------------------------------------------

async def get_month_end_prices(
    session: AsyncSession,
    symbols: list[str],
    yrcs: list[int],
) -> dict[tuple[str, int], dict]:
    """
    Batch-fetch month-end closing prices from PostgreSQL.
    Returns dict[(symbol, yrc)] → {price: float, mcap: float}.
    """
    if not symbols or not yrcs:
        return {}

    min_yrc = min(yrcs)
    min_date = datetime.date(min_yrc // 100, min_yrc % 100, 1)

    sql = text("""
        SELECT symbol, yrc, curr_price, marketcap_value FROM (
            SELECT symbol, curr_price, marketcap_value,
                   (EXTRACT(YEAR FROM date_time)::int * 100 + EXTRACT(MONTH FROM date_time)::int) as yrc,
                   ROW_NUMBER() OVER (
                       PARTITION BY symbol, EXTRACT(YEAR FROM date_time), EXTRACT(MONTH FROM date_time)
                       ORDER BY date_time DESC
                   ) as rn
            FROM public.historic_data
            WHERE symbol = ANY(:symbols) AND date_time >= :min_date
        ) sub WHERE rn = 1
    """)

    result = await session.execute(sql, {"symbols": symbols, "min_date": min_date})
    rows = result.fetchall()

    prices: dict[tuple[str, int], dict] = {}
    for row in rows:
        sym = row[0]
        yrc = int(row[1])
        price = float(row[2]) if row[2] else 0.0
        mcap = float(row[3]) if row[3] else 0.0
        if price > 0:
            prices[(sym, yrc)] = {"price": price, "mcap": mcap}

    logger.info("Fetched %d price rows for %d symbols", len(prices), len(symbols))
    return prices


# ---------------------------------------------------------------------------
# 3. Computation engine (synchronous — pure math, run in asyncio.to_thread)
# ---------------------------------------------------------------------------

def compute_sector_analytics(
    sector: str,
    mongo_data: dict[str, Any],
    prices: dict[tuple[str, int], dict],
) -> SectorAnalyticsResponse:
    """
    Join MongoDB holdings with PostgreSQL prices and compute decomposition.
    """
    # Check cache
    cache_key = f"{sector}:{len(mongo_data.get('target_yrcs', []))}"
    now = time.time()
    if cache_key in _analytics_cache:
        ts, cached = _analytics_cache[cache_key]
        if (now - ts) < _CACHE_TTL:
            return cached

    companies = mongo_data["companies"]       # co_code → symbol
    holdings = mongo_data["holdings"]          # (co_code, yrc) → data
    target_yrcs = mongo_data["target_yrcs"]
    extended_yrcs = mongo_data["extended_yrcs"]

    if not companies or not target_yrcs:
        return SectorAnalyticsResponse(
            sector=sector, total_companies=len(companies),
            matched_companies=0, quarters=[],
        )

    # Build (co_code, yrc) → {holder_type → {shares, value, pct}, price, mcap}
    company_quarter: dict[tuple[int, int], dict] = {}
    matched_symbols: set[str] = set()
    all_symbols = set(companies.values())

    for cc, sym in companies.items():
        for yrc in extended_yrcs:
            h = holdings.get((cc, yrc))
            p = prices.get((sym, yrc))
            if not h or not p:
                continue
            matched_symbols.add(sym)
            price = p["price"]
            mcap = p["mcap"]
            company_quarter[(cc, yrc)] = {
                "price": price,
                "mcap": mcap,
                "promoter": {"shares": h["shares_promoter"], "value": h["shares_promoter"] * price, "pct": h["pct_promoter"]},
                "fii":      {"shares": h["shares_fii"],      "value": h["shares_fii"] * price,      "pct": h["pct_fii"]},
                "dii":      {"shares": h["shares_dii"],      "value": h["shares_dii"] * price,      "pct": h["pct_dii"]},
                "public":   {"shares": h["shares_public"],   "value": h["shares_public"] * price,   "pct": h["pct_public"]},
            }

    unmatched = sorted(all_symbols - matched_symbols)

    # Aggregate per quarter
    quarter_results: list[SectorQuarterAnalytics] = []

    for yrc in target_yrcs:
        # Find previous yrc in extended_yrcs
        yrc_idx = extended_yrcs.index(yrc) if yrc in extended_yrcs else -1
        prev_yrc = extended_yrcs[yrc_idx - 1] if yrc_idx > 0 else None

        sector_mcap = 0.0
        matched_count = 0
        total_count = 0

        # Per holder type accumulators
        agg: dict[str, dict] = {ht: {
            "sum_value": 0.0, "sum_prev_value": 0.0,
            "sum_price_effect": 0.0, "sum_holding_effect": 0.0,
            "sum_pct": 0.0, "count": 0,
            "w_change_numer": 0.0, "w_change_denom": 0.0,
            "eq_change_sum": 0.0, "eq_change_count": 0,
        } for ht in HOLDER_TYPES}

        for cc in companies:
            if (cc, yrc) in holdings:
                total_count += 1

            curr = company_quarter.get((cc, yrc))
            if not curr:
                continue

            matched_count += 1
            sector_mcap += curr["mcap"]

            prev = company_quarter.get((cc, prev_yrc)) if prev_yrc else None

            for ht in HOLDER_TYPES:
                curr_ht = curr[ht]
                a = agg[ht]
                a["sum_value"] += curr_ht["value"]
                a["sum_pct"] += curr_ht["pct"]
                a["count"] += 1

                if prev and ht in prev:
                    prev_ht = prev[ht]
                    price_effect = prev_ht["shares"] * (curr["price"] - prev["price"])
                    holding_effect = (curr_ht["shares"] - prev_ht["shares"]) * curr["price"]
                    prev_value = prev_ht["value"]

                    a["sum_prev_value"] += prev_value
                    a["sum_price_effect"] += price_effect
                    a["sum_holding_effect"] += holding_effect

                    if prev_value > 0:
                        w = curr["mcap"]
                        a["w_change_numer"] += w * (holding_effect / prev_value)
                        a["w_change_denom"] += w
                        a["eq_change_sum"] += holding_effect / prev_value
                        a["eq_change_count"] += 1

        # Build holder decomposition objects
        holder_decomps: dict[str, HolderTypeDecomposition] = {}
        mcap_fields: dict[str, dict] = {}
        eq_fields: dict[str, dict] = {}

        for ht in HOLDER_TYPES:
            a = agg[ht]
            avg_pct = a["sum_pct"] / a["count"] if a["count"] > 0 else 0.0
            has_prev = a["sum_prev_value"] > 0

            holder_decomps[ht] = HolderTypeDecomposition(
                holding_value=round(a["sum_value"], 2),
                prev_holding_value=round(a["sum_prev_value"], 2) if has_prev else None,
                value_change=round(a["sum_value"] - a["sum_prev_value"], 2) if has_prev else None,
                price_effect=round(a["sum_price_effect"], 2) if has_prev else None,
                holding_effect=round(a["sum_holding_effect"], 2) if has_prev else None,
                holding_change_pct=round(a["sum_holding_effect"] / a["sum_prev_value"] * 100, 4) if has_prev and a["sum_prev_value"] != 0 else None,
                share_pct=round(avg_pct, 2),
            )

            flow = round(a["sum_holding_effect"], 2) if has_prev else None
            mcap_change = round(a["w_change_numer"] / a["w_change_denom"] * 100, 4) if a["w_change_denom"] > 0 else None
            eq_change = round(a["eq_change_sum"] / a["eq_change_count"] * 100, 4) if a["eq_change_count"] > 0 else None
            accum = round(a["sum_holding_effect"] / sector_mcap * 100, 6) if sector_mcap > 0 and has_prev else None

            mcap_fields[ht] = {"flow": flow, "change_pct": mcap_change, "accum": accum}
            eq_fields[ht] = {"flow": flow, "change_pct": eq_change, "accum": accum}

        mcap_metrics = SectorAggregateMetrics(
            promoter_flow=mcap_fields["promoter"]["flow"],
            promoter_change_pct=mcap_fields["promoter"]["change_pct"],
            promoter_accum_index=mcap_fields["promoter"]["accum"],
            fii_flow=mcap_fields["fii"]["flow"],
            fii_change_pct=mcap_fields["fii"]["change_pct"],
            fii_accum_index=mcap_fields["fii"]["accum"],
            dii_flow=mcap_fields["dii"]["flow"],
            dii_change_pct=mcap_fields["dii"]["change_pct"],
            dii_accum_index=mcap_fields["dii"]["accum"],
            public_flow=mcap_fields["public"]["flow"],
            public_change_pct=mcap_fields["public"]["change_pct"],
            public_accum_index=mcap_fields["public"]["accum"],
        )

        eq_metrics = SectorAggregateMetrics(
            promoter_flow=eq_fields["promoter"]["flow"],
            promoter_change_pct=eq_fields["promoter"]["change_pct"],
            promoter_accum_index=eq_fields["promoter"]["accum"],
            fii_flow=eq_fields["fii"]["flow"],
            fii_change_pct=eq_fields["fii"]["change_pct"],
            fii_accum_index=eq_fields["fii"]["accum"],
            dii_flow=eq_fields["dii"]["flow"],
            dii_change_pct=eq_fields["dii"]["change_pct"],
            dii_accum_index=eq_fields["dii"]["accum"],
            public_flow=eq_fields["public"]["flow"],
            public_change_pct=eq_fields["public"]["change_pct"],
            public_accum_index=eq_fields["public"]["accum"],
        )

        quarter_results.append(SectorQuarterAnalytics(
            quarter=_yrc_to_label(yrc),
            yrc=yrc,
            companies_matched=matched_count,
            companies_total=total_count,
            total_sector_mcap=round(sector_mcap, 2),
            promoter=holder_decomps["promoter"],
            fii=holder_decomps["fii"],
            dii=holder_decomps["dii"],
            public=holder_decomps["public"],
            mcap_weighted=mcap_metrics,
            equal_weighted=eq_metrics,
        ))

    response = SectorAnalyticsResponse(
        sector=sector,
        total_companies=len(companies),
        matched_companies=len(matched_symbols),
        unmatched_symbols=unmatched,
        quarters=quarter_results,
    )

    _analytics_cache[cache_key] = (now, response)
    logger.info(
        "Sector analytics for '%s': %d matched/%d total, %d quarters",
        sector, len(matched_symbols), len(companies), len(quarter_results),
    )
    return response
