"""
Mutual Fund Holdings service — queries MongoDB mfHolding collection.

All pymongo calls are synchronous; wrap with asyncio.to_thread() at the API layer.
"""

import logging
import time
from collections import defaultdict

from backend.database_mongo import get_mongo_db
from backend.schemas.mutual_fund import (
    MFAssetAllocationItem,
    MFAssetAllocationResponse,
    MFBuySellResponse,
    MFBuySellTrendPoint,
    MFFiltersResponse,
    MFHoldingRow,
    MFHoldingsResponse,
    MFHoldingSummary,
    MFInsightsResponse,
    MFNetValueItem,
    MFPopularStock,
)
from backend.services import company_master_service

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level caches
# ---------------------------------------------------------------------------
_CACHE_TTL = 6 * 60 * 60  # 6 hours

_months_cache: list[str] | None = None
_months_cache_ts: float = 0.0

_holdings_cache: dict[str, MFHoldingsResponse] = {}
_holdings_cache_ts: dict[str, float] = {}

_buy_sell_cache: dict[str, MFBuySellResponse] = {}
_buy_sell_cache_ts: dict[str, float] = {}

_insights_cache: dict[str, MFInsightsResponse] = {}
_insights_cache_ts: dict[str, float] = {}

_asset_alloc_cache: dict[str, MFAssetAllocationResponse] = {}
_asset_alloc_cache_ts: dict[str, float] = {}

_filters_cache: dict[str, MFFiltersResponse] = {}
_filters_cache_ts: dict[str, float] = {}

# ---------------------------------------------------------------------------
# Category → HoldingType mapping
# ---------------------------------------------------------------------------
_EQUITY_CATEGORIES = {
    "Large Cap Fund", "Large & Mid Cap Fund", "Mid Cap Fund", "Small Cap Fund",
    "Multi Cap Fund", "Flexi Cap Fund", "ELSS", "Focused Fund", "Contra Fund",
    "Dividend Yield Fund", "Value Fund", "Sectoral/Thematic",
    "Equity Savings", "Index Fund", "ETFs Fund",
}

_DEBT_CATEGORIES = {
    "Corporate Bond Fund", "Credit Risk Fund", "Dynamic Bond", "Gilt Fund",
    "Gilt Fund with 10 year Constant duration", "Banking and PSU Fund",
    "Liquid Fund", "Money Market Fund", "Overnight Fund",
    "Ultra Short Duration Fund", "Short Duration Fund", "Medium Duration Fund",
    "Medium to Long Duration Fund", "Long Duration Fund", "Low Duration Fund",
    "Floater Fund", "Fixed Maturity Plans",
}

_CASH_CATEGORIES = {
    "Liquid Fund", "Overnight Fund", "Money Market Fund",
}


def _classify_category(category: str | None) -> str:
    """Map scheme category to holding type."""
    if not category:
        return "Misc"
    if category in _CASH_CATEGORIES:
        return "Cash"
    if category in _DEBT_CATEGORIES:
        return "Debt"
    if category in _EQUITY_CATEGORIES:
        return "Equity"
    return "Misc"


def _is_cache_valid(ts: float) -> bool:
    return (time.time() - ts) < _CACHE_TTL


# ---------------------------------------------------------------------------
# Available months
# ---------------------------------------------------------------------------
def get_available_months() -> list[str]:
    """Return distinct month-end InvDates (exclude 15th), sorted desc."""
    global _months_cache, _months_cache_ts

    if _months_cache is not None and _is_cache_valid(_months_cache_ts):
        return _months_cache

    db = get_mongo_db()
    coll = db["mfHolding"]

    # Get distinct InvDate values
    all_dates: list[str] = coll.distinct("InvDate")

    # Filter to month-end only (not 15th) and sort descending
    month_ends = sorted(
        [d for d in all_dates if d and "15T" not in d],
        reverse=True,
    )

    _months_cache = month_ends
    _months_cache_ts = time.time()
    logger.info("Loaded %d available month-end dates", len(month_ends))
    return month_ends


def _get_prev_month(month: str) -> str | None:
    """Get the previous month-end date for a given month."""
    months = get_available_months()
    try:
        idx = months.index(month)
        if idx + 1 < len(months):
            return months[idx + 1]
    except ValueError:
        pass
    return None


