"""
Market overview split trends — computes time-series metrics split by
a category dimension (mcap bucket, sector, industry).
Collection data is cached for 6 hours; splits computed on-the-fly.
"""

import logging
import math
import statistics
import time
from collections import defaultdict
from typing import Any

from backend.database_mongo import get_mongo_db
from backend.schemas.market_overview_split_trends import (
    SplitTrendPoint,
    SplitTrendResponse,
    SplitTrendSeries,
)
from backend.services import company_master_service

logger = logging.getLogger(__name__)

MIN_PERIOD = "2015-03"
_CACHE_TTL = 6 * 60 * 60  # 6 hours

# ── Caches ────────────────────────────────────────────────────────────
_attrs_cache: dict[int, dict[str, Any]] | None = None
_attrs_cache_ts: float = 0.0
_collection_caches: dict[str, tuple[float, dict]] = {}

# ── Market Cap Buckets ────────────────────────────────────────────────
MCAP_BUCKETS = [
    ("Less than 100cr", 0, 100),
    ("100cr to 300cr", 100, 300),
    ("300cr to 1000cr", 300, 1000),
    ("1000cr to 25000cr", 1000, 25000),
    ("25000cr to 1 Lakh cr", 25000, 100000),
    ("Greater than 1 Lakh cr", 100000, float("inf")),
]

# ── Metric + Split definitions ────────────────────────────────────────
METRIC_DEFS: dict[str, dict[str, Any]] = {
    "total_companies": {
        "label": "Total Companies",
        "collection": "valuation",
        "agg": "count",
    },
    "total_sales": {
        "label": "Total Sales",
        "collection": "pl",
        "agg": "sum",
        "field": "sales",
    },
    "total_ebitda": {
        "label": "Total EBITDA",
        "collection": "pl",
        "agg": "sum",
        "field": "ebitda",
    },
    "total_pat": {
        "label": "Total PAT",
        "collection": "pl",
        "agg": "sum",
        "field": "pat",
    },
    "total_operating_profit": {
        "label": "Total Operating Profit",
        "collection": "pl",
        "agg": "sum",
        "derived": True,
        "derive_fields": ["ebitda", "depreciation"],
        "derive_fn": lambda e, d: e - d,
    },
    "total_debt": {
        "label": "Total Debt",
        "collection": "bs",
        "agg": "sum",
        "derived": True,
        "derive_fields": ["short_debt", "long_debt"],
        "derive_fn": lambda s, l: s + l,
    },
    "total_net_fixed_assets": {
        "label": "Total Net Fixed Assets",
        "collection": "bs",
        "agg": "sum",
        "field": "net_fixed_assets",
    },
    "median_pe": {
        "label": "Median P/E Ratio",
        "collection": "valuation",
        "agg": "median",
        "field": "pe",
    },
    "median_price_to_book": {
        "label": "Median Price to Book",
        "collection": "valuation",
        "agg": "median",
        "field": "pb",
    },
    "median_price_to_sales": {
        "label": "Median Price to Sales",
        "collection": "valuation",
        "agg": "median",
        "field": "ps",
    },
    "median_ev_ebitda": {
        "label": "Median EV/EBITDA",
        "collection": "valuation",
        "agg": "median",
        "field": "ev_ebitda",
    },
    "median_roe": {
        "label": "Median Return on Equity",
        "collection": "return_ratios",
        "agg": "median",
        "field": "roe",
    },
    "median_roce": {
        "label": "Median Return on Capital Employed",
        "collection": "return_ratios",
        "agg": "median",
        "field": "roce",
    },
    "median_roa": {
        "label": "Median Return on Assets",
        "collection": "return_ratios",
        "agg": "median",
        "field": "roa",
    },
    "median_ebitda_margin": {
        "label": "Median EBITDA Margin",
        "collection": "margin",
        "agg": "median",
        "field": "ebitda_margin",
    },
    "median_operating_profit_margin": {
        "label": "Median Operating Profit Margin",
        "collection": "margin",
        "agg": "median",
        "field": "op_margin",
    },
    "median_pat_margin": {
        "label": "Median PAT Margin",
        "collection": "margin",
        "agg": "median",
        "field": "pat_margin",
    },
    "median_debt_to_equity": {
        "label": "Median Debt to Equity",
        "collection": "stability",
        "agg": "median",
        "field": "debt_to_equity",
    },
}

