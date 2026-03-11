"""
Earnings analysis service — computes quarterly earnings growth metrics
by joining P&L, company master, indices, SME, valuation, and margin data
from MongoDB.  Cached for 6 hours.

Called via asyncio.to_thread() from the API layer.
"""

import logging
import math
import statistics
import time
from collections import defaultdict
from typing import Any

from backend.database_mongo import get_mongo_db
from backend.schemas.earnings import (
    EarningsAnalysisResponse,
    EarningsCompany,
    EarningsTrendPoint,
)
from backend.services import universe_service

logger = logging.getLogger(__name__)

# ── Module-level cache ──────────────────────────────────────────────
_cache: EarningsAnalysisResponse | None = None
_cache_ts: float = 0.0
_CACHE_TTL = 6 * 60 * 60  # 6 hours

# Only keep last N quarters to limit payload size
_MAX_QUARTERS = 12


# ── Helpers ─────────────────────────────────────────────────────────

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
    return round(statistics.median(values), 2)


# Indian fiscal year: Apr–Mar.
# Y-key month → (fiscal quarter number, fiscal year offset from calendar year)
_MONTH_TO_FQ: dict[int, tuple[int, int]] = {
    3: (4, 0),   # Jan–Mar = Q4 of FY(year)
    6: (1, 1),   # Apr–Jun = Q1 of FY(year+1)
    9: (2, 1),   # Jul–Sep = Q2 of FY(year+1)
    12: (3, 1),  # Oct–Dec = Q3 of FY(year+1)
}


def _y_key_to_quarter(y_key: str) -> str | None:
    """Convert Y-key to fiscal quarter label.  Y202512 → Q3FY26."""
    if not isinstance(y_key, str) or not y_key.startswith("Y") or len(y_key) < 7:
        return None
    try:
        year = int(y_key[1:5])
        month = int(y_key[5:7])
    except ValueError:
        return None
    fq = _MONTH_TO_FQ.get(month)
    if fq is None:
        return None
    quarter_num, fy_offset = fq
    fy = (year + fy_offset) % 100
    return f"Q{quarter_num}FY{fy:02d}"


def _period_to_quarter(period: str) -> str | None:
    """Convert period 'YYYY-MM' to quarter label. '2025-12' → Q3FY26."""
    if not period or len(period) < 7:
        return None
    try:
        year = int(period[:4])
        month = int(period[5:7])
    except ValueError:
        return None
    fq = _MONTH_TO_FQ.get(month)
    if fq is None:
        return None
    quarter_num, fy_offset = fq
    fy = (year + fy_offset) % 100
    return f"Q{quarter_num}FY{fy:02d}"


def _quarter_sort_key(q: str) -> tuple[int, int]:
    """Return (fiscal_year, quarter_num) for sorting. Q3FY26 → (26, 3)."""
    try:
        qn = int(q[1])
        fy = int(q[4:6])
        return (fy, qn)
    except (IndexError, ValueError):
        return (0, 0)


def _get_yoy_previous_y_key(y_key: str) -> str | None:
    """Y202512 → Y202412 (same quarter, previous year)."""
    if len(y_key) < 7:
        return None
    try:
        year = int(y_key[1:5])
        month = y_key[5:7]
        return f"Y{year - 1}{month}"
    except ValueError:
        return None


def _get_qoq_previous_y_key(y_key: str) -> str | None:
    """Y202512 → Y202509.  Y202503 → Y202412 (wraps year)."""
    if len(y_key) < 7:
        return None
    try:
        year = int(y_key[1:5])
        month = int(y_key[5:7])
    except ValueError:
        return None
    prev_months = {3: (year - 1, 12), 6: (year, 3), 9: (year, 6), 12: (year, 9)}
    prev = prev_months.get(month)
    if prev is None:
        return None
    return f"Y{prev[0]}{prev[1]:02d}"


def _compute_growth(current: float | None, previous: float | None) -> float | None:
    """Percentage growth: (current - previous) / |previous| * 100."""
    if current is None or previous is None or previous == 0:
        return None
    return round((current - previous) / abs(previous) * 100, 2)


# ── Main function ───────────────────────────────────────────────────

