"""
Market overview trends service — pre-aggregates 27 trend metrics
across all companies per fiscal period.  Cached for 6 hours.
"""

import logging
import math
import statistics
import time
from collections import defaultdict
from typing import Any

from backend.database_mongo import get_mongo_db
from backend.schemas.market_overview_trends import (
    MarketOverviewTrendsResponse,
    TrendDataPoint,
)

logger = logging.getLogger(__name__)

# ── Module-level cache ──────────────────────────────────────────────
_trends_cache: MarketOverviewTrendsResponse | None = None
_trends_cache_ts: float = 0.0
_TRENDS_CACHE_TTL = 6 * 60 * 60  # 6 hours

MIN_PERIOD = "2021-03"


# ── Helpers ─────────────────────────────────────────────────────────

def _safe_float(val: Any) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        return f if math.isfinite(f) else None
    except (ValueError, TypeError):
        return None


def _compute_median(values: list[Any]) -> float | None:
    """Median of non-null, finite values with IQR outlier removal. Returns None if empty."""
    clean = [v for v in (_safe_float(x) for x in values) if v is not None]
    if not clean:
        return None
    # IQR-based outlier removal (only if enough data points)
    if len(clean) >= 10:
        clean.sort()
        q1_idx = len(clean) // 4
        q3_idx = 3 * len(clean) // 4
        q1 = clean[q1_idx]
        q3 = clean[q3_idx]
        iqr = q3 - q1
        lower = q1 - 3.0 * iqr
        upper = q3 + 3.0 * iqr
        clean = [v for v in clean if lower <= v <= upper]
    if not clean:
        return None
    return round(statistics.median(clean), 4)


def _y_key_to_period(y_key: str) -> str | None:
    """Convert 'Y202503' → '2025-03'.  Returns None if unparseable."""
    if not y_key.startswith("Y") or len(y_key) < 5:
        return None
    try:
        year = y_key[1:5]
        month = y_key[5:7] if len(y_key) >= 7 else "03"
        return f"{year}-{month}"
    except (ValueError, IndexError):
        return None


def _is_valid_period(period: str) -> bool:
    """Check if a period string looks like YYYY-MM and >= MIN_PERIOD."""
    if not period or len(period) < 4:
        return False
    try:
        int(period[:4])
    except ValueError:
        return False
    return period >= MIN_PERIOD


def _to_trend_points(data: dict[str, float | None]) -> list[TrendDataPoint]:
    """Convert {period: value} dict to sorted list of TrendDataPoint."""
    return [
        TrendDataPoint(period=p, value=round(v, 2) if v is not None else None)
        for p, v in sorted(data.items())
        if _is_valid_period(p) and v is not None
    ]


# ── RID-based collection aggregation ───────────────────────────────

def _aggregate_rid_collection(
    db: Any,
    collection_name: str,
    rid_list: list[int],
    annual_only: bool = False,
) -> dict[int, dict[str, dict[int, float]]]:
    """
    Process a RID-based collection (P&L, balance sheet, cash flow).
    Returns: {rid: {period: {co_code: value}}}

    If annual_only=True, only keep March (annual) periods (ending in '-03')
    to avoid mixing quarterly and annual data in sum-based aggregations.
    """
    pipeline = [
        {
            "$project": {
                "_id": 0,
                "co_code": 1,
                "data": {
                    "$filter": {
                        "input": "$data",
                        "as": "row",
                        "cond": {"$in": ["$$row.RID", rid_list]},
                    }
                },
            }
        }
    ]
    result: dict[int, dict[str, dict[int, float]]] = {
        rid: defaultdict(dict) for rid in rid_list
    }

    for doc in db[collection_name].aggregate(pipeline, allowDiskUse=True):
        cc = doc.get("co_code")
        if cc is None:
            continue
        cc = int(cc)
        for row in (doc.get("data") or []):
            rid = row.get("RID")
            if rid not in result:
                continue
            for key, val in row.items():
                if not isinstance(key, str) or not key.startswith("Y"):
                    continue
                period = _y_key_to_period(key)
                if period is None or not _is_valid_period(period):
                    continue
                if annual_only and not period.endswith("-03"):
                    continue
                fval = _safe_float(val)
                if fval is not None:
                    result[rid][period][cc] = fval

    return result