def _load_month_data(month: str) -> dict[tuple[int, int], dict]:
    """Load all mfHolding docs for a month, keyed by (Mf_SchCode, co_code)."""
    db = get_mongo_db()
    coll = db["mfHolding"]

    docs = coll.find(
        {"InvDate": month},
        {"_id": 0, "Mf_SchCode": 1, "co_code": 1, "sch_Name": 1,
         "Co_Name": 1, "Perc_Hold": 1, "no_shares": 1, "MktValue": 1},
    )

    result: dict[tuple[int, int], dict] = {}
    for doc in docs:
        key = (int(doc.get("Mf_SchCode", 0)), int(doc.get("co_code", 0)))
        result[key] = doc
    return result


# ---------------------------------------------------------------------------
# Holdings with ChangeType
# ---------------------------------------------------------------------------
def get_holdings(month: str) -> MFHoldingsResponse:
    """Compute holdings with ChangeType by comparing current and previous month."""
    if month in _holdings_cache and _is_cache_valid(_holdings_cache_ts.get(month, 0)):
        return _holdings_cache[month]

    prev_month = _get_prev_month(month)
    current_data = _load_month_data(month)
    prev_data = _load_month_data(prev_month) if prev_month else {}

    rows: list[MFHoldingRow] = []
    new_entries = 0
    modified = 0
    unchanged = 0
    removed = 0
    fund_codes: set[int] = set()

    # Process current month entries
    for key, doc in current_data.items():
        mf_schcode, co_code = key
        fund_codes.add(mf_schcode)

        fund_name = doc.get("sch_Name", "")
        stock_name = doc.get("Co_Name", "")
        perc_aum = float(doc.get("Perc_Hold", 0) or 0)
        share_count = int(doc.get("no_shares", 0) or 0)
        mkt_value = float(doc.get("MktValue", 0) or 0)

        if key in prev_data:
            prev_doc = prev_data[key]
            perc_aum_prev = float(prev_doc.get("Perc_Hold", 0) or 0)
            share_count_prev = int(prev_doc.get("no_shares", 0) or 0)
            mkt_value_prev = float(prev_doc.get("MktValue", 0) or 0)

            if share_count != share_count_prev or abs(perc_aum - perc_aum_prev) > 0.001:
                change_type = "Modified"
                modified += 1
            else:
                change_type = "Unchanged"
                unchanged += 1
        else:
            change_type = "New Entry"
            new_entries += 1
            perc_aum_prev = 0.0
            share_count_prev = 0
            mkt_value_prev = 0.0

        rows.append(MFHoldingRow(
            change_type=change_type,
            fund_name=fund_name,
            stock_name=stock_name,
            mf_schcode=mf_schcode,
            co_code=co_code,
            perc_aum=round(perc_aum, 5),
            perc_aum_prev=round(perc_aum_prev, 5),
            share_count=share_count,
            share_count_prev=share_count_prev,
            mkt_value=round(mkt_value, 4),
            mkt_value_prev=round(mkt_value_prev, 4),
        ))

    # Process removed entries (in previous but not in current)
    for key, doc in prev_data.items():
        if key not in current_data:
            mf_schcode, co_code = key
            fund_codes.add(mf_schcode)
            removed += 1

            rows.append(MFHoldingRow(
                change_type="Removed",
                fund_name=doc.get("sch_Name", ""),
                stock_name=doc.get("Co_Name", ""),
                mf_schcode=mf_schcode,
                co_code=co_code,
                perc_aum=0.0,
                perc_aum_prev=round(float(doc.get("Perc_Hold", 0) or 0), 5),
                share_count=0,
                share_count_prev=int(doc.get("no_shares", 0) or 0),
                mkt_value=0.0,
                mkt_value_prev=round(float(doc.get("MktValue", 0) or 0), 4),
            ))

    response = MFHoldingsResponse(
        month=month,
        prev_month=prev_month or "",
        summary=MFHoldingSummary(
            new_entries=new_entries,
            modified=modified,
            unchanged=unchanged,
            removed=removed,
            total_funds=len(fund_codes),
        ),
        rows=rows,
    )

    _holdings_cache[month] = response
    _holdings_cache_ts[month] = time.time()
    logger.info(
        "Holdings for %s: %d rows (new=%d, mod=%d, unch=%d, rem=%d, funds=%d)",
        month, len(rows), new_entries, modified, unchanged, removed, len(fund_codes),
    )
    return response