SPLIT_DEFS = {
    "mcap_bucket": "Market Cap Bucket",
    "sector": "Sector",
    "industry": "Industry",
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


def _compute_median(values: list[float]) -> float | None:
    if not values:
        return None
    clean = [v for v in values if math.isfinite(v)]
    if not clean:
        return None
    return round(statistics.median(clean), 4)


def _y_key_to_period(y_key: str) -> str | None:
    if not y_key.startswith("Y") or len(y_key) < 5:
        return None
    try:
        year = y_key[1:5]
        month = y_key[5:7] if len(y_key) >= 7 else "03"
        return f"{year}-{month}"
    except (ValueError, IndexError):
        return None


def _is_valid_period(period: str) -> bool:
    if not period or len(period) < 4:
        return False
    try:
        int(period[:4])
    except ValueError:
        return False
    return period >= MIN_PERIOD


def _get_mcap_bucket(mcap: float) -> str:
    for label, low, high in MCAP_BUCKETS:
        if low <= mcap < high:
            return f"Market Cap Range: {label}"
    return f"Market Cap Range: {MCAP_BUCKETS[-1][0]}"


# ── Company attributes loader ────────────────────────────────────────

def _load_company_attrs(db: Any) -> dict[int, dict[str, Any]]:
    global _attrs_cache, _attrs_cache_ts
    if _attrs_cache is not None and time.time() - _attrs_cache_ts < _CACHE_TTL:
        return _attrs_cache

    result: dict[int, dict[str, Any]] = {}
    for doc in db["indira_cmots_company_master"].find(
        {}, {"_id": 0, "co_code": 1, "nsesymbol": 1, "bsecode": 1, "sectorname": 1, "industryname": 1, "mcap": 1}
    ):
        cc = doc.get("co_code")
        if cc is None:
            continue
        mcap = _safe_float(doc.get("mcap"))
        # Override sector/industry from Excel (try NSE symbol, then BSE code)
        nse_sym = (doc.get("nsesymbol") or "").strip().upper()
        bse_raw = doc.get("bsecode")
        bse_str = str(bse_raw).split(".")[0] if bse_raw else None
        excel_info = company_master_service.get_sector_industry(nse_sym or None, bse_str)
        if not excel_info:
            continue  # Skip companies not in Excel
        sector = excel_info[0] or None
        industry = excel_info[1] or None

        result[int(cc)] = {
            "sector": sector,
            "industry": industry,
            "mcap": mcap,
        }

    _attrs_cache = result
    _attrs_cache_ts = time.time()
    logger.info("Split trends: loaded attrs for %d companies", len(result))
    return result


# ── Collection data loaders ──────────────────────────────────────────

def _load_rid_collection(
    db: Any,
    collection_name: str,
    rid_map: dict[int, str],
) -> dict[int, dict[str, dict[str, float]]]:
    """Load a RID-based collection → {co_code: {period: {alias: val}}}."""
    pipeline = [
        {
            "$project": {
                "_id": 0,
                "co_code": 1,
                "data": {
                    "$filter": {
                        "input": "$data",
                        "as": "row",
                        "cond": {"$in": ["$$row.RID", list(rid_map.keys())]},
                    }
                },
            }
        }
    ]
    result: dict[int, dict[str, dict[str, float]]] = defaultdict(
        lambda: defaultdict(dict)
    )
    for doc in db[collection_name].aggregate(pipeline, allowDiskUse=True):
        cc = doc.get("co_code")
        if cc is None:
            continue
        cc_int = int(cc)
        for row in (doc.get("data") or []):
            rid = row.get("RID")
            alias = rid_map.get(rid)
            if alias is None:
                continue
            for key, val in row.items():
                if not isinstance(key, str) or not key.startswith("Y"):
                    continue
                period = _y_key_to_period(key)
                if period is None or not _is_valid_period(period):
                    continue
                v = _safe_float(val)
                if v is not None:
                    result[cc_int][period][alias] = v

    logger.info(
        "Split trends: loaded %s for %d companies", collection_name, len(result)
    )
    return dict(result)


def _load_flat_collection(
    db: Any,
    collection_name: str,
    match_filter: dict,
    field_map: dict[str, str],
) -> dict[int, dict[str, dict[str, float]]]:
    """Load a flat ratio collection → {co_code: {period: {alias: val}}}."""
    projection: dict[str, int] = {"_id": 0, "co_code": 1, "year": 1}
    for f in field_map:
        projection[f] = 1

    result: dict[int, dict[str, dict[str, float]]] = defaultdict(
        lambda: defaultdict(dict)
    )
    cursor = db[collection_name].find(
        {**match_filter, "year": {"$gte": MIN_PERIOD}}, projection
    )
    for doc in cursor:
        cc = doc.get("co_code")
        period = str(doc.get("year", ""))
        if cc is None or not _is_valid_period(period):
            continue
        cc_int = int(cc)
        for mongo_field, alias in field_map.items():
            v = _safe_float(doc.get(mongo_field))
            if v is not None:
                result[cc_int][period][alias] = v

    logger.info(
        "Split trends: loaded %s for %d companies", collection_name, len(result)
    )
    return dict(result)


# ── Concrete collection loaders (registered below) ────────────────────

def _load_pl(db: Any) -> dict:
    return _load_rid_collection(
        db,
        "indira_cmots_profit_loss",
        {8: "sales", 21: "depreciation", 35: "pat", 46: "ebitda"},
    )


def _load_bs(db: Any) -> dict:
    return _load_rid_collection(
        db,
        "indira_cmots_balance_sheet",
        {2: "net_fixed_assets", 41: "short_debt", 54: "long_debt"},
    )


def _load_valuation(db: Any) -> dict:
    return _load_flat_collection(
        db,
        "indira_cmots_valuation_ratios",
        {"type": "S"},
        {"PE": "pe", "Price_BookValue": "pb", "Mcap_Sales": "ps", "EV_EBITDA": "ev_ebitda"},
    )


def _load_return_ratios(db: Any) -> dict:
    return _load_flat_collection(
        db,
        "indira_cmots_return_ratios",
        {"type": "S"},
        {"Return_ROE": "roe", "Return_ROCE": "roce", "Return_ReturnOnAssets": "roa"},
    )


def _load_margin(db: Any) -> dict:
    return _load_flat_collection(
        db,
        "indira_cmots_margin_ratios",
        {"type": "S"},
        {"pbidtim": "ebitda_margin", "ebitm": "op_margin", "patm": "pat_margin"},
    )


def _load_stability(db: Any) -> dict:
    return _load_flat_collection(
        db,
        "indira_cmots_financial_stability_ratios",
        {"companymode": "S"},
        {"TotalDebt_Equity": "debt_to_equity"},
    )


_COLLECTION_LOADERS: dict[str, Any] = {
    "pl": _load_pl,
    "bs": _load_bs,
    "valuation": _load_valuation,
    "return_ratios": _load_return_ratios,
    "margin": _load_margin,
    "stability": _load_stability,
}


def _get_collection_data(db: Any, key: str) -> dict:
    """Return cached collection data, loading from MongoDB if stale."""
    if key in _collection_caches:
        ts, data = _collection_caches[key]
        if time.time() - ts < _CACHE_TTL:
            return data
    data = _COLLECTION_LOADERS[key](db)
    _collection_caches[key] = (time.time(), data)
    return data


# ── Category mapping ──────────────────────────────────────────────────

def _build_category_map(
    attrs: dict[int, dict[str, Any]], split_by: str
) -> dict[int, str]:
    result: dict[int, str] = {}
    for cc, info in attrs.items():
        if split_by == "mcap_bucket":
            mcap = info.get("mcap")
            if mcap is not None:
                result[cc] = _get_mcap_bucket(mcap)
        elif split_by == "sector":
            val = info.get("sector")
            if val:
                result[cc] = val
        elif split_by == "industry":
            val = info.get("industry")
            if val:
                result[cc] = val
    return result


# ── Split computation ─────────────────────────────────────────────────

def _compute_split_series(
    per_company_data: dict[int, dict[str, dict[str, float]]],
    category_map: dict[int, str],
    metric_def: dict[str, Any],
) -> list[SplitTrendSeries]:
    agg = metric_def["agg"]
    field = metric_def.get("field")
    is_derived = metric_def.get("derived", False)
    derive_fields = metric_def.get("derive_fields", [])
    derive_fn = metric_def.get("derive_fn")

    # {category: {period: [values]}}
    grouped: dict[str, dict[str, list[float]]] = defaultdict(
        lambda: defaultdict(list)
    )

    for cc, periods in per_company_data.items():
        category = category_map.get(cc)
        if category is None:
            continue
        for period, fields_data in periods.items():
            if agg == "count":
                grouped[category][period].append(1.0)
            elif is_derived and derive_fn and derive_fields:
                vals = [fields_data.get(f) for f in derive_fields]
                if all(v is not None for v in vals):
                    grouped[category][period].append(derive_fn(*vals))
            elif field:
                v = fields_data.get(field)
                if v is not None:
                    grouped[category][period].append(v)

    # Filter out periods with sparse data (< 1% of peak or < 50 companies)
    period_totals: dict[str, int] = defaultdict(int)
    for category_data in grouped.values():
        for period, values in category_data.items():
            period_totals[period] += len(values)
    if period_totals:
        max_count = max(period_totals.values())
        min_threshold = max(50, int(max_count * 0.01))
        valid_periods = {p for p, c in period_totals.items() if c >= min_threshold}
        for category in grouped:
            grouped[category] = {
                p: v for p, v in grouped[category].items() if p in valid_periods
            }

    # Sort categories: mcap_bucket by predefined order, others alphabetically
    sorted_cats = list(grouped.keys())
    if any("Market Cap Range:" in c for c in sorted_cats):
        bucket_order = {
            f"Market Cap Range: {label}": i
            for i, (label, _, _) in enumerate(MCAP_BUCKETS)
        }
        sorted_cats.sort(key=lambda c: bucket_order.get(c, 999))
    else:
        sorted_cats.sort()

    result: list[SplitTrendSeries] = []
    for category in sorted_cats:
        points: list[SplitTrendPoint] = []
        for period in sorted(grouped[category].keys()):
            values = grouped[category][period]
            if agg == "count":
                agg_value: float | None = float(len(values))
            elif agg == "sum":
                agg_value = sum(values)
            elif agg == "median":
                agg_value = _compute_median(values)
            else:
                agg_value = None
            if agg_value is not None:
                points.append(
                    SplitTrendPoint(period=period, value=round(agg_value, 2))
                )
        if points:
            result.append(SplitTrendSeries(label=category, data=points))

    return result


# ── Public API ────────────────────────────────────────────────────────

def get_split_trends(metric: str, split_by: str) -> SplitTrendResponse:
    """Compute split trend data for a given metric and category."""
    metric_def = METRIC_DEFS.get(metric)
    if metric_def is None:
        raise ValueError(f"Unknown metric: {metric}")

    split_label = SPLIT_DEFS.get(split_by)
    if split_label is None:
        raise ValueError(f"Unknown split_by: {split_by}")

    db = get_mongo_db()

    attrs = _load_company_attrs(db)
    category_map = _build_category_map(attrs, split_by)

    collection_key = metric_def["collection"]
    per_company_data = _get_collection_data(db, collection_key)

    splits = _compute_split_series(per_company_data, category_map, metric_def)

    metric_label = metric_def["label"]
    title = (
        f"What is the overall trend of {metric_label} over time, "
        f"split across {split_label}?"
    )
    subtitle = (
        f"Displays trend of {metric_label} of selected listed universe "
        f"across {split_label} and Time."
    )

    return SplitTrendResponse(
        metric=metric,
        metric_label=metric_label,
        split_by=split_by,
        split_by_label=split_label,
        title=title,
        subtitle=subtitle,
        splits=splits,
    )


def get_available_options() -> dict:
    """Return available metrics and split dimensions for the frontend."""
    return {
        "metrics": [
            {"value": k, "label": v["label"]} for k, v in METRIC_DEFS.items()
        ],
        "split_by": [
            {"value": k, "label": v} for k, v in SPLIT_DEFS.items()
        ],
    }
