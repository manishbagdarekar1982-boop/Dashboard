"""
Market overview service — pre-joins company master, profit/loss, indices,
and SME data into a single flat list. Cached for 6 hours.
"""

import logging
import math
import time
from collections import defaultdict
from typing import Any

from backend.database_mongo import get_mongo_db
from backend.schemas.market_overview import (
    MarketOverviewCompany,
    MarketOverviewResponse,
)
from backend.services import company_master_service
from backend.services import universe_service

logger = logging.getLogger(__name__)

# Module-level cache
_cache: MarketOverviewResponse | None = None
_cache_ts: float = 0.0
_CACHE_TTL = 6 * 60 * 60  # 6 hours


def _safe_float(val: Any) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        if math.isfinite(f):
            return f
        return None
    except (ValueError, TypeError):
        return None


def _extract_latest_financials(data_rows: list[dict]) -> dict:
    """Extract Sales (RID 8), PAT (RID 35), EBITDA (RID 46) from P&L data array."""
    result: dict[str, Any] = {}
    rid_map = {8: "sales", 35: "pat", 46: "ebitda"}

    for row in data_rows:
        rid = row.get("RID")
        if rid not in rid_map:
            continue

        y_keys = sorted(
            [k for k in row if isinstance(k, str) and k.startswith("Y")],
            reverse=True,
        )
        if not y_keys:
            continue

        val = _safe_float(row.get(y_keys[0]))
        result[rid_map[rid]] = val

        if "financial_year" not in result:
            result["financial_year"] = y_keys[0]

    return result