# ---------------------------------------------------------------------------
# Buy / Sell dashboard
# ---------------------------------------------------------------------------
def get_buy_sell(start_date: str | None = None, end_date: str | None = None) -> MFBuySellResponse:
    """Compute buy/sell values across months by comparing MktValue changes."""
    cache_key = f"{start_date or 'all'}_{end_date or 'all'}"
    if cache_key in _buy_sell_cache and _is_cache_valid(_buy_sell_cache_ts.get(cache_key, 0)):
        return _buy_sell_cache[cache_key]

    months = get_available_months()  # desc order

    # Filter by date range
    if start_date:
        months = [m for m in months if m >= start_date]
    if end_date:
        months = [m for m in months if m <= end_date]

    months = sorted(months)  # asc for trend

    if len(months) < 2:
        empty = MFBuySellResponse(
            total_buy=0, total_sell=0, trend=[], by_stock=[], by_sector=[],
        )
        return empty

    # Build co_code → sector map
    db = get_mongo_db()
    sector_map = _get_sector_map(db)

    total_buy = 0.0
    total_sell = 0.0
    trend: list[MFBuySellTrendPoint] = []
    stock_net: dict[str, float] = defaultdict(float)  # Co_Name → net
    sector_net: dict[str, float] = defaultdict(float)  # sector → net

    prev_data: dict[tuple[int, int], dict] | None = None

    for month in months:
        current_data = _load_month_data(month)

        if prev_data is not None:
            month_buy = 0.0
            month_sell = 0.0

            # Changed / continuing holdings
            for key, doc in current_data.items():
                mkt = float(doc.get("MktValue", 0) or 0)
                stock_name = doc.get("Co_Name", "")
                co_code = key[1]
                sector = sector_map.get(co_code, "Others")

                if key in prev_data:
                    prev_mkt = float(prev_data[key].get("MktValue", 0) or 0)
                    delta = mkt - prev_mkt
                else:
                    # New holding
                    delta = mkt

                if delta > 0:
                    month_buy += delta
                    stock_net[stock_name] += delta
                    sector_net[sector] += delta
                elif delta < 0:
                    month_sell += abs(delta)
                    stock_net[stock_name] += delta
                    sector_net[sector] += delta

            # Removed holdings
            for key, doc in prev_data.items():
                if key not in current_data:
                    prev_mkt = float(doc.get("MktValue", 0) or 0)
                    stock_name = doc.get("Co_Name", "")
                    co_code = key[1]
                    sector = sector_map.get(co_code, "Others")
                    month_sell += prev_mkt
                    stock_net[stock_name] -= prev_mkt
                    sector_net[sector] -= prev_mkt

            total_buy += month_buy
            total_sell += month_sell
            trend.append(MFBuySellTrendPoint(
                month=month[:10],
                buy_value=round(month_buy, 2),
                sell_value=round(-month_sell, 2),
            ))

        prev_data = current_data

    # Sort by absolute net value, top 30
    by_stock = sorted(
        [MFNetValueItem(name=k, net_value=round(v, 2)) for k, v in stock_net.items()],
        key=lambda x: abs(x.net_value),
        reverse=True,
    )[:30]

    by_sector = sorted(
        [MFNetValueItem(name=k, net_value=round(v, 2)) for k, v in sector_net.items()],
        key=lambda x: abs(x.net_value),
        reverse=True,
    )

    response = MFBuySellResponse(
        total_buy=round(total_buy, 2),
        total_sell=round(-total_sell, 2),
        trend=trend,
        by_stock=by_stock,
        by_sector=by_sector,
    )

    _buy_sell_cache[cache_key] = response
    _buy_sell_cache_ts[cache_key] = time.time()
    logger.info("Buy/sell computed: buy=%.2f, sell=%.2f, %d trend points", total_buy, total_sell, len(trend))
    return response


# ---------------------------------------------------------------------------
# Insights — most/least popular stocks
# ---------------------------------------------------------------------------
def get_insights(month: str) -> MFInsightsResponse:
    """Count how many funds added (New Entry) or removed each stock."""
    if month in _insights_cache and _is_cache_valid(_insights_cache_ts.get(month, 0)):
        return _insights_cache[month]

    holdings = get_holdings(month)

    added_count: dict[str, int] = defaultdict(int)
    removed_count: dict[str, int] = defaultdict(int)

    for row in holdings.rows:
        if row.change_type == "New Entry":
            added_count[row.stock_name] += 1
        elif row.change_type == "Removed":
            removed_count[row.stock_name] += 1

    most_popular = sorted(
        [MFPopularStock(name=k, count=v) for k, v in added_count.items()],
        key=lambda x: x.count,
        reverse=True,
    )[:30]

    least_popular = sorted(
        [MFPopularStock(name=k, count=v) for k, v in removed_count.items()],
        key=lambda x: x.count,
        reverse=True,
    )[:30]

    response = MFInsightsResponse(
        month=month,
        most_popular=most_popular,
        least_popular=least_popular,
    )

    _insights_cache[month] = response
    _insights_cache_ts[month] = time.time()
    return response


