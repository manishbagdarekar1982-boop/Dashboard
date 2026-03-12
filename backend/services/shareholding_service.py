"""
Shareholding service — queries MongoDB for shareholding pattern data.

All pymongo calls are synchronous; wrap with asyncio.to_thread() at the API layer.
"""

import logging
import re
from datetime import datetime

from backend.database_mongo import get_mongo_db
from backend.services import company_master_service
from backend.schemas.shareholding import (
    AllSectorsSummaryResponse,
    IndustryQuarterData,
    IndustryTrendResponse,
    MajorShareholder,
    QuarterlyHolding,
    SectorSparklinePoint,
    SectorSummaryRow,
    ShareholdingCategory,
    ShareholdingResponse,
)

logger = logging.getLogger(__name__)

# Module-level caches
_sectors_cache: list[str] | None = None
_all_sectors_summary_cache: AllSectorsSummaryResponse | None = None
_all_sectors_summary_ts: float = 0.0
_SUMMARY_CACHE_TTL = 6 * 60 * 60  # 6 hours

# YRC month mapping
_MONTH_NAMES = {
    1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun",
    7: "Jul", 8: "Aug", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec",
}


def _yrc_to_label(yrc: int) -> str:
    """Convert YRC (e.g. 202509) to human-readable quarter string."""
    year = yrc // 100
    month = yrc % 100
    return f"{_MONTH_NAMES.get(month, '?')} {year}"


def _safe_float(doc: dict, key: str) -> float:
    """Safely extract a float from a MongoDB document."""
    val = doc.get(key)
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


def _safe_int(doc: dict, key: str) -> int:
    """Safely extract an int from a MongoDB document."""
    val = doc.get(key)
    if val is None:
        return 0
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return 0


def resolve_symbol(symbol: str) -> tuple[int, dict] | None:
    """
    Look up a stock symbol in the MongoDB company master.
    Returns (co_code, company_info_dict) or None if not found.
    """
    db = get_mongo_db()
    # Case-insensitive regex match on nsesymbol
    doc = db["indira_cmots_company_master"].find_one(
        {"nsesymbol": re.compile(f"^{re.escape(symbol)}$", re.IGNORECASE)}
    )
    if not doc:
        return None
    # Override sector from Excel (try NSE symbol, then BSE code)
    nse_sym = (doc.get("nsesymbol") or symbol).strip().upper()
    bse_raw = doc.get("bsecode")
    bse_str = str(bse_raw).split(".")[0] if bse_raw else None
    excel_info = company_master_service.get_sector_industry(nse_sym, bse_str)
    sector_val = excel_info[0] if excel_info else ""
    return int(doc["co_code"]), {
        "company_name": doc.get("companyname", doc.get("CompanyName", "")),
        "sector": sector_val,
        "mcap_type": doc.get("mcaptype", ""),
    }


