"""
Market overview scanner — finds companies with the biggest changes
in a selected metric over the last 4 periods. Cached for 6 hours.
"""

import logging
import math
import time
from collections import defaultdict
from typing import Any

from backend.database_mongo import get_mongo_db
from backend.schemas.market_overview_scanner import (
    ScannerResponse,
    ScannerRow,
)
from backend.services import company_master_service

logger = logging.getLogger(__name__)

_CACHE_TTL = 6 * 60 * 60  # 6 hours
_scanner_cache: dict[str, tuple[float, ScannerResponse]] = {}
_attrs_cache: dict[int, dict[str, Any]] | None = None
_attrs_cache_ts: float = 0.0

# ── Metric definitions ────────────────────────────────────────────────

SCANNER_METRICS: dict[str, dict[str, Any]] = {
    "promoter_holding": {
        "label": "Change in Promoter Holding",
        "collection": "indira_cmots_shareholding_pattern",
        "match": {},
        "field": "TotalPromoter_PerShares",
        "quarterly": True,
    },
    "institutional_holding": {
        "label": "Change in Institutional Holding",
        "collection": "indira_cmots_shareholding_pattern",
        "match": {},
        "field": "PPISUBTOT",
        "quarterly": True,
    },
    "public_holding": {
        "label": "Change in Public Holding",
        "collection": "indira_cmots_shareholding_pattern",
        "match": {},
        "field": "PPSUBTOT",
        "quarterly": True,
    },
    "market_cap": {
        "label": "Change in MarketCap",
        "collection": "indira_cmots_valuation_ratios",
        "match": {"type": "S"},
        "field": "Mcap_Sales",
        "quarterly": False,
        "derived": True,  # needs P&L Sales to compute actual mcap
    },
    "pe": {
        "label": "Change in P/E Ratio",
        "collection": "indira_cmots_valuation_ratios",
        "match": {"type": "S"},
        "field": "PE",
        "quarterly": False,
    },
    "price_to_book": {
        "label": "Change in Price to Book",
        "collection": "indira_cmots_valuation_ratios",
        "match": {"type": "S"},
        "field": "Price_BookValue",
        "quarterly": False,
    },
    "roe": {
        "label": "Change in ROE",
        "collection": "indira_cmots_return_ratios",
        "match": {"type": "S"},
        "field": "Return_ROE",
        "quarterly": False,
    },
    "ebitda_margin": {
        "label": "Change in EBITDA Margin",
        "collection": "indira_cmots_margin_ratios",
        "match": {"type": "S"},
        "field": "pbidtim",
        "quarterly": False,
    },
    "debt_to_equity": {
        "label": "Change in Debt to Equity",
        "collection": "indira_cmots_financial_stability_ratios",
        "match": {"companymode": "S"},
        "field": "TotalDebt_Equity",
        "quarterly": False,
    },
}


# ── Helpers ───────────────────────────────────────────────────────────

def _safe_float(val: Any) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        return f if math.isfinite(f) else None
    except (ValueError, TypeError):
        return None


def _y_key_to_period(y_key: str) -> str | None:
    if not y_key.startswith("Y") or len(y_key) < 5:
        return None
    try:
        year = y_key[1:5]
        month = y_key[5:7] if len(y_key) >= 7 else "03"
        return f"{year}-{month}"
    except (ValueError, IndexError):
        return None


# ── Company attrs ─────────────────────────────────────────────────────

