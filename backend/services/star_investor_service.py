"""
Star Investor Service — tracks individual >1% shareholders across companies.

Queries MongoDB indira_cmots_shareholding_more_than_one_percent collection
and enriches with price returns from the existing returns_service cache.
"""

import logging
import time
from collections import defaultdict
from typing import Any

from backend.database_mongo import get_mongo_db
from backend.services import company_master_service, shareholding_service

logger = logging.getLogger(__name__)

# ── Caches ──────────────────────────────────────────────────────────
_co_code_map: dict[int, dict[str, str]] | None = None
_top_investors_cache: list[dict[str, Any]] | None = None
_top_investors_ts: float = 0.0
_CACHE_TTL = 6 * 60 * 60  # 6 hours


def _get_co_code_map() -> dict[int, dict[str, str]]:
    """Build co_code → {symbol, company_name, sector} map. Cached."""
    global _co_code_map
    if _co_code_map is not None:
        return _co_code_map

    db = get_mongo_db()
    docs = list(db["indira_cmots_company_master"].find(
        {}, {"co_code": 1, "nsesymbol": 1, "companyname": 1, "CompanyName": 1,
             "bsecode": 1, "_id": 0},
    ))

    result: dict[int, dict[str, str]] = {}
    for d in docs:
        cc = d.get("co_code")
        if not cc:
            continue
        cc = int(cc)
        nse_sym = (d.get("nsesymbol") or "").strip().upper()
        bse_raw = d.get("bsecode")
        bse_str = str(bse_raw).split(".")[0] if bse_raw else None
        company_name = d.get("companyname") or d.get("CompanyName") or ""

        # Get sector from Excel
        excel = company_master_service.get_sector_industry(nse_sym or None, bse_str)
        sector = excel[0] if excel else ""

        result[cc] = {
            "symbol": nse_sym or (bse_str or str(cc)),
            "company_name": company_name,
            "sector": sector,
        }

    _co_code_map = result
    logger.info("Star investor: built co_code map with %d entries", len(result))
    return result


def _name_query(name: str) -> dict:
    """Build a MongoDB $or query matching Name/Hname/hname."""
    return {"$or": [
        {"Name": name},
        {"Hname": name},
        {"hname": name},
    ]}


# ── Top investors ──────────────────────────────────────────────────

def get_top_investors(limit: int = 50) -> list[dict[str, Any]]:
    """Return top investors by number of distinct company holdings."""
    global _top_investors_cache, _top_investors_ts

    now = time.time()
    if _top_investors_cache is not None and (now - _top_investors_ts) < _CACHE_TTL:
        return _top_investors_cache[:limit]

    t0 = time.time()
    db = get_mongo_db()
    coll = db["indira_cmots_shareholding_more_than_one_percent"]

    # Coalesce the 3 name fields and aggregate
    pipeline = [
        {"$project": {
            "name": {"$ifNull": ["$Name", {"$ifNull": ["$Hname", "$hname"]}]},
            "co_code": 1,
            "date": {"$ifNull": ["$date", {"$ifNull": ["$DateOfInfo", "$dateofinfo"]}]},
        }},
        {"$match": {"name": {"$ne": None, "$ne": ""}}},
        {"$group": {
            "_id": "$name",
            "co_codes": {"$addToSet": "$co_code"},
            "latest_date": {"$max": "$date"},
        }},
        {"$project": {
            "name": "$_id",
            "holdings_count": {"$size": "$co_codes"},
            "latest_date": 1,
            "_id": 0,
        }},
        {"$match": {"holdings_count": {"$gte": 2}}},
        {"$sort": {"holdings_count": -1}},
        {"$limit": 500},  # Cache top 500, return top N
    ]

    results = list(coll.aggregate(pipeline, allowDiskUse=True))

    for r in results:
        dt = r.get("latest_date")
        if hasattr(dt, "strftime"):
            r["latest_date"] = dt.strftime("%Y-%m-%d")
        elif dt:
            r["latest_date"] = str(dt)[:10]
        else:
            r["latest_date"] = ""

    _top_investors_cache = results
    _top_investors_ts = now
    logger.info(
        "Star investor: top investors computed (%d entries) in %.1fs",
        len(results), time.time() - t0,
    )
    return results[:limit]


# ── Search ─────────────────────────────────────────────────────────

def search_investors(query: str, limit: int = 20) -> list[dict[str, Any]]:
    """Search investor names using in-memory cache."""
    names = shareholding_service.get_all_shareholder_names()
    q = query.lower()
    matches = [n for n in names if q in n.lower()][:limit]
    return [{"name": n} for n in matches]


# ── Investor holdings ──────────────────────────────────────────────