def get_shareholding(symbol: str, co_code: int, company_info: dict) -> ShareholdingResponse:
    """
    Fetch full shareholding data for a company:
    - Latest quarter breakdown (categories)
    - Quarterly trend (all quarters)
    - Major shareholders (>1% stake)
    """
    db = get_mongo_db()
    coll = db["indira_cmots_shareholding_pattern"]

    # --- Latest quarter ---
    latest = coll.find_one({"co_code": co_code}, sort=[("YRC", -1)])
    if not latest:
        return ShareholdingResponse(
            symbol=symbol,
            co_code=co_code,
            company_name=company_info.get("company_name", ""),
            sector=company_info.get("sector", ""),
            mcap_type=company_info.get("mcap_type", ""),
        )

    latest_yrc = int(latest.get("YRC", 0))

    # Extract category percentages from the latest quarter
    promoter = _safe_float(latest, "TotalPromoter_PerShares")
    fii = _safe_float(latest, "PPIFII")
    mutual_funds = _safe_float(latest, "PPIMF")
    insurance = _safe_float(latest, "PPIINS")
    retail_l = _safe_float(latest, "PPINDL1L")  # individuals up to 1 lakh
    retail_m = _safe_float(latest, "PPINDM1L")  # individuals above 1 lakh
    retail = retail_l + retail_m
    govt = _safe_float(latest, "PPIGOVT")
    corporate = _safe_float(latest, "PPCOB")

    known = promoter + fii + mutual_funds + insurance + retail + govt + corporate
    others = max(0.0, round(100.0 - known, 2))

    # Build DII as MF + Insurance
    dii = mutual_funds + insurance

    total_shares = _safe_int(latest, "Total_Promoter_NonPromoter_Shares")

    # Extract share counts (NP* fields)
    shares_promoter = _safe_int(latest, "TotalPromoter_Shares")
    shares_fii = _safe_int(latest, "NPIFII")
    shares_mf = _safe_int(latest, "NPIMF")
    shares_ins = _safe_int(latest, "NPIINS")
    shares_retail = _safe_int(latest, "NPINDL1L") + _safe_int(latest, "NPINDM1L")
    shares_govt = _safe_int(latest, "NPIGOVT")
    shares_corp = _safe_int(latest, "NPCOB")
    shares_known = shares_promoter + shares_fii + shares_mf + shares_ins + shares_retail + shares_govt + shares_corp
    shares_others = max(0, total_shares - shares_known)

    categories = []
    for name, pct, shares in [
        ("Promoter", promoter, shares_promoter),
        ("FII/FPI", fii, shares_fii),
        ("Mutual Funds", mutual_funds, shares_mf),
        ("Insurance", insurance, shares_ins),
        ("Retail", retail, shares_retail),
        ("Govt", govt, shares_govt),
        ("Corporate Bodies", corporate, shares_corp),
        ("Others", others, shares_others),
    ]:
        if pct > 0:
            categories.append(ShareholdingCategory(
                name=name,
                percentage=round(pct, 2),
                shares=shares,
            ))

    # --- Quarterly trend ---
    all_quarters = list(coll.find(
        {"co_code": co_code},
        sort=[("YRC", 1)],
    ))

    quarterly_trend = []
    for q in all_quarters:
        yrc = int(q.get("YRC", 0))
        q_promoter = _safe_float(q, "TotalPromoter_PerShares")
        q_fii = _safe_float(q, "PPIFII")
        q_mf = _safe_float(q, "PPIMF")
        q_ins = _safe_float(q, "PPIINS")
        q_retail = _safe_float(q, "PPINDL1L") + _safe_float(q, "PPINDM1L")
        q_dii = q_mf + q_ins
        q_known = q_promoter + q_fii + q_mf + q_ins + q_retail + _safe_float(q, "PPIGOVT") + _safe_float(q, "PPCOB")
        q_others = max(0.0, round(100.0 - q_known, 2))

        quarterly_trend.append(QuarterlyHolding(
            quarter=_yrc_to_label(yrc),
            yrc=yrc,
            promoter=round(q_promoter, 2),
            fii=round(q_fii, 2),
            dii=round(q_dii, 2),
            mutual_funds=round(q_mf, 2),
            insurance=round(q_ins, 2),
            retail=round(q_retail, 2),
            others=round(q_others, 2),
        ))

    # --- Major shareholders (>1% stake) ---
    major_coll = db["indira_cmots_shareholding_more_than_one_percent"]
    major_docs = list(major_coll.find(
        {"co_code": co_code},
        sort=[("perstake", -1)],
    ).limit(50))

    # If there are many, keep only the latest date's entries
    if major_docs:
        dates = set()
        for d in major_docs:
            dt = d.get("date", d.get("DateOfInfo", d.get("dateofinfo")))
            if dt:
                dates.add(dt)
        if dates:
            latest_date = max(dates)
            major_docs = [d for d in major_docs if d.get("date", d.get("DateOfInfo", d.get("dateofinfo"))) == latest_date]

    major_shareholders = []
    for d in major_docs:
        perstake = _safe_float(d, "perstake")
        if perstake <= 0:
            continue
        name = d.get("Name", d.get("Hname", d.get("hname", "Unknown")))
        sh_type = d.get("Type", d.get("Htype", d.get("htype", "")))
        shares = _safe_int(d, "NOOFshares") or _safe_int(d, "Nosh")
        dt = d.get("date", d.get("DateOfInfo", d.get("dateofinfo")))
        date_str = ""
        if isinstance(dt, datetime):
            date_str = dt.strftime("%Y-%m-%d")
        elif isinstance(dt, str):
            date_str = dt

        major_shareholders.append(MajorShareholder(
            name=name,
            type=sh_type,
            shares=shares,
            percentage=round(perstake, 2),
            date=date_str,
        ))

    return ShareholdingResponse(
        symbol=symbol,
        co_code=co_code,
        company_name=company_info.get("company_name", ""),
        sector=company_info.get("sector", ""),
        mcap_type=company_info.get("mcap_type", ""),
        latest_quarter=_yrc_to_label(latest_yrc),
        total_shares=total_shares,
        categories=categories,
        quarterly_trend=quarterly_trend,
        major_shareholders=major_shareholders,
    )