def _sum_by_period(data: dict[str, dict[int, float]]) -> dict[str, float]:
    """Sum all company values per period."""
    return {period: sum(cc_vals.values()) for period, cc_vals in data.items()}


# ── Flat collection median aggregation ──────────────────────────────

def _aggregate_flat_median(
    db: Any,
    collection_name: str,
    match_filter: dict,
    fields: list[str],
) -> dict[str, dict[str, list[Any]]]:
    """
    For flat ratio collections, group by year and push field values.
    Returns: {period: {field: [values]}}
    """
    group_spec: dict[str, Any] = {"_id": "$year"}
    for f in fields:
        # Handle fields with special chars like "CFO/EBITDA"
        group_spec[f.replace("/", "_").replace(" ", "_").replace("-", "_")] = {
            "$push": f"${f}"
        }

    pipeline = [
        {"$match": match_filter},
        {"$group": group_spec},
        {"$sort": {"_id": 1}},
    ]

    result: dict[str, dict[str, list[Any]]] = defaultdict(lambda: defaultdict(list))
    for doc in db[collection_name].aggregate(pipeline, allowDiskUse=True):
        period = str(doc.get("_id", ""))
        if not _is_valid_period(period):
            continue
        for f in fields:
            safe_key = f.replace("/", "_").replace(" ", "_").replace("-", "_")
            vals = doc.get(safe_key, [])
            result[period][f] = vals

    return dict(result)


def _extract_medians(
    grouped: dict[str, dict[str, list[Any]]],
    field: str,
) -> dict[str, float | None]:
    """From grouped data, compute median for a specific field per period."""
    return {
        period: _compute_median(data.get(field, []))
        for period, data in grouped.items()
    }


# ── Main function ───────────────────────────────────────────────────