def _load_company_attrs(db: Any) -> dict[int, dict[str, Any]]:
    global _attrs_cache, _attrs_cache_ts
    if _attrs_cache is not None and time.time() - _attrs_cache_ts < _CACHE_TTL:
        return _attrs_cache

    result: dict[int, dict[str, Any]] = {}
    for doc in db["indira_cmots_company_master"].find(
        {},
        {"_id": 0, "co_code": 1, "companyname": 1, "nsesymbol": 1, "bsecode": 1, "industryname": 1, "mcap": 1},
    ):
        cc = doc.get("co_code")
        if cc is None:
            continue
        # Override industry from Excel (try NSE symbol, then BSE code)
        nse_sym = (doc.get("nsesymbol") or "").strip().upper()
        bse_raw = doc.get("bsecode")
        bse_str = str(bse_raw).split(".")[0] if bse_raw else None
        excel_info = company_master_service.get_sector_industry(nse_sym or None, bse_str)
        if not excel_info:
            continue  # Skip companies not in Excel
        sector = excel_info[0] or None
        industry = excel_info[1] or None

        result[int(cc)] = {
            "company_name": doc.get("companyname", ""),
            "industry": industry,
            "mcap": _safe_float(doc.get("mcap")),
        }

    _attrs_cache = result
    _attrs_cache_ts = time.time()
    logger.info("Scanner: loaded attrs for %d companies", len(result))
    return result


# ── Period discovery ──────────────────────────────────────────────────