def get_all_sectors() -> list[str]:
    """Return all distinct sector names, preferring Excel source."""
    global _sectors_cache
    if _sectors_cache is not None:
        return _sectors_cache

    # Prefer Excel sectors
    excel_sectors = company_master_service.get_all_sectors()
    if excel_sectors:
        _sectors_cache = excel_sectors
        logger.info("Loaded %d sectors from Excel", len(excel_sectors))
        return excel_sectors

    # Fallback to MongoDB
    db = get_mongo_db()
    raw = db["indira_cmots_company_master"].distinct("sectorname")
    sectors = sorted([s for s in raw if s and isinstance(s, str) and s.strip()])
    _sectors_cache = sectors
    logger.info("Loaded %d sectors from MongoDB", len(sectors))
    return sectors


def get_industry_trend(sector: str) -> IndustryTrendResponse:
    """
    Aggregate shareholding data across all companies in a sector.
    Uses MongoDB aggregation pipeline for efficient server-side averaging.
    """
    db = get_mongo_db()

    # 1. Get all co_codes for this sector (Excel-aware: NSE + BSE)
    excel_syms = company_master_service.get_symbols_for_sector(sector)
    excel_bse_codes = company_master_service.get_co_codes_for_sector_via_bse(sector)
    if excel_syms or excel_bse_codes:
        query_or: list[dict] = []
        if excel_syms:
            query_or.append({"nsesymbol": {"$in": excel_syms}})
        if excel_bse_codes:
            bse_ints = [int(b) for b in excel_bse_codes if b.isdigit()]
            query_or.append({"bsecode": {"$in": bse_ints + excel_bse_codes}})
        company_docs = list(db["indira_cmots_company_master"].find(
            {"$or": query_or} if len(query_or) > 1 else query_or[0],
            {"co_code": 1, "_id": 0},
        ))
    else:
        company_docs = list(db["indira_cmots_company_master"].find(
            {"sectorname": sector},
            {"co_code": 1, "_id": 0},
        ))
    if not company_docs:
        return IndustryTrendResponse(sector=sector, total_companies=0)

    co_codes = [int(d["co_code"]) for d in company_docs if d.get("co_code")]
    total_companies = len(co_codes)

    # 2. Aggregation pipeline: group by YRC, average the shareholding fields
    pipeline = [
        {"$match": {"co_code": {"$in": co_codes}}},
        {"$group": {
            "_id": "$YRC",
            "avg_promoter": {"$avg": {"$convert": {"input": "$TotalPromoter_PerShares", "to": "double", "onError": 0, "onNull": 0}}},
            "avg_fii": {"$avg": {"$convert": {"input": "$PPIFII", "to": "double", "onError": 0, "onNull": 0}}},
            "avg_mf": {"$avg": {"$convert": {"input": "$PPIMF", "to": "double", "onError": 0, "onNull": 0}}},
            "avg_ins": {"$avg": {"$convert": {"input": "$PPIINS", "to": "double", "onError": 0, "onNull": 0}}},
            "avg_retail_l": {"$avg": {"$convert": {"input": "$PPINDL1L", "to": "double", "onError": 0, "onNull": 0}}},
            "avg_retail_m": {"$avg": {"$convert": {"input": "$PPINDM1L", "to": "double", "onError": 0, "onNull": 0}}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]

    results = list(db["indira_cmots_shareholding_pattern"].aggregate(pipeline))

    quarters: list[IndustryQuarterData] = []
    for doc in results:
        yrc = int(doc["_id"])
        avg_mf = doc.get("avg_mf", 0) or 0
        avg_ins = doc.get("avg_ins", 0) or 0
        avg_retail_l = doc.get("avg_retail_l", 0) or 0
        avg_retail_m = doc.get("avg_retail_m", 0) or 0

        quarters.append(IndustryQuarterData(
            quarter=_yrc_to_label(yrc),
            yrc=yrc,
            promoter=round(doc.get("avg_promoter", 0) or 0, 2),
            fii=round(doc.get("avg_fii", 0) or 0, 2),
            dii=round(avg_mf + avg_ins, 2),
            public=round(avg_retail_l + avg_retail_m, 2),
            companies_count=doc.get("count", 0),
        ))

    return IndustryTrendResponse(
        sector=sector,
        total_companies=total_companies,
        quarters=quarters,
    )


def get_all_sectors_summary() -> AllSectorsSummaryResponse:
    """
    Return aggregated shareholding data for ALL sectors (last 8 quarters).
    Uses two-query approach: company_master for sector mapping, then
    aggregation on shareholding_pattern. Cached for 6 hours.
    """
    import time
    from collections import defaultdict

    global _all_sectors_summary_cache, _all_sectors_summary_ts

    now = time.time()
    if _all_sectors_summary_cache is not None and (now - _all_sectors_summary_ts) < _SUMMARY_CACHE_TTL:
        return _all_sectors_summary_cache

    db = get_mongo_db()

    # 1. Build co_code → sectorname map from company_master (Excel-aware)
    company_docs = list(db["indira_cmots_company_master"].find(
        {},
        {"co_code": 1, "sectorname": 1, "nsesymbol": 1, "bsecode": 1, "_id": 0},
    ))
    co_code_to_sector: dict[int, str] = {}
    for d in company_docs:
        cc = d.get("co_code")
        if not cc:
            continue
        # Override sector from Excel (try NSE symbol, then BSE code)
        nse_sym = (d.get("nsesymbol") or "").strip().upper()
        bse_raw = d.get("bsecode")
        bse_str = str(bse_raw).split(".")[0] if bse_raw else None
        excel_info = company_master_service.get_sector_industry(nse_sym or None, bse_str)
        if not excel_info:
            continue  # Skip companies not in Excel
        sn = excel_info[0]
        if sn and isinstance(sn, str) and sn.strip():
            co_code_to_sector[int(cc)] = sn.strip()

    valid_co_codes = list(co_code_to_sector.keys())

    # 2. Get last 8 distinct YRC values
    all_yrcs = sorted(db["indira_cmots_shareholding_pattern"].distinct("YRC"))
    last_8_yrcs = all_yrcs[-8:] if len(all_yrcs) >= 8 else all_yrcs

    # 3. Aggregation: project only needed fields, match on valid co_codes + last 8 YRCs
    pipeline = [
        {"$match": {"co_code": {"$in": valid_co_codes}, "YRC": {"$in": last_8_yrcs}}},
        {"$project": {
            "_id": 0,
            "co_code": 1,
            "YRC": 1,
            "promoter": {"$convert": {"input": "$TotalPromoter_PerShares", "to": "double", "onError": 0, "onNull": 0}},
            "fii": {"$convert": {"input": "$PPIFII", "to": "double", "onError": 0, "onNull": 0}},
            "mf": {"$convert": {"input": "$PPIMF", "to": "double", "onError": 0, "onNull": 0}},
            "ins": {"$convert": {"input": "$PPIINS", "to": "double", "onError": 0, "onNull": 0}},
            "retail_l": {"$convert": {"input": "$PPINDL1L", "to": "double", "onError": 0, "onNull": 0}},
            "retail_m": {"$convert": {"input": "$PPINDM1L", "to": "double", "onError": 0, "onNull": 0}},
        }},
    ]

    results = list(db["indira_cmots_shareholding_pattern"].aggregate(pipeline, allowDiskUse=True))
    logger.info("All-sectors summary: fetched %d docs for %d YRCs", len(results), len(last_8_yrcs))

    # 4. Group by (sector, yrc) in Python and accumulate
    # Key: (sector, yrc) → {sum_promoter, sum_fii, sum_mf, sum_ins, sum_retail_l, sum_retail_m, count}
    accum: dict[tuple[str, int], dict] = defaultdict(lambda: {
        "sum_promoter": 0.0, "sum_fii": 0.0, "sum_mf": 0.0,
        "sum_ins": 0.0, "sum_retail_l": 0.0, "sum_retail_m": 0.0, "count": 0,
    })

    for doc in results:
        cc = int(doc.get("co_code", 0))
        sector = co_code_to_sector.get(cc)
        if not sector:
            continue
        yrc = int(doc.get("YRC", 0))
        if yrc == 0:
            continue

        bucket = accum[(sector, yrc)]
        bucket["sum_promoter"] += doc.get("promoter", 0) or 0
        bucket["sum_fii"] += doc.get("fii", 0) or 0
        bucket["sum_mf"] += doc.get("mf", 0) or 0
        bucket["sum_ins"] += doc.get("ins", 0) or 0
        bucket["sum_retail_l"] += doc.get("retail_l", 0) or 0
        bucket["sum_retail_m"] += doc.get("retail_m", 0) or 0
        bucket["count"] += 1

    # 5. Build per-sector rows with sparkline data
    # Group accumulator by sector
    sector_quarters: dict[str, list[tuple[int, dict]]] = defaultdict(list)
    for (sector, yrc), data in accum.items():
        sector_quarters[sector].append((yrc, data))

    global_latest_yrc = max(last_8_yrcs) if last_8_yrcs else 0
    rows: list[SectorSummaryRow] = []

    for sector in sorted(sector_quarters.keys()):
        qlist = sorted(sector_quarters[sector], key=lambda x: x[0])

        promoter_trend = []
        fii_trend = []
        dii_trend = []
        public_trend = []
        others_trend = []

        latest_data: dict | None = None

        for yrc, data in qlist:
            cnt = data["count"]
            if cnt == 0:
                continue

            prom = round(data["sum_promoter"] / cnt, 2)
            fii_val = round(data["sum_fii"] / cnt, 2)
            mf_val = data["sum_mf"] / cnt
            ins_val = data["sum_ins"] / cnt
            dii_val = round(mf_val + ins_val, 2)
            pub_val = round((data["sum_retail_l"] + data["sum_retail_m"]) / cnt, 2)
            oth_val = round(max(0.0, 100.0 - prom - fii_val - dii_val - pub_val), 2)

            label = _yrc_to_label(yrc)
            promoter_trend.append(SectorSparklinePoint(quarter=label, yrc=yrc, value=prom))
            fii_trend.append(SectorSparklinePoint(quarter=label, yrc=yrc, value=fii_val))
            dii_trend.append(SectorSparklinePoint(quarter=label, yrc=yrc, value=dii_val))
            public_trend.append(SectorSparklinePoint(quarter=label, yrc=yrc, value=pub_val))
            others_trend.append(SectorSparklinePoint(quarter=label, yrc=yrc, value=oth_val))

            latest_data = {"promoter": prom, "fii": fii_val, "dii": dii_val,
                           "public": pub_val, "others": oth_val, "count": cnt,
                           "yrc": yrc}

        if not latest_data:
            continue

        rows.append(SectorSummaryRow(
            sector=sector,
            companies_count=latest_data["count"],
            latest_quarter=_yrc_to_label(latest_data["yrc"]),
            promoter=latest_data["promoter"],
            fii=latest_data["fii"],
            dii=latest_data["dii"],
            public=latest_data["public"],
            others=latest_data["others"],
            promoter_trend=promoter_trend,
            fii_trend=fii_trend,
            dii_trend=dii_trend,
            public_trend=public_trend,
            others_trend=others_trend,
        ))

    response = AllSectorsSummaryResponse(
        total_sectors=len(rows),
        latest_quarter=_yrc_to_label(global_latest_yrc),
        sectors=rows,
    )

    _all_sectors_summary_cache = response
    _all_sectors_summary_ts = now
    logger.info("All-sectors summary cached: %d sectors", len(rows))
    return response


# ── Distinct shareholder names (>1% stake) ──

_shareholder_names_cache: list[str] | None = None


def get_all_shareholder_names() -> list[str]:
    """Return all unique shareholder names from the >1% shareholding collection."""
    global _shareholder_names_cache
    if _shareholder_names_cache is not None:
        return _shareholder_names_cache

    db = get_mongo_db()
    coll = db["indira_cmots_shareholding_more_than_one_percent"]

    # The name field can be stored as "Name", "Hname", or "hname"
    names: set[str] = set()
    for field in ("Name", "Hname", "hname"):
        vals = coll.distinct(field)
        for v in vals:
            if v and isinstance(v, str) and v.strip():
                names.add(v.strip())

    result = sorted(names)
    _shareholder_names_cache = result
    logger.info("Loaded %d distinct shareholder names (>1%%)", len(result))
    return result