def get_investor_holdings(name: str) -> list[dict[str, Any]]:
    """Get all current holdings for an investor (latest date per co_code)."""
    db = get_mongo_db()
    coll = db["indira_cmots_shareholding_more_than_one_percent"]
    co_map = _get_co_code_map()

    docs = list(coll.find(_name_query(name)))
    if not docs:
        return []

    # Group by co_code, keep latest date
    by_co: dict[int, dict] = {}
    for d in docs:
        cc = d.get("co_code")
        if cc is None:
            continue
        cc = int(cc)
        dt = d.get("date") or d.get("DateOfInfo") or d.get("dateofinfo")
        existing = by_co.get(cc)
        if existing is None or (dt and (existing.get("_dt") is None or dt > existing["_dt"])):
            perstake = 0.0
            try:
                perstake = float(d.get("perstake", 0) or 0)
            except (ValueError, TypeError):
                pass

            shares = 0
            try:
                shares = int(float(d.get("NOOFshares", 0) or d.get("Nosh", 0) or 0))
            except (ValueError, TypeError):
                pass

            date_str = ""
            if hasattr(dt, "strftime"):
                date_str = dt.strftime("%Y-%m-%d")
            elif dt:
                date_str = str(dt)

            by_co[cc] = {
                "co_code": cc,
                "perstake": round(perstake, 2),
                "shares": shares,
                "date": date_str,
                "_dt": dt,
            }

    # Enrich with company info
    holdings: list[dict[str, Any]] = []
    for cc, h in by_co.items():
        if h["perstake"] <= 0:
            continue
        info = co_map.get(cc, {})
        h["symbol"] = info.get("symbol", str(cc))
        h["company_name"] = info.get("company_name", "")
        h["sector"] = info.get("sector", "")
        del h["_dt"]
        holdings.append(h)

    holdings.sort(key=lambda x: x["perstake"], reverse=True)
    return holdings


# ── Key changes ────────────────────────────────────────────────────

def get_investor_key_changes(name: str) -> list[dict[str, Any]]:
    """Compare latest two dates per co_code for stake changes."""
    db = get_mongo_db()
    coll = db["indira_cmots_shareholding_more_than_one_percent"]
    co_map = _get_co_code_map()

    docs = list(coll.find(_name_query(name)))
    if not docs:
        return []

    # Group all records by co_code, sorted by date
    by_co: dict[int, list[dict]] = defaultdict(list)
    for d in docs:
        cc = d.get("co_code")
        if cc is None:
            continue
        dt = d.get("date") or d.get("DateOfInfo") or d.get("dateofinfo")
        perstake = 0.0
        try:
            perstake = float(d.get("perstake", 0) or 0)
        except (ValueError, TypeError):
            pass
        shares = 0
        try:
            shares = int(float(d.get("NOOFshares", 0) or d.get("Nosh", 0) or 0))
        except (ValueError, TypeError):
            pass
        by_co[int(cc)].append({"dt": dt, "perstake": perstake, "shares": shares})

    changes: list[dict[str, Any]] = []
    for cc, records in by_co.items():
        records.sort(key=lambda x: x["dt"] or "", reverse=True)
        curr = records[0]
        prev = records[1] if len(records) > 1 else None

        cur_stake = round(curr["perstake"], 2)
        prev_stake = round(prev["perstake"], 2) if prev else None
        delta = round(cur_stake - prev_stake, 2) if prev_stake is not None else None

        if prev_stake is None or prev_stake == 0:
            change_type = "New Entry"
        elif cur_stake == 0:
            change_type = "Exited"
        elif delta and delta > 0.01:
            change_type = "Increased"
        elif delta and delta < -0.01:
            change_type = "Decreased"
        else:
            change_type = "Unchanged"

        if cur_stake <= 0 and change_type != "Exited":
            continue

        info = co_map.get(cc, {})
        changes.append({
            "co_code": cc,
            "symbol": info.get("symbol", str(cc)),
            "company_name": info.get("company_name", ""),
            "sector": info.get("sector", ""),
            "current_stake": cur_stake,
            "prev_stake": prev_stake,
            "stake_change": delta,
            "shares_current": curr["shares"],
            "shares_prev": prev["shares"] if prev else 0,
            "change_type": change_type,
        })

    # Sort: New/Increased first, then Decreased/Exited
    order = {"New Entry": 0, "Increased": 1, "Decreased": 2, "Exited": 3, "Unchanged": 4}
    changes.sort(key=lambda x: (order.get(x["change_type"], 5), -x["current_stake"]))
    return changes


# ── Enrich with returns ────────────────────────────────────────────

def enrich_with_returns(
    holdings: list[dict[str, Any]],
    returns_data: list[dict[str, Any]],
    period: str = "1m",
) -> list[dict[str, Any]]:
    """Attach price + period return to each holding from returns cache."""
    # Build symbol → returns lookup
    ret_map: dict[str, dict] = {}
    for r in returns_data:
        sym = r.get("symbol")
        if sym:
            ret_map[sym] = r

    for h in holdings:
        entry = ret_map.get(h.get("symbol", ""))
        if entry:
            h["price"] = entry.get("price")
            pct = entry.get(period)
            h["pct_change"] = pct
            if h["price"] is not None and pct is not None:
                h["price_change"] = round(h["price"] * pct / (100 + pct), 2)
            else:
                h["price_change"] = None
        else:
            h["price"] = None
            h["pct_change"] = None
            h["price_change"] = None

    return holdings


def get_gainers_losers(
    holdings: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Split enriched holdings into gainers and losers."""
    gainers = [h for h in holdings if (h.get("pct_change") or 0) > 0]
    losers = [h for h in holdings if (h.get("pct_change") or 0) < 0]
    gainers.sort(key=lambda x: x.get("pct_change", 0), reverse=True)
    losers.sort(key=lambda x: x.get("pct_change", 0))
    return gainers, losers