def _get_last_n_periods(
    db: Any, config: dict[str, Any], n: int = 4
) -> list[str]:
    """Find the N most recent periods with >=50 companies."""
    collection = db[config["collection"]]
    match_filter = {**config.get("match", {})}

    pipeline = [
        {"$match": match_filter},
        {"$group": {"_id": "$year", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gte": 50}}},
        {"$sort": {"_id": -1}},
    ]
    results = list(collection.aggregate(pipeline))

    # Filter to valid period strings
    valid = [
        r for r in results
        if isinstance(r["_id"], str) and len(r["_id"]) >= 7 and r["_id"][:4].isdigit()
    ]

    if config.get("quarterly"):
        valid = [r for r in valid if r["_id"][-2:] in ("03", "06", "09", "12")]

    periods = [r["_id"] for r in valid[:n]]
    periods.reverse()  # oldest first
    return periods


# ── Data loading ──────────────────────────────────────────────────────

def _load_scanner_data(
    db: Any, config: dict[str, Any], periods: list[str]
) -> dict[int, dict[str, float]]:
    """Load metric values per company per period: {co_code: {period: value}}."""
    collection = db[config["collection"]]
    field = config["field"]
    match_filter = {**config.get("match", {}), "year": {"$in": periods}}

    result: dict[int, dict[str, float]] = defaultdict(dict)
    for doc in collection.find(
        match_filter, {"_id": 0, "co_code": 1, "year": 1, field: 1}
    ):
        cc = doc.get("co_code")
        period = doc.get("year")
        val = _safe_float(doc.get(field))
        if cc is not None and period is not None and val is not None:
            result[int(cc)][str(period)] = val

    return dict(result)


def _load_market_cap_data(
    db: Any, periods: list[str]
) -> dict[int, dict[str, float]]:
    """Compute market cap = Mcap_Sales × Sales for each company per period."""
    # Load Mcap_Sales from valuation_ratios
    mcap_sales: dict[int, dict[str, float]] = defaultdict(dict)
    for doc in db["indira_cmots_valuation_ratios"].find(
        {"type": "S", "year": {"$in": periods}},
        {"_id": 0, "co_code": 1, "year": 1, "Mcap_Sales": 1},
    ):
        cc = doc.get("co_code")
        period = doc.get("year")
        val = _safe_float(doc.get("Mcap_Sales"))
        if cc is not None and period is not None and val is not None and val > 0:
            mcap_sales[int(cc)][str(period)] = val

    # Load Sales (RID 8) from P&L
    pipeline = [
        {
            "$project": {
                "_id": 0,
                "co_code": 1,
                "data": {
                    "$filter": {
                        "input": "$data",
                        "as": "row",
                        "cond": {"$eq": ["$$row.RID", 8]},
                    }
                },
            }
        }
    ]
    sales_data: dict[int, dict[str, float]] = defaultdict(dict)
    for doc in db["indira_cmots_profit_loss"].aggregate(pipeline, allowDiskUse=True):
        cc = doc.get("co_code")
        if cc is None:
            continue
        cc_int = int(cc)
        for row in (doc.get("data") or []):
            for key, val in row.items():
                if not isinstance(key, str) or not key.startswith("Y"):
                    continue
                period = _y_key_to_period(key)
                if period is not None and period in periods:
                    v = _safe_float(val)
                    if v is not None and v > 0:
                        sales_data[cc_int][period] = v

    # Compute market cap = Mcap_Sales × Sales
    result: dict[int, dict[str, float]] = defaultdict(dict)
    for cc in mcap_sales:
        for period in periods:
            ms = mcap_sales[cc].get(period)
            sales = sales_data.get(cc, {}).get(period)
            if ms is not None and sales is not None:
                result[cc][period] = round(ms * sales, 2)

    return dict(result)


# ── Main API ──────────────────────────────────────────────────────────

def get_scanner_data(metric: str) -> ScannerResponse:
    """Return top companies by change in the selected metric."""
    # Check cache
    if metric in _scanner_cache:
        ts, cached = _scanner_cache[metric]
        if time.time() - ts < _CACHE_TTL:
            return cached

    config = SCANNER_METRICS.get(metric)
    if config is None:
        raise ValueError(f"Unknown scanner metric: {metric}")

    db = get_mongo_db()

    # 1. Find last 4 periods
    periods = _get_last_n_periods(db, config, n=4)
    if len(periods) < 2:
        return ScannerResponse(
            metric=metric,
            metric_label=config["label"],
            title=f"How is {config['label'].replace('Change in ', '')} changing?",
            subtitle="Not enough historical data available",
            periods=periods,
            period_type="quarterly" if config.get("quarterly") else "annual",
            rows=[],
        )

    logger.info("Scanner [%s]: periods = %s", metric, periods)

    # 2. Load data
    if config.get("derived") and metric == "market_cap":
        company_data = _load_market_cap_data(db, periods)
    else:
        company_data = _load_scanner_data(db, config, periods)

    # 3. Load company attrs
    attrs = _load_company_attrs(db)

    # Pad periods to exactly 4 (oldest first)
    while len(periods) < 4:
        periods.insert(0, "")

    # 4. Build rows
    rows: list[ScannerRow] = []
    for cc, period_vals in company_data.items():
        oldest_val = period_vals.get(periods[0])
        newest_val = period_vals.get(periods[-1])
        if newest_val is None:
            continue

        change = None
        if oldest_val is not None and newest_val is not None:
            change = round(newest_val - oldest_val, 2)

        info = attrs.get(cc, {})
        rows.append(
            ScannerRow(
                company_name=info.get("company_name", str(cc)),
                industry=info.get("industry"),
                market_cap=info.get("mcap"),
                q3_ago=period_vals.get(periods[0]),
                q2_ago=period_vals.get(periods[1]),
                q1_ago=period_vals.get(periods[2]),
                current_qtr=newest_val,
                change_3q=change,
            )
        )

    # Sort by change descending (biggest positive changes first)
    rows.sort(key=lambda r: r.change_3q if r.change_3q is not None else float("-inf"), reverse=True)
    rows = rows[:15]

    metric_name = config["label"].replace("Change in ", "")
    period_type = "quarterly" if config.get("quarterly") else "annual"
    response = ScannerResponse(
        metric=metric,
        metric_label=config["label"],
        title=f"How is {metric_name} changing over the last four {'quarters' if period_type == 'quarterly' else 'years'}?",
        subtitle=f"Displays companies where {metric_name} is increasing or decreasing over the last four {'quarters' if period_type == 'quarterly' else 'years'}",
        periods=periods,
        period_type=period_type,
        rows=rows,
    )

    _scanner_cache[metric] = (time.time(), response)
    logger.info("Scanner [%s]: %d rows cached", metric, len(rows))
    return response


def get_scanner_options() -> list[dict[str, str]]:
    """Return available scanner metrics."""
    return [{"value": k, "label": v["label"]} for k, v in SCANNER_METRICS.items()]