def get_earnings_analysis() -> EarningsAnalysisResponse:
    """Build complete earnings analysis dataset from MongoDB."""
    global _cache, _cache_ts

    now = time.time()
    if _cache is not None and (now - _cache_ts) < _CACHE_TTL:
        logger.debug("Earnings analysis served from cache")
        return _cache

    db = get_mongo_db()

    # ══════════════════════════════════════════════════════════════
    # 1) COMPANY MASTER
    # ══════════════════════════════════════════════════════════════
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
            },
        )
    )
    logger.info("Earnings: loaded %d companies", len(company_docs))

    companies_by_code: dict[int, dict] = {}
    for doc in company_docs:
        cc = doc.get("co_code")
        if cc is not None:
            companies_by_code[int(cc)] = doc

    # ══════════════════════════════════════════════════════════════
    # 2) PROFIT & LOSS — extract ALL quarters for RIDs 8, 21, 35, 46
    # ══════════════════════════════════════════════════════════════
    pipeline = [
        {
            "$project": {
                "_id": 0,
                "co_code": 1,
                "data": {
                    "$filter": {
                        "input": "$data",
                        "as": "row",
                        "cond": {"$in": ["$$row.RID", [8, 21, 35, 46]]},
                    }
                },
            }
        }
    ]
    pl_docs = list(
        db["indira_cmots_profit_loss"].aggregate(pipeline, allowDiskUse=True)
    )
    logger.info("Earnings: loaded %d P&L docs", len(pl_docs))

    # pl_data[co_code][rid][y_key] = value
    pl_data: dict[int, dict[int, dict[str, float]]] = defaultdict(
        lambda: defaultdict(dict)
    )
    all_y_keys: set[str] = set()

    for doc in pl_docs:
        cc = doc.get("co_code")
        if cc is None:
            continue
        cc = int(cc)
        for row in doc.get("data") or []:
            rid = row.get("RID")
            if rid not in (8, 21, 35, 46):
                continue
            for key, val in row.items():
                if not isinstance(key, str) or not key.startswith("Y"):
                    continue
                if len(key) < 7:
                    continue
                # Only accept quarterly months (3, 6, 9, 12)
                try:
                    month = int(key[5:7])
                except ValueError:
                    continue
                if month not in (3, 6, 9, 12):
                    continue
                fval = _safe_float(val)
                if fval is not None:
                    pl_data[cc][rid][key] = fval
                    all_y_keys.add(key)

    logger.info("Earnings: extracted %d unique Y-keys from P&L", len(all_y_keys))

    # Determine which quarters to keep (most recent _MAX_QUARTERS)
    sorted_y_keys = sorted(all_y_keys, reverse=True)[:_MAX_QUARTERS]
    valid_y_keys = set(sorted_y_keys)
    # Also keep previous-year keys for YoY computation
    for yk in sorted_y_keys:
        prev = _get_yoy_previous_y_key(yk)
        if prev:
            valid_y_keys.add(prev)
        prev_q = _get_qoq_previous_y_key(yk)
        if prev_q:
            valid_y_keys.add(prev_q)

    # Quarter labels for the retained Y-keys
    quarter_labels: set[str] = set()
    for yk in sorted_y_keys:
        ql = _y_key_to_quarter(yk)
        if ql:
            quarter_labels.add(ql)

    available_quarters = sorted(quarter_labels, key=_quarter_sort_key, reverse=True)

    # ══════════════════════════════════════════════════════════════
    # 3) INDICES MAPPING
    # ══════════════════════════════════════════════════════════════
    index_docs = list(
        db["indices_stocks"].find({}, {"_id": 0, "indicesName": 1, "co_code": 1})
    )
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
    logger.info("Earnings: loaded %d index docs", len(index_docs))

    # ══════════════════════════════════════════════════════════════
    # 4) SME COMPANIES
    # ══════════════════════════════════════════════════════════════
    sme_codes: set[int] = set()
    for coll_name in ("sme_companies", "nse_sme_companies"):
        for doc in db[coll_name].find({}, {"_id": 0, "co_code": 1}):
            cc = doc.get("co_code")
            if cc is not None:
                try:
                    sme_codes.add(int(cc))
                except (ValueError, TypeError):
                    pass
    logger.info("Earnings: %d SME co_codes", len(sme_codes))

    # ══════════════════════════════════════════════════════════════
    # 5) VALUATION RATIOS — PE (latest only)
    # ══════════════════════════════════════════════════════════════
    val_pipeline = [
        {"$match": {"type": "S", "year": {"$regex": r"^\d{4}-\d{2}$"}}},
        {"$sort": {"year": -1}},
        {"$group": {"_id": "$co_code", "pe": {"$first": "$PE"}}},
    ]
    pe_map: dict[int, float | None] = {}
    for doc in db["indira_cmots_valuation_ratios"].aggregate(
        val_pipeline, allowDiskUse=True
    ):
        cc = doc.get("_id")
        if cc is not None:
            pe_map[int(cc)] = _safe_float(doc.get("pe"))
    logger.info("Earnings: loaded PE for %d companies", len(pe_map))

    # ══════════════════════════════════════════════════════════════
    # 6) MARGIN RATIOS — ALL periods (ebitm, patm)
    # ══════════════════════════════════════════════════════════════
    margin_pipeline = [
        {"$match": {"type": "S"}},
        {
            "$project": {
                "_id": 0,
                "co_code": 1,
                "year": 1,
                "ebitm": 1,
                "patm": 1,
            }
        },
    ]
    # margins[co_code][quarter] = {ebitm, patm}
    margins: dict[int, dict[str, dict[str, float | None]]] = defaultdict(dict)
    for doc in db["indira_cmots_margin_ratios"].aggregate(
        margin_pipeline, allowDiskUse=True
    ):
        cc = doc.get("co_code")
        period = doc.get("year")
        if cc is None or not period:
            continue
        q = _period_to_quarter(str(period))
        if q is None:
            continue
        margins[int(cc)][q] = {
            "ebitm": _safe_float(doc.get("ebitm")),
            "patm": _safe_float(doc.get("patm")),
        }
    logger.info("Earnings: loaded margin ratios for %d companies", len(margins))

    # ══════════════════════════════════════════════════════════════
    # 7) COMPUTE GROWTH & ASSEMBLE COMPANIES
    # ══════════════════════════════════════════════════════════════
    companies: list[EarningsCompany] = []
    industries_set: set[str] = set()
    indices_set: set[str] = set()
    mcap_types_set: set[str] = set()

    # For trend computation: quarter → list of growth values
    trend_sales: dict[str, list[float]] = defaultdict(list)
    trend_op: dict[str, list[float]] = defaultdict(list)
    trend_pat: dict[str, list[float]] = defaultdict(list)
    trend_eps: dict[str, list[float]] = defaultdict(list)

    universe_co_codes = universe_service.get_universe_co_codes()

    for cc, doc in companies_by_code.items():
        # Filter: only companies in universe
        if cc not in universe_co_codes:
            continue

        company_pl = pl_data.get(cc, {})
        # Include companies even without P&L data (empty dicts)

        sales_raw = company_pl.get(8, {})
        dep_raw = company_pl.get(21, {})
        pat_raw = company_pl.get(35, {})
        ebitda_raw = company_pl.get(46, {})

        # Build per-quarter values
        sales_by_q: dict[str, float | None] = {}
        op_by_q: dict[str, float | None] = {}
        pat_by_q: dict[str, float | None] = {}
        ebitda_by_q: dict[str, float | None] = {}
        dep_by_q: dict[str, float | None] = {}

        # Growth dicts
        sg_yoy: dict[str, float | None] = {}
        sg_qoq: dict[str, float | None] = {}
        og_yoy: dict[str, float | None] = {}
        og_qoq: dict[str, float | None] = {}
        pg_yoy: dict[str, float | None] = {}
        pg_qoq: dict[str, float | None] = {}
        eg_yoy: dict[str, float | None] = {}
        eg_qoq: dict[str, float | None] = {}

        # Margin dicts
        opm_by_q: dict[str, float | None] = {}
        patm_by_q: dict[str, float | None] = {}
        opm_g_yoy: dict[str, float | None] = {}
        patm_g_yoy: dict[str, float | None] = {}

        for yk in sorted_y_keys:
            q = _y_key_to_quarter(yk)
            if q is None:
                continue

            s = sales_raw.get(yk)
            d = dep_raw.get(yk)
            p = pat_raw.get(yk)
            e = ebitda_raw.get(yk)
            op = None
            if e is not None:
                op = e - (d or 0)

            sales_by_q[q] = s
            dep_by_q[q] = d
            pat_by_q[q] = p
            ebitda_by_q[q] = e
            op_by_q[q] = op

            # YoY growth
            yoy_prev = _get_yoy_previous_y_key(yk)
            if yoy_prev:
                sg_yoy[q] = _compute_growth(s, sales_raw.get(yoy_prev))
                prev_e = ebitda_raw.get(yoy_prev)
                prev_d = dep_raw.get(yoy_prev)
                prev_op = None
                if prev_e is not None:
                    prev_op = prev_e - (prev_d or 0)
                og_yoy[q] = _compute_growth(op, prev_op)
                pg_yoy[q] = _compute_growth(p, pat_raw.get(yoy_prev))
                # EPS growth ≈ PAT growth (proportional when shares constant)
                eg_yoy[q] = pg_yoy[q]

            # QoQ growth
            qoq_prev = _get_qoq_previous_y_key(yk)
            if qoq_prev:
                sg_qoq[q] = _compute_growth(s, sales_raw.get(qoq_prev))
                prev_e = ebitda_raw.get(qoq_prev)
                prev_d = dep_raw.get(qoq_prev)
                prev_op = None
                if prev_e is not None:
                    prev_op = prev_e - (prev_d or 0)
                og_qoq[q] = _compute_growth(op, prev_op)
                pg_qoq[q] = _compute_growth(p, pat_raw.get(qoq_prev))
                eg_qoq[q] = pg_qoq[q]

            # Collect for trends (YoY only)
            if sg_yoy.get(q) is not None:
                trend_sales[q].append(sg_yoy[q])  # type: ignore[arg-type]
            if og_yoy.get(q) is not None:
                trend_op[q].append(og_yoy[q])  # type: ignore[arg-type]
            if pg_yoy.get(q) is not None:
                trend_pat[q].append(pg_yoy[q])  # type: ignore[arg-type]
            if eg_yoy.get(q) is not None:
                trend_eps[q].append(eg_yoy[q])  # type: ignore[arg-type]

        # Margins
        company_margins = margins.get(cc, {})
        for q in available_quarters:
            m = company_margins.get(q)
            if m:
                opm_by_q[q] = m.get("ebitm")
                patm_by_q[q] = m.get("patm")

        # Margin growth YoY: difference in margin percentage points
        margin_quarters_sorted = sorted(
            [q for q in available_quarters if q in company_margins],
            key=_quarter_sort_key,
        )
        for q in margin_quarters_sorted:
            qn = int(q[1])
            fy = int(q[4:6])
            prev_fy = fy - 1
            prev_q_label = f"Q{qn}FY{prev_fy:02d}"
            curr_m = company_margins.get(q, {})
            prev_m = company_margins.get(prev_q_label, {})
            curr_opm = _safe_float(curr_m.get("ebitm"))
            prev_opm = _safe_float(prev_m.get("ebitm"))
            curr_patm = _safe_float(curr_m.get("patm"))
            prev_patm = _safe_float(prev_m.get("patm"))
            if curr_opm is not None and prev_opm is not None:
                opm_g_yoy[q] = round(curr_opm - prev_opm, 2)
            if curr_patm is not None and prev_patm is not None:
                patm_g_yoy[q] = round(curr_patm - prev_patm, 2)

        # PEG ratio
        pe = pe_map.get(cc)
        peg = None
        if pe is not None and available_quarters:
            latest_eps_g = eg_yoy.get(available_quarters[0])
            if latest_eps_g is not None and latest_eps_g > 0:
                peg = round(pe / latest_eps_g, 2)

        # Sector/industry from universe Excel (ACE classifications)
        uni = universe_service.get_by_co_code(cc)
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

        mcap_type = uni.get("mcaptype") if uni else (doc.get("mcaptype") or None)
        nifty_idx = co_code_to_indices.get(cc, [])

        if industry:
            industries_set.add(industry)
        if mcap_type:
            mcap_types_set.add(mcap_type)
        for idx in nifty_idx:
            if idx:
                indices_set.add(idx)

        bse_raw = doc.get("bsecode")
        bse_code = str(bse_raw) if bse_raw else None

        companies.append(
            EarningsCompany(
                co_code=cc,
                company_name=doc.get("companyname", ""),
                nse_symbol=doc.get("nsesymbol") or None,
                bse_code=bse_code,
                sector=sector,
                industry=industry,
                mcap=_safe_float(doc.get("mcap")),
                mcap_type=mcap_type,
                exchange=exchange,
                is_sme=(cc in sme_codes),
                nifty_indices=nifty_idx,
                sales=sales_by_q,
                operating_profit=op_by_q,
                pat=pat_by_q,
                ebitda=ebitda_by_q,
                depreciation=dep_by_q,
                sales_growth_yoy=sg_yoy,
                sales_growth_qoq=sg_qoq,
                op_growth_yoy=og_yoy,
                op_growth_qoq=og_qoq,
                pat_growth_yoy=pg_yoy,
                pat_growth_qoq=pg_qoq,
                eps_growth_yoy=eg_yoy,
                eps_growth_qoq=eg_qoq,
                operating_profit_margin=opm_by_q,
                pat_margin=patm_by_q,
                op_margin_growth_yoy=opm_g_yoy,
                pat_margin_growth_yoy=patm_g_yoy,
                pe=pe,
                peg_ratio=peg,
            )
        )

    # ══════════════════════════════════════════════════════════════
    # 7b) ADD UNIVERSE COMPANIES NOT IN MONGODB COMPANY MASTER
    # ══════════════════════════════════════════════════════════════
    seen_co_codes = {c.co_code for c in companies}
    all_universe = universe_service.get_all()
    for comp in all_universe:
        cc_raw = comp.get("co_code")
        if cc_raw is None:
            continue
        cc = int(cc_raw)
        if cc in seen_co_codes:
            continue

        sector = comp.get("ace_sector")
        industry = comp.get("ace_industry")
        nse_flag = comp.get("nse_listed_flag")
        bse_flag = comp.get("bse_listed_flag")
        if nse_flag == "Y" and bse_flag == "Y":
            exchange = "Both"
        elif nse_flag == "Y":
            exchange = "NSE"
        else:
            exchange = "BSE"

        mcap_type = comp.get("mcaptype")
        nifty_idx = co_code_to_indices.get(cc, [])

        if industry:
            industries_set.add(industry)
        if mcap_type:
            mcap_types_set.add(mcap_type)
        for idx in nifty_idx:
            if idx:
                indices_set.add(idx)

        companies.append(
            EarningsCompany(
                co_code=cc,
                company_name=comp.get("company_name", ""),
                nse_symbol=comp.get("nse_symbol") or None,
                bse_code=comp.get("bse_symbol") or None,
                sector=sector,
                industry=industry,
                mcap=_safe_float(comp.get("mcap")),
                mcap_type=mcap_type,
                exchange=exchange,
                is_sme=(cc in sme_codes),
                nifty_indices=nifty_idx,
                pe=pe_map.get(cc),
            )
        )

    logger.info("Earnings: total companies after universe merge: %d", len(companies))

    # ══════════════════════════════════════════════════════════════
    # 8) RESULTS PER QUARTER — count companies with data per quarter
    # ══════════════════════════════════════════════════════════════
    results_per_quarter: dict[str, int] = {}
    for q in available_quarters:
        count = sum(
            1 for c in companies
            if c.sales.get(q) is not None or c.pat.get(q) is not None
        )
        results_per_quarter[q] = count

    # Sort: quarters with significant data (>50 results) first sorted by recency,
    # then sparse quarters sorted by recency
    available_quarters = sorted(
        available_quarters,
        key=lambda q: (
            0 if results_per_quarter.get(q, 0) > 50 else 1,  # significant first
            (-_quarter_sort_key(q)[0], -_quarter_sort_key(q)[1]),  # then most recent
        ),
    )

    logger.info(
        "Earnings: results per quarter: %s",
        {q: results_per_quarter[q] for q in available_quarters[:5]},
    )

    # ══════════════════════════════════════════════════════════════
    # 9) BUILD TREND DATA
    # ══════════════════════════════════════════════════════════════
    trends: list[EarningsTrendPoint] = []
    # Use last 8 quarters sorted chronologically
    trend_quarters = sorted(quarter_labels, key=_quarter_sort_key)[-8:]
    for q in trend_quarters:
        trends.append(
            EarningsTrendPoint(
                quarter=q,
                median_sales_growth=_compute_median(trend_sales.get(q, [])),
                median_op_growth=_compute_median(trend_op.get(q, [])),
                median_pat_growth=_compute_median(trend_pat.get(q, [])),
                median_eps_growth=_compute_median(trend_eps.get(q, [])),
            )
        )

    # ══════════════════════════════════════════════════════════════
    # 10) ASSEMBLE RESPONSE
    # ══════════════════════════════════════════════════════════════
    response = EarningsAnalysisResponse(
        total_companies=len(companies),
        companies=companies,
        available_quarters=available_quarters,
        results_per_quarter=results_per_quarter,
        trends=trends,
        distinct_industries=sorted(industries_set),
        distinct_indices=sorted(indices_set),
        distinct_mcap_types=sorted(mcap_types_set),
    )

    _cache = response
    _cache_ts = now
    logger.info(
        "Earnings analysis cached: %d companies, %d quarters, %d trends",
        len(companies),
        len(available_quarters),
        len(trends),
    )
    return response