# ---------------------------------------------------------------------------
# Asset Allocation
# ---------------------------------------------------------------------------
def get_asset_allocation(month: str) -> MFAssetAllocationResponse:
    """Per-fund asset allocation based on scheme category classification."""
    if month in _asset_alloc_cache and _is_cache_valid(_asset_alloc_cache_ts.get(month, 0)):
        return _asset_alloc_cache[month]

    db = get_mongo_db()

    # Build scheme → category map
    scheme_category: dict[int, str] = {}
    for doc in db["indira_cmots_scheme_master"].find({}, {"mf_schcode": 1, "Category": 1, "_id": 0}):
        sc = doc.get("mf_schcode")
        cat = doc.get("Category", "")
        if sc:
            scheme_category[int(sc)] = cat or ""

    # Build scheme → group name map (for display name)
    scheme_group: dict[int, str] = {}
    for doc in db["indira_cmots_scheme_master"].find({}, {"mf_schcode": 1, "groupname": 1, "_id": 0}):
        sc = doc.get("mf_schcode")
        gn = doc.get("groupname", "")
        if sc:
            scheme_group[int(sc)] = gn or ""

    # Load holdings for the month
    coll = db["mfHolding"]
    docs = coll.find(
        {"InvDate": month},
        {"_id": 0, "Mf_SchCode": 1, "sch_Name": 1, "MktValue": 1},
    )

    # Aggregate MktValue by (Mf_SchCode, holding_type)
    fund_type_value: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    fund_names: dict[int, str] = {}

    for doc in docs:
        sc = int(doc.get("Mf_SchCode", 0))
        mkt = float(doc.get("MktValue", 0) or 0)
        category = scheme_category.get(sc, "")
        holding_type = _classify_category(category)

        fund_type_value[sc][holding_type] += mkt
        if sc not in fund_names:
            fund_names[sc] = scheme_group.get(sc, doc.get("sch_Name", f"Scheme {sc}"))

    # Convert to percentages
    items: list[MFAssetAllocationItem] = []
    for sc, type_values in fund_type_value.items():
        total = sum(type_values.values())
        if total <= 0:
            continue

        items.append(MFAssetAllocationItem(
            fund_name=fund_names.get(sc, f"Scheme {sc}"),
            equity=round(type_values.get("Equity", 0) / total * 100, 2),
            debt=round(type_values.get("Debt", 0) / total * 100, 2),
            cash=round(type_values.get("Cash", 0) / total * 100, 2),
            misc=round(type_values.get("Misc", 0) / total * 100, 2),
        ))

    items.sort(key=lambda x: x.fund_name)

    response = MFAssetAllocationResponse(month=month, items=items)

    _asset_alloc_cache[month] = response
    _asset_alloc_cache_ts[month] = time.time()
    logger.info("Asset allocation for %s: %d funds", month, len(items))
    return response


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------
def get_filters(month: str) -> MFFiltersResponse:
    """Get available filter values for a given month."""
    if month in _filters_cache and _is_cache_valid(_filters_cache_ts.get(month, 0)):
        return _filters_cache[month]

    db = get_mongo_db()
    coll = db["mfHolding"]

    available_months = get_available_months()

    fund_names = sorted(coll.distinct("sch_Name", {"InvDate": month}))
    stock_names = sorted(coll.distinct("Co_Name", {"InvDate": month}))

    # Get distinct categories from scheme_master
    categories = sorted([
        c for c in db["indira_cmots_scheme_master"].distinct("Category")
        if c and isinstance(c, str)
    ])

    response = MFFiltersResponse(
        available_months=available_months,
        fund_names=fund_names,
        stock_names=stock_names,
        categories=categories,
    )

    _filters_cache[month] = response
    _filters_cache_ts[month] = time.time()
    return response


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _get_sector_map(db) -> dict[int, str]:
    """Build co_code → sector map from company master (Excel-aware)."""
    result: dict[int, str] = {}
    for doc in db["indira_cmots_company_master"].find(
        {},
        {"co_code": 1, "sectorname": 1, "nsesymbol": 1, "bsecode": 1, "_id": 0},
    ):
        cc = doc.get("co_code")
        if not cc:
            continue
        # Override sector from Excel (try NSE symbol, then BSE code)
        nse_sym = (doc.get("nsesymbol") or "").strip().upper()
        bse_raw = doc.get("bsecode")
        bse_str = str(bse_raw).split(".")[0] if bse_raw else None
        excel_info = company_master_service.get_sector_industry(nse_sym or None, bse_str)
        if not excel_info:
            continue  # Skip companies not in Excel
        sn = excel_info[0]
        if sn:
            result[int(cc)] = sn
    return result