def get_market_overview_trends() -> MarketOverviewTrendsResponse:
    """Build all 27 trend metrics. Called via asyncio.to_thread()."""
    global _trends_cache, _trends_cache_ts

    now = time.time()
    if _trends_cache is not None and (now - _trends_cache_ts) < _TRENDS_CACHE_TTL:
        logger.debug("Market overview trends served from cache")
        return _trends_cache

    db = get_mongo_db()

    # ══════════════════════════════════════════════════════════════
    # 1) PROFIT & LOSS — Sales, Depreciation, PAT, EBITDA
    # ══════════════════════════════════════════════════════════════
    logger.info("Trends: querying P&L data (annual only)...")
    pl_data = _aggregate_rid_collection(
        db, "indira_cmots_profit_loss", [8, 21, 35, 46], annual_only=True
    )
    sales_by_period = _sum_by_period(pl_data[8])
    depreciation_by_period_raw = pl_data[21]   # {period: {cc: val}}
    pat_by_period = _sum_by_period(pl_data[35])
    ebitda_by_period = _sum_by_period(pl_data[46])
    ebitda_by_period_raw = pl_data[46]

    # Operating Profit = EBITDA − Depreciation (per company, then sum)
    op_profit_by_period: dict[str, float] = {}
    for period in ebitda_by_period_raw:
        total = 0.0
        for cc, ebitda_val in ebitda_by_period_raw[period].items():
            dep_val = depreciation_by_period_raw.get(period, {}).get(cc, 0.0)
            total += (ebitda_val - dep_val)
        op_profit_by_period[period] = total

    # Companies listed count (from P&L co_codes per period)
    companies_count: dict[str, float] = {}
    for period in pl_data[8]:
        companies_count[period] = float(len(pl_data[8][period]))

    logger.info("Trends: P&L done — %d periods", len(sales_by_period))

    # ══════════════════════════════════════════════════════════════
    # 2) BALANCE SHEET — Net Fixed Assets, Short Debt, Long Debt
    # ══════════════════════════════════════════════════════════════
    logger.info("Trends: querying balance sheet data (annual only)...")
    bs_data = _aggregate_rid_collection(
        db, "indira_cmots_balance_sheet", [2, 41, 54], annual_only=True
    )
    net_fixed_assets_by_period = _sum_by_period(bs_data[2])

    # Total Debt = Short-term (41) + Long-term (54) per company, then sum
    debt_by_period: dict[str, float] = {}
    all_periods = set(bs_data[41].keys()) | set(bs_data[54].keys())
    for period in all_periods:
        short_debt = bs_data[41].get(period, {})
        long_debt = bs_data[54].get(period, {})
        all_cc = set(short_debt.keys()) | set(long_debt.keys())
        total = sum(
            short_debt.get(cc, 0.0) + long_debt.get(cc, 0.0)
            for cc in all_cc
        )
        debt_by_period[period] = total

    logger.info("Trends: Balance sheet done — %d periods", len(debt_by_period))

    # ══════════════════════════════════════════════════════════════
    # 3) VALUATION RATIOS — PE, P/B, P/S, EV/EBITDA + company count
    # ══════════════════════════════════════════════════════════════
    logger.info("Trends: querying valuation ratios (annual only)...")
    val_grouped = _aggregate_flat_median(
        db,
        "indira_cmots_valuation_ratios",
        {"type": "S", "year": {"$gte": MIN_PERIOD, "$regex": r"-03$"}},
        ["PE", "Price_BookValue", "Mcap_Sales", "EV_EBITDA"],
    )
    median_pe = _extract_medians(val_grouped, "PE")
    median_pb = _extract_medians(val_grouped, "Price_BookValue")
    median_ps = _extract_medians(val_grouped, "Mcap_Sales")
    median_ev_ebitda = _extract_medians(val_grouped, "EV_EBITDA")

    # Also get per-company Mcap_Sales for market cap computation (annual only)
    val_per_company_pipeline = [
        {"$match": {"type": "S", "year": {"$gte": MIN_PERIOD, "$regex": r"-03$"}}},
        {"$project": {"_id": 0, "co_code": 1, "year": 1, "Mcap_Sales": 1}},
    ]
    mcap_sales_map: dict[str, dict[int, float]] = defaultdict(dict)
    for doc in db["indira_cmots_valuation_ratios"].aggregate(
        val_per_company_pipeline, allowDiskUse=True
    ):
        period = str(doc.get("year", ""))
        cc = doc.get("co_code")
        ms = _safe_float(doc.get("Mcap_Sales"))
        if period and cc is not None and ms is not None and ms > 0:
            mcap_sales_map[period][int(cc)] = ms

    # Market Cap = Sum of (Mcap_Sales × Sales) per company per period
    # We need P&L Sales data keyed by the same period format
    # P&L periods are "YYYY-MM" from Y-columns. Match with valuation year.
    total_mcap_by_period: dict[str, float] = {}
    for period in mcap_sales_map:
        mcap_total = 0.0
        pl_sales = pl_data[8].get(period, {})
        for cc, ms in mcap_sales_map[period].items():
            sales_val = pl_sales.get(cc)
            if sales_val is not None and sales_val > 0:
                mcap_total += ms * sales_val
        if mcap_total > 0:
            total_mcap_by_period[period] = mcap_total

    logger.info("Trends: Valuation ratios done — %d periods", len(median_pe))

    # ══════════════════════════════════════════════════════════════
    # 4) RETURN RATIOS — ROE, ROCE, ROA
    # ══════════════════════════════════════════════════════════════
    logger.info("Trends: querying return ratios (annual only)...")
    ret_grouped = _aggregate_flat_median(
        db,
        "indira_cmots_return_ratios",
        {"type": "S", "year": {"$gte": MIN_PERIOD, "$regex": r"-03$"}},
        ["Return_ROE", "Return_ROCE", "Return_ReturnOnAssets"],
    )
    median_roe = _extract_medians(ret_grouped, "Return_ROE")
    median_roce = _extract_medians(ret_grouped, "Return_ROCE")
    median_roa = _extract_medians(ret_grouped, "Return_ReturnOnAssets")
    logger.info("Trends: Return ratios done — %d periods", len(median_roe))

    # ══════════════════════════════════════════════════════════════
    # 5) MARGIN RATIOS — EBITDA margin, Op margin, PAT margin
    # ══════════════════════════════════════════════════════════════
    logger.info("Trends: querying margin ratios (annual only)...")
    margin_grouped = _aggregate_flat_median(
        db,
        "indira_cmots_margin_ratios",
        {"type": "S", "year": {"$gte": MIN_PERIOD, "$regex": r"-03$"}},
        ["pbidtim", "ebitm", "patm"],
    )
    median_ebitda_margin = _extract_medians(margin_grouped, "pbidtim")
    median_op_margin = _extract_medians(margin_grouped, "ebitm")
    median_pat_margin = _extract_medians(margin_grouped, "patm")
    logger.info("Trends: Margin ratios done — %d periods", len(median_ebitda_margin))

    # ══════════════════════════════════════════════════════════════
    # 6) FINANCIAL STABILITY — Debt/Equity
    # ══════════════════════════════════════════════════════════════
    logger.info("Trends: querying financial stability ratios (annual only)...")
    stab_grouped = _aggregate_flat_median(
        db,
        "indira_cmots_financial_stability_ratios",
        {"companymode": "S", "year": {"$gte": MIN_PERIOD, "$regex": r"-03$"}},
        ["TotalDebt_Equity"],
    )
    median_de = _extract_medians(stab_grouped, "TotalDebt_Equity")
    logger.info("Trends: Stability ratios done — %d periods", len(median_de))

    # ══════════════════════════════════════════════════════════════
    # 7) EFFICIENCY RATIOS — Receivable Days + FixedCapitals_Sales
    # ══════════════════════════════════════════════════════════════
    logger.info("Trends: querying efficiency ratios (annual only)...")
    eff_grouped = _aggregate_flat_median(
        db,
        "indira_cmots_efficiency_ratios",
        {"type": "S", "year": {"$gte": MIN_PERIOD, "$regex": r"-03$"}},
        ["ReceivableDays", "FixedCapitals_Sales"],
    )
    median_recv_days = _extract_medians(eff_grouped, "ReceivableDays")

    # For Mcap/NetBlock: need per-company FixedCapitals_Sales + Mcap_Sales
    # Mcap/NetBlock ≈ Mcap_Sales / FixedCapitals_Sales (inverted)
    eff_per_company_pipeline = [
        {"$match": {"type": "S", "year": {"$gte": MIN_PERIOD, "$regex": r"-03$"}}},
        {"$project": {"_id": 0, "co_code": 1, "year": 1, "FixedCapitals_Sales": 1}},
    ]
    fc_sales_map: dict[str, dict[int, float]] = defaultdict(dict)
    for doc in db["indira_cmots_efficiency_ratios"].aggregate(
        eff_per_company_pipeline, allowDiskUse=True
    ):
        period = str(doc.get("year", ""))
        cc = doc.get("co_code")
        fcs = _safe_float(doc.get("FixedCapitals_Sales"))
        if period and cc is not None and fcs is not None and fcs > 0:
            fc_sales_map[period][int(cc)] = fcs

    # Mcap/NetBlock = Mcap_Sales / FixedCapitals_Sales per company → median
    mcap_netblock: dict[str, float | None] = {}
    for period in mcap_sales_map:
        fc_data = fc_sales_map.get(period, {})
        ratios = []
        for cc, ms in mcap_sales_map[period].items():
            fcs = fc_data.get(cc)
            if fcs is not None and fcs > 0:
                ratios.append(ms / fcs)
        mcap_netblock[period] = _compute_median(ratios) if ratios else None

    logger.info("Trends: Efficiency ratios done — %d periods", len(median_recv_days))

    # ══════════════════════════════════════════════════════════════
    # 8) SHAREHOLDING PATTERN — Promoter, Institutional, Public
    # ══════════════════════════════════════════════════════════════
    logger.info("Trends: querying shareholding data (annual only)...")
    sh_grouped = _aggregate_flat_median(
        db,
        "indira_cmots_shareholding_pattern",
        {"year": {"$gte": MIN_PERIOD, "$regex": r"-03$"}},
        ["TotalPromoter_PerShares", "PPISUBTOT", "PPSUBTOT"],
    )
    median_promoter = _extract_medians(sh_grouped, "TotalPromoter_PerShares")
    median_institutional = _extract_medians(sh_grouped, "PPISUBTOT")
    median_public = _extract_medians(sh_grouped, "PPSUBTOT")
    logger.info("Trends: Shareholding done — %d periods", len(median_promoter))

    # ══════════════════════════════════════════════════════════════
    # 9) z_calculated_quarterly_ratios — CFO/EBITDA, CFO/PAT, P/CF
    # ══════════════════════════════════════════════════════════════
    logger.info("Trends: querying z_calculated_quarterly_ratios (annual only)...")
    z_grouped = _aggregate_flat_median(
        db,
        "z_calculated_quarterly_ratios",
        {"year": {"$gte": MIN_PERIOD, "$regex": r"-03$"}},
        ["CFO/EBITDA", "CFO/PAT Ratio", "Price-to-Cash Flow"],
    )
    median_cfo_ebitda = _extract_medians(z_grouped, "CFO/EBITDA")
    median_cfo_pbt = _extract_medians(z_grouped, "CFO/PAT Ratio")
    median_ev_cfo = _extract_medians(z_grouped, "Price-to-Cash Flow")
    logger.info("Trends: z_calculated done — %d periods", len(median_cfo_ebitda))

    # ══════════════════════════════════════════════════════════════
    # ASSEMBLE RESPONSE
    # ══════════════════════════════════════════════════════════════
    response = MarketOverviewTrendsResponse(
        # Section 1: Financial Trends
        companies_listed=_to_trend_points(companies_count),
        total_market_cap=_to_trend_points(total_mcap_by_period),
        total_operating_profit=_to_trend_points(op_profit_by_period),
        total_sales=_to_trend_points(sales_by_period),
        total_ebitda=_to_trend_points(ebitda_by_period),
        total_pat=_to_trend_points(pat_by_period),
        total_debt=_to_trend_points(debt_by_period),
        median_debt_to_equity=_to_trend_points(
            {k: v for k, v in median_de.items() if v is not None}
        ),
        total_net_fixed_assets=_to_trend_points(net_fixed_assets_by_period),
        # Section 2: Holdings & Returns
        median_promoter_holdings=_to_trend_points(
            {k: v for k, v in median_promoter.items() if v is not None}
        ),
        median_institutional_holdings=_to_trend_points(
            {k: v for k, v in median_institutional.items() if v is not None}
        ),
        median_public_holdings=_to_trend_points(
            {k: v for k, v in median_public.items() if v is not None}
        ),
        median_ebitda_margin=_to_trend_points(
            {k: v for k, v in median_ebitda_margin.items() if v is not None}
        ),
        median_operating_profit_margin=_to_trend_points(
            {k: v for k, v in median_op_margin.items() if v is not None}
        ),
        median_pat_margin=_to_trend_points(
            {k: v for k, v in median_pat_margin.items() if v is not None}
        ),
        median_roe=_to_trend_points(
            {k: v for k, v in median_roe.items() if v is not None}
        ),
        median_roce=_to_trend_points(
            {k: v for k, v in median_roce.items() if v is not None}
        ),
        median_roa=_to_trend_points(
            {k: v for k, v in median_roa.items() if v is not None}
        ),
        # Section 3: Cash Flow & Valuation
        median_receivable_days=_to_trend_points(
            {k: v for k, v in median_recv_days.items() if v is not None}
        ),
        median_cfo_to_ebitda=_to_trend_points(
            {k: v for k, v in median_cfo_ebitda.items() if v is not None}
        ),
        median_cfo_to_pbt=_to_trend_points(
            {k: v for k, v in median_cfo_pbt.items() if v is not None}
        ),
        median_pe=_to_trend_points(
            {k: v for k, v in median_pe.items() if v is not None}
        ),
        median_price_to_book=_to_trend_points(
            {k: v for k, v in median_pb.items() if v is not None}
        ),
        median_price_to_sales=_to_trend_points(
            {k: v for k, v in median_ps.items() if v is not None}
        ),
        median_ev_ebitda=_to_trend_points(
            {k: v for k, v in median_ev_ebitda.items() if v is not None}
        ),
        median_ev_cfo=_to_trend_points(
            {k: v for k, v in median_ev_cfo.items() if v is not None}
        ),
        median_mcap_netblock=_to_trend_points(
            {k: v for k, v in mcap_netblock.items() if v is not None}
        ),
    )

    _trends_cache = response
    _trends_cache_ts = now
    logger.info("Market overview trends cached successfully")
    return response