def get_market_overview() -> MarketOverviewResponse:
    """Build full market overview dataset by joining four MongoDB collections."""
    global _cache, _cache_ts

    now = time.time()
    if _cache is not None and (now - _cache_ts) < _CACHE_TTL:
        logger.debug("Market overview served from cache")
        return _cache

    db = get_mongo_db()

    # --- Query 1: Company Master ---
    company_docs = list(
        db["indira_cmots_company_master"].find(
            {},
            {
                "_id": 0,
                "co_code": 1,
                "companyname": 1,
                "nsesymbol": 1,
                "bsecode": 1,
                "sectorname": 1,
                "industryname": 1,
                "mcap": 1,
                "mcaptype": 1,
                "bsegroup": 1,
            },
        )
    )
    logger.info("Market overview: loaded %d companies", len(company_docs))

    companies_by_code: dict[int, dict] = {}
    for doc in company_docs:
        cc = doc.get("co_code")
        if cc is not None:
            companies_by_code[int(cc)] = doc

    # --- Query 2: Profit & Loss (aggregation with $filter for RID 8,35,46) ---
    pipeline = [
        {
            "$project": {
                "_id": 0,
                "co_code": 1,
                "data": {
                    "$filter": {
                        "input": "$data",
                        "as": "row",
                        "cond": {"$in": ["$$row.RID", [8, 35, 46]]},
                    }
                },
            }
        }
    ]
    pl_docs = list(
        db["indira_cmots_profit_loss"].aggregate(pipeline, allowDiskUse=True)
    )
    logger.info("Market overview: loaded %d P&L docs", len(pl_docs))

    financials_by_code: dict[int, dict] = {}
    for doc in pl_docs:
        cc = doc.get("co_code")
        if cc is None:
            continue
        data_rows = doc.get("data", [])
        if data_rows:
            financials_by_code[int(cc)] = _extract_latest_financials(data_rows)

    # --- Query 3: Indices → co_code mapping ---
    index_docs = list(
        db["indices_stocks"].find({}, {"_id": 0, "indicesName": 1, "co_code": 1})
    )
    logger.info("Market overview: loaded %d index docs", len(index_docs))

    co_code_to_indices: dict[int, list[str]] = defaultdict(list)
    for doc in index_docs:
        index_name = doc.get("indicesName", "")
        cc_list = doc.get("co_code", [])
        if isinstance(cc_list, list):
            for cc in cc_list:
                try:
                    co_code_to_indices[int(cc)].append(index_name)
                except (ValueError, TypeError):
                    pass

    # --- Query 4: SME companies ---
    sme_codes: set[int] = set()
    for coll_name in ("sme_companies", "nse_sme_companies"):
        for doc in db[coll_name].find({}, {"_id": 0, "co_code": 1}):
            cc = doc.get("co_code")
            if cc is not None:
                try:
                    sme_codes.add(int(cc))
                except (ValueError, TypeError):
                    pass
    logger.info("Market overview: %d SME co_codes", len(sme_codes))

    # --- Query 5: Valuation Ratios (P/B, P/E, P/S, EV/EBITDA) ---
    val_pipeline = [
        {"$match": {"type": "S", "year": {"$regex": r"^\d{4}-\d{2}$"}}},
        {"$sort": {"year": -1}},
        {
            "$group": {
                "_id": "$co_code",
                "price_to_book": {"$first": "$Price_BookValue"},
                "pe": {"$first": "$PE"},
                "price_to_sales": {"$first": "$Mcap_Sales"},
                "ev_ebitda": {"$first": "$EV_EBITDA"},
            }
        },
    ]
    valuation_map: dict[int, dict] = {}
    for doc in db["indira_cmots_valuation_ratios"].aggregate(
        val_pipeline, allowDiskUse=True
    ):
        cc = doc.get("_id")
        if cc is not None:
            valuation_map[int(cc)] = doc
    logger.info("Market overview: loaded valuation ratios for %d companies", len(valuation_map))

    # --- Query 6: Return Ratios (ROE) ---
    ret_pipeline = [
        {"$match": {"type": "S", "year": {"$regex": r"^\d{4}-\d{2}$"}}},
        {"$sort": {"year": -1}},
        {"$group": {"_id": "$co_code", "roe": {"$first": "$Return_ROE"}}},
    ]
    return_map: dict[int, dict] = {}
    for doc in db["indira_cmots_return_ratios"].aggregate(
        ret_pipeline, allowDiskUse=True
    ):
        cc = doc.get("_id")
        if cc is not None:
            return_map[int(cc)] = doc
    logger.info("Market overview: loaded return ratios for %d companies", len(return_map))

    # --- Query 7: Financial Stability (Debt/Equity) ---
    fs_pipeline = [
        {"$match": {"companymode": "S", "year": {"$regex": r"^\d{4}-\d{2}$"}}},
        {"$sort": {"year": -1}},
        {"$group": {"_id": "$co_code", "debt_to_equity": {"$first": "$TotalDebt_Equity"}}},
    ]
    stability_map: dict[int, dict] = {}
    for doc in db["indira_cmots_financial_stability_ratios"].aggregate(
        fs_pipeline, allowDiskUse=True
    ):
        cc = doc.get("_id")
        if cc is not None:
            stability_map[int(cc)] = doc
    logger.info("Market overview: loaded stability ratios for %d companies", len(stability_map))

    # --- Query 8: Margin Ratios (EBITDA margin, Op. Profit margin) ---
    margin_pipeline = [
        {"$match": {"type": "S", "year": {"$regex": r"^\d{4}-\d{2}$"}}},
        {"$sort": {"year": -1}},
        {
            "$group": {
                "_id": "$co_code",
                "ebitda_margin": {"$first": "$pbidtim"},
                "operating_profit_margin": {"$first": "$ebitm"},
            }
        },
    ]
    margin_map: dict[int, dict] = {}
    for doc in db["indira_cmots_margin_ratios"].aggregate(
        margin_pipeline, allowDiskUse=True
    ):
        cc = doc.get("_id")
        if cc is not None:
            margin_map[int(cc)] = doc
    logger.info("Market overview: loaded margin ratios for %d companies", len(margin_map))

    # --- Query 9: Cash Flow Ratios (CFO/EBITDA) ---
    cfo_pipeline = [
        {"$sort": {"year": -1}},
        {"$group": {"_id": "$co_code", "cfo_to_ebitda": {"$first": "$CFO/EBITDA"}}},
    ]
    cfo_map: dict[int, dict] = {}
    for doc in db["z_calculated_quarterly_ratios"].aggregate(
        cfo_pipeline, allowDiskUse=True
    ):
        cc = doc.get("_id")
        if cc is not None:
            cfo_map[int(cc)] = doc
    logger.info("Market overview: loaded CFO ratios for %d companies", len(cfo_map))

    # --- Join all data ---
    universe_co_codes = universe_service.get_universe_co_codes()

    companies: list[MarketOverviewCompany] = []
    sectors_set: set[str] = set()
    industries_set: set[str] = set()
    indices_set: set[str] = set()
    mcap_types_set: set[str] = set()

    for cc, doc in companies_by_code.items():
        # Filter: only companies in All_companies_data.xlsx universe
        if cc not in universe_co_codes:
            continue
        uni = universe_service.get_by_co_code(cc)

        fin = financials_by_code.get(cc, {})
        nifty_idx = co_code_to_indices.get(cc, [])
        val = valuation_map.get(cc, {})
        ret = return_map.get(cc, {})
        stab = stability_map.get(cc, {})
        marg = margin_map.get(cc, {})
        cfo = cfo_map.get(cc, {})

        # Sector/industry from universe Excel (ACE classifications)
        sector = uni.get("ace_sector") if uni else None
        industry = uni.get("ace_industry") if uni else None

        # Exchange listing
        nse_flag = uni.get("nse_listed_flag") if uni else None
        bse_flag = uni.get("bse_listed_flag") if uni else None
        if nse_flag == "Y" and bse_flag == "Y":
            exchange = "Both"
        elif nse_flag == "Y":
            exchange = "NSE"
        else:
            exchange = "BSE"

        mcap_type = doc.get("mcaptype") or None

        if sector:
            sectors_set.add(sector)
        if industry:
            industries_set.add(industry)
        if mcap_type:
            mcap_types_set.add(mcap_type)
        for idx_name in nifty_idx:
            if idx_name:
                indices_set.add(idx_name)

        bse_raw = doc.get("bsecode")
        bse_code = str(bse_raw) if bse_raw else None

        companies.append(
            MarketOverviewCompany(
                co_code=cc,
                company_name=doc.get("companyname", ""),
                nse_symbol=doc.get("nsesymbol") or None,
                bse_code=bse_code,
                sector=sector,
                industry=industry,
                mcap=_safe_float(doc.get("mcap")),
                mcap_type=mcap_type,
                bse_group=doc.get("bsegroup") or None,
                exchange=exchange,
                is_sme=(cc in sme_codes),
                nifty_indices=nifty_idx,
                sales=fin.get("sales"),
                pat=fin.get("pat"),
                ebitda=fin.get("ebitda"),
                financial_year=fin.get("financial_year"),
                price_to_book=_safe_float(val.get("price_to_book")),
                pe=_safe_float(val.get("pe")),
                price_to_sales=_safe_float(val.get("price_to_sales")),
                ev_ebitda=_safe_float(val.get("ev_ebitda")),
                roe=_safe_float(ret.get("roe")),
                debt_to_equity=_safe_float(stab.get("debt_to_equity")),
                ebitda_margin=_safe_float(marg.get("ebitda_margin")),
                operating_profit_margin=_safe_float(marg.get("operating_profit_margin")),
                cfo_to_ebitda=_safe_float(cfo.get("cfo_to_ebitda")),
            )
        )

    response = MarketOverviewResponse(
        total_companies=len(companies),
        companies=companies,
        distinct_sectors=sorted(sectors_set),
        distinct_industries=sorted(industries_set),
        distinct_indices=sorted(indices_set),
        distinct_mcap_types=sorted(mcap_types_set),
    )

    _cache = response
    _cache_ts = now
    logger.info(
        "Market overview cached: %d companies, %d sectors, %d industries, %d indices",
        len(companies),
        len(sectors_set),
        len(industries_set),
        len(indices_set),
    )
    return response
