"""
Fundamental Timeseries Service — fetch per-company fundamental metric
time series from MongoDB collections.

Maps NSE symbol → co_code via indira_cmots_company_master, then queries
the appropriate collection (RID-based or flat) for each requested metric.

Dates returned as last day of the quarter/year (e.g. "2025-03-31").

Cached per (co_code, metric_key, period) with 1-hour TTL.
"""

import calendar
import logging
import math
import re
import time
from typing import Any

from backend.database_mongo import get_mongo_db
from backend.schemas.fundamental_timeseries import (
    FundamentalCatalogResponse,
    FundamentalDataPoint,
    FundamentalMetricInfo,
    FundamentalTimeseriesResponse,
)

logger = logging.getLogger(__name__)

# ── Cache ──────────────────────────────────────────────────────────
_ts_cache: dict[tuple[int, str, str], tuple[float, list[dict]]] = {}
_CACHE_TTL = 60 * 60  # 1 hour

_co_code_cache: dict[str, int] = {}  # nsesymbol → co_code

_YEAR_MONTH_RE = re.compile(r"^\d{4}-\d{2}$")


# ── Metric Catalog ─────────────────────────────────────────────────
# key: unique metric identifier
# label: display name
# tab: income_statement | balance_sheet | cash_flow | statistics
# collection: MongoDB collection name
# type: "rid" (nested RID in data array) or "flat" (top-level field)
# For rid: "rid" = integer RID number
# For flat: "field" = MongoDB field name, "filter_key"/"filter_value" = query filter

def _pl(key: str, label: str, rid: int, unit: str = "cr", chart_type: str = "bar") -> dict:
    return {"key": key, "label": label, "tab": "income_statement", "collection": "indira_cmots_profit_loss", "type": "rid", "rid": rid, "unit": unit, "chart_type": chart_type}

def _bs(key: str, label: str, rid: int, unit: str = "cr", chart_type: str = "bar") -> dict:
    return {"key": key, "label": label, "tab": "balance_sheet", "collection": "indira_cmots_balance_sheet", "type": "rid", "rid": rid, "unit": unit, "chart_type": chart_type}

def _cf(key: str, label: str, field: str, unit: str = "ratio", chart_type: str = "line") -> dict:
    return {"key": key, "label": label, "tab": "cash_flow", "collection": "z_calculated_quarterly_ratios", "type": "flat", "field": field, "filter_key": "companymode", "filter_value": "S", "unit": unit, "chart_type": chart_type}

def _val(key: str, label: str, field: str, unit: str = "ratio") -> dict:
    return {"key": key, "label": label, "tab": "statistics", "collection": "indira_cmots_valuation_ratios", "type": "flat", "field": field, "filter_key": "type", "filter_value": "S", "unit": unit, "chart_type": "line"}

def _ret(key: str, label: str, field: str) -> dict:
    return {"key": key, "label": label, "tab": "statistics", "collection": "indira_cmots_return_ratios", "type": "flat", "field": field, "filter_key": "type", "filter_value": "S", "unit": "pct", "chart_type": "line"}

def _mgn(key: str, label: str, field: str) -> dict:
    return {"key": key, "label": label, "tab": "statistics", "collection": "indira_cmots_margin_ratios", "type": "flat", "field": field, "filter_key": "type", "filter_value": "S", "unit": "pct", "chart_type": "line"}

def _stab(key: str, label: str, field: str, unit: str = "ratio") -> dict:
    return {"key": key, "label": label, "tab": "statistics", "collection": "indira_cmots_financial_stability_ratios", "type": "flat", "field": field, "filter_key": "companymode", "filter_value": "S", "unit": unit, "chart_type": "line"}

def _eff(key: str, label: str, field: str, unit: str = "days") -> dict:
    return {"key": key, "label": label, "tab": "statistics", "collection": "indira_cmots_efficiency_ratios", "type": "flat", "field": field, "filter_key": "type", "filter_value": "S", "unit": unit, "chart_type": "line"}


_METRIC_CATALOG: list[dict[str, Any]] = [
    # ═══════════════════════════════════════════════════════════════
    # INCOME STATEMENT  (indira_cmots_profit_loss — RID-based)
    # ═══════════════════════════════════════════════════════════════
    _pl("revenue_ops",        "Revenue From Operations",                 1),
    _pl("sale_of_products",   "Sale of Products",                        2),
    _pl("sale_of_services",   "Sale of Services",                        3),
    _pl("other_operating_rev","Other Operating Revenue",                  6),
    _pl("revenue",            "Revenue From Operations - Net",           8),
    _pl("other_income",       "Other Income",                            9),
    _pl("total_revenue",      "Total Revenue",                           10),
    _pl("changes_inventory",  "Changes in Inventories",                  11),
    _pl("cost_materials",     "Cost of Material Consumed",               12),
    _pl("purchases_stock",    "Purchases of Stock-in-Trade",             14),
    _pl("employee_benefits",  "Employee Benefits",                       15),
    _pl("total_other_exp",    "Total Other Expenses",                    16),
    _pl("mfg_operating_exp",  "Manufacturing / Operating Expenses",      17),
    _pl("admin_selling_exp",  "Administrative and Selling Expenses",     18),
    _pl("other_expenses",     "Other Expenses",                          19),
    _pl("finance_costs",      "Finance Costs",                           20),
    _pl("depreciation",       "Depreciation and Amortization",           21),
    _pl("total_expenses",     "Total Expenses",                          22),
    _pl("pbit",               "Profit Before Exceptional Items & Tax",   23),
    _pl("exceptional_items",  "Exceptional Items Before Tax",            24),
    _pl("pbt",                "Profit Before Tax",                       28),
    _pl("taxation",           "Taxation",                                29),
    _pl("current_tax",        "Current Tax",                             30),
    _pl("deferred_tax",       "Deferred Tax",                            32),
    _pl("pat",                "Profit After Tax",                        35),
    _pl("profit_to_shareholders","Profit Attributable to Shareholders",  40),
    _pl("profit_to_equity",   "Profit Attributable to Equity Holders",   43),
    _pl("eps_basic",          "EPS - Basic",                             44, "ratio", "line"),
    _pl("eps_diluted",        "EPS - Diluted",                           45, "ratio", "line"),
    _pl("ebitda",             "EBITDA",                                  46),
    _pl("operating_profit",   "Operating Profit after Depreciation",     47),
    _pl("dps",                "Dividend Per Share",                      48, "ratio", "line"),

    # ═══════════════════════════════════════════════════════════════
    # BALANCE SHEET  (indira_cmots_balance_sheet — RID-based)
    # ═══════════════════════════════════════════════════════════════
    _bs("fixed_assets",       "Fixed Assets",                            1),
    _bs("ppe",                "Property, Plant & Equipment",             2),
    _bs("rou_assets",         "Right-of-Use Assets",                     3),
    _bs("intangible_assets",  "Intangible Assets",                       4),
    _bs("intangible_dev",     "Intangible Assets under Development",     5),
    _bs("cwip",               "Capital Work in Progress",                6),
    _bs("noncurr_investments","Non-current Investments",                  7),
    _bs("invest_property",    "Investment Properties",                    8),
    _bs("invest_subs_assoc",  "Investments in Subs, Assoc & JV",         9),
    _bs("lt_loans_advances",  "Long-term Loans and Advances",            12),
    _bs("other_noncurr_assets","Other Non-Current Assets",               13),
    _bs("deferred_tax_assets","Deferred Tax Assets",                      21),
    _bs("total_noncurr_assets","Total Non-Current Assets",               22),
    _bs("inventories",        "Inventories",                              23),
    _bs("current_investments","Current Investments",                       25),
    _bs("cash_equivalents",   "Cash and Cash Equivalents",                26),
    _bs("bank_balances",      "Bank Balances (Other)",                    28),
    _bs("trade_receivables",  "Trade Receivables",                        29),
    _bs("st_loans_advances",  "Short-term Loans & Advances",              30),
    _bs("other_current_assets","Other Current Assets",                     31),
    _bs("total_current_assets","Total Current Assets",                     39),
    _bs("total_assets",       "Total Assets",                              40),
    _bs("short_term_debt",    "Short-term Borrowings",                     41),
    _bs("lease_liab_current", "Lease Liabilities (Current)",               42),
    _bs("trade_payables",     "Trade Payables",                            43),
    _bs("other_current_liab", "Other Current Liabilities",                 44),
    _bs("provisions_current", "Provisions (Current)",                      49),
    _bs("total_current_liab", "Total Current Liabilities",                 52),
    _bs("net_current_assets", "Net Current Assets",                        53),
    _bs("long_term_debt",     "Long-term Borrowings",                      54),
    _bs("lease_liab_noncurr", "Lease Liabilities (Non-Current)",           58),
    _bs("other_lt_liab",      "Other Long-term Liabilities",               59),
    _bs("lt_provisions",      "Long-term Provisions",                      63),
    _bs("deferred_tax_liab",  "Deferred Tax Liabilities",                  66),
    _bs("total_noncurr_liab", "Total Non-Current Liabilities",             67),
    _bs("share_capital",      "Share Capital",                              68),
    _bs("equity_capital",     "Equity Capital",                             69),
    _bs("other_equity",       "Other Equity",                               72),
    _bs("reserves_surplus",   "Reserves and Surplus",                       73),
    _bs("total_shareholder_fund","Total Shareholder's Fund",                75),
    _bs("total_equity_liab",  "Total Equity and Liabilities",               77),
    _bs("contingent_liab",    "Contingent Liabilities",                      78),

    # ═══════════════════════════════════════════════════════════════
    # CASH FLOW  (z_calculated_quarterly_ratios — flat)
    # ═══════════════════════════════════════════════════════════════
    _cf("cfo",                "CFO (Operating Cash Flow)",                "CFO", "cr", "bar"),
    _cf("cfo_ebitda",         "CFO/EBITDA",                               "CFO/EBITDA"),
    _cf("cfo_pat",            "CFO/PAT Ratio",                            "CFO/PAT Ratio"),
    _cf("cfo_to_sales",       "Operating Cash Flow to Sales",             "Operating Cash Flow to Sales"),
    _cf("cfo_to_debt",        "Operating Cash Flow to Debt",              "Operating Cash Flow to Debt"),
    _cf("cfo_to_curr_liab",   "CFO to Current Liabilities",              "CFO to Current Liabilities Ratio"),
    _cf("fcf",                "Free Cash Flow (FCF)",                     "FCF", "cr", "bar"),
    _cf("fcf_yield",          "FCF Yield",                                "FCF Yield", "pct"),
    _cf("fcf_to_capex",       "FCF to Capex Ratio",                      "FCF to Capex Ratio"),
    _cf("price_to_cashflow",  "Price-to-Cash Flow",                       "Price-to-Cash Flow"),
    _cf("net_debt_to_ebitda", "Net Debt to EBITDA",                       "Net Debt to EBITDA"),
    _cf("capex",              "Capex",                                    "Capex (Purchase of Fixed Assets)", "cr", "bar"),
    _cf("capex_to_revenue",   "Capex to Revenue %",                      "Capex to Revenue Ratio", "pct"),

    # ═══════════════════════════════════════════════════════════════
    # STATISTICS  (multiple flat collections)
    # ═══════════════════════════════════════════════════════════════

    # — Valuation Ratios —
    _val("pe_ratio",          "P/E Ratio",                                "PE"),
    _val("pb_ratio",          "P/B Ratio",                                "Price_BookValue"),
    _val("mcap_sales",        "MCap/Sales",                               "Mcap_Sales"),
    _val("ev_ebitda",         "EV/EBITDA",                                "EV_EBITDA"),
    _val("dividend_yield",    "Dividend Yield %",                         "DividendYield", "pct"),

    # — Return Ratios —
    _ret("roe",               "Return on Equity (ROE)",                   "Return_ROE"),
    _ret("roce",              "ROCE",                                     "Return_ROCE"),
    _ret("roa",               "Return on Assets (ROA)",                   "Return_ReturnOnAssets"),

    # — Margin Ratios —
    _mgn("ebitda_margin",     "EBITDA Margin %",                          "pbidtim"),
    _mgn("operating_margin",  "Operating Margin %",                       "ebitm"),
    _mgn("pat_margin",        "PAT Margin %",                             "patm"),
    _mgn("core_profit_margin","Core Profit Margin %",                     "cpm"),
    _mgn("pretax_margin",     "Pre-Tax Margin %",                         "pretaxmargin"),

    # — Financial Stability —
    _stab("debt_to_equity",   "Debt/Equity",                              "TotalDebt_Equity"),
    _stab("current_ratio",    "Current Ratio",                            "CurrentRatio"),
    _stab("quick_ratio",      "Quick Ratio",                              "QuickRatio"),
    _stab("interest_cover",   "Interest Coverage Ratio",                  "InterestCover"),
    _stab("debt_to_mcap",     "Debt/MCap",                                "TotalDebt_MCap"),

    # — Efficiency Ratios —
    _eff("receivable_days",   "Receivable Days",                          "ReceivableDays"),
    _eff("inventory_days",    "Inventory Days",                           "InventoryDays"),
    _eff("payable_days",      "Payable Days",                             "PayableDays"),
    _eff("fixed_assets_sales","Net Fixed Assets / Sales",                 "FixedCapitals_Sales", "ratio"),
]

_CATALOG_BY_KEY: dict[str, dict[str, Any]] = {m["key"]: m for m in _METRIC_CATALOG}

_TABS = ["income_statement", "balance_sheet", "cash_flow", "statistics"]


# ── Helpers ────────────────────────────────────────────────────────

def _safe_float(val: Any) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        return f if math.isfinite(f) else None
    except (ValueError, TypeError):
        return None


def _period_to_end_date(period: str) -> str:
    """Convert 'YYYY-MM' period to last day of that month: '2025-03' → '2025-03-31'."""
    try:
        parts = period.split("-")
        year = int(parts[0])
        month = int(parts[1])
        last_day = calendar.monthrange(year, month)[1]
        return f"{year:04d}-{month:02d}-{last_day:02d}"
    except (ValueError, IndexError):
        return period


def _y_key_to_period(y_key: str) -> str | None:
    """Convert 'Y202503' → '2025-03'."""
    if not y_key.startswith("Y") or len(y_key) < 5:
        return None
    try:
        year = y_key[1:5]
        month = y_key[5:7] if len(y_key) >= 7 else "03"
        return f"{year}-{month}"
    except (ValueError, IndexError):
        return None


def _resolve_co_code(db: Any, symbol: str) -> int | None:
    """Map NSE symbol → co_code via company_master collection."""
    symbol_upper = symbol.strip().upper()
    if symbol_upper in _co_code_cache:
        return _co_code_cache[symbol_upper]

    doc = db["indira_cmots_company_master"].find_one(
        {"nsesymbol": symbol_upper},
        {"_id": 0, "co_code": 1},
    )
    if doc and doc.get("co_code") is not None:
        cc = int(doc["co_code"])
        _co_code_cache[symbol_upper] = cc
        return cc
    return None


# ── RID-based extraction (P&L, Balance Sheet) ─────────────────────

def _extract_rid_series(
    db: Any,
    co_code: int,
    collection: str,
    rid: int,
    period: str,
) -> list[dict[str, Any]]:
    """Extract time series for a single RID from a single company (standalone)."""
    pipeline = [
        {"$match": {"co_code": co_code, "companymode": "S"}},
        {
            "$project": {
                "_id": 0,
                "data": {
                    "$filter": {
                        "input": "$data",
                        "as": "row",
                        "cond": {"$eq": ["$$row.RID", rid]},
                    }
                },
            }
        },
    ]
    result: list[dict[str, Any]] = []
    for doc in db[collection].aggregate(pipeline):
        for row in doc.get("data") or []:
            for key, val in row.items():
                if not isinstance(key, str) or not key.startswith("Y") or len(key) < 7:
                    continue
                try:
                    month = int(key[5:7])
                except ValueError:
                    continue
                if period == "annual" and month != 3:
                    continue
                if month not in (3, 6, 9, 12):
                    continue
                fval = _safe_float(val)
                if fval is not None:
                    p = _y_key_to_period(key)
                    if p:
                        result.append({"date": _period_to_end_date(p), "value": round(fval, 2)})

    result.sort(key=lambda x: x["date"])
    return result


# ── Flat collection extraction (ratio collections) ────────────────

def _extract_flat_series(
    db: Any,
    co_code: int,
    collection: str,
    field: str,
    filter_key: str,
    filter_value: str | None,
    period: str,
) -> list[dict[str, Any]]:
    """Extract time series for a single field from a flat ratio collection."""
    query: dict[str, Any] = {"co_code": co_code}
    if filter_value is not None:
        query[filter_key] = filter_value
    # Filter out junk year documents
    query["year"] = {"$regex": r"^\d{4}-\d{2}$"}

    cursor = db[collection].find(
        query,
        {"_id": 0, "year": 1, field: 1},
    ).sort("year", 1)

    result: list[dict[str, Any]] = []
    for doc in cursor:
        yr = str(doc.get("year", ""))
        if not _YEAR_MONTH_RE.match(yr):
            continue
        if period == "annual" and not yr.endswith("-03"):
            continue
        fval = _safe_float(doc.get(field))
        if fval is not None:
            result.append({"date": _period_to_end_date(yr), "value": round(fval, 4)})

    return result


# ── Public API ─────────────────────────────────────────────────────

def get_catalog() -> FundamentalCatalogResponse:
    """Return the static metric catalog (no DB hit)."""
    metrics = [
        FundamentalMetricInfo(
            key=m["key"],
            label=m["label"],
            tab=m["tab"],
            unit=m["unit"],
            chart_type=m["chart_type"],
        )
        for m in _METRIC_CATALOG
    ]
    return FundamentalCatalogResponse(tabs=_TABS, metrics=metrics)


def get_timeseries(
    symbol: str,
    metric_keys: list[str],
    period: str = "quarterly",
) -> FundamentalTimeseriesResponse:
    """Fetch fundamental time series for requested metrics."""
    db = get_mongo_db()

    co_code = _resolve_co_code(db, symbol)
    if co_code is None:
        raise ValueError(f"Symbol '{symbol}' not found in company master")

    now = time.time()
    metrics_result: dict[str, list[FundamentalDataPoint]] = {}

    for key in metric_keys:
        meta = _CATALOG_BY_KEY.get(key)
        if meta is None:
            logger.warning("Unknown metric key: %s", key)
            metrics_result[key] = []
            continue

        cache_key = (co_code, key, period)
        cached = _ts_cache.get(cache_key)
        if cached and (now - cached[0]) < _CACHE_TTL:
            metrics_result[key] = [FundamentalDataPoint(**pt) for pt in cached[1]]
            continue

        if meta["type"] == "rid":
            raw = _extract_rid_series(
                db, co_code, meta["collection"], meta["rid"], period
            )
        else:
            raw = _extract_flat_series(
                db,
                co_code,
                meta["collection"],
                meta["field"],
                meta.get("filter_key", "co_code"),
                meta.get("filter_value"),
                period,
            )

        _ts_cache[cache_key] = (now, raw)
        metrics_result[key] = [FundamentalDataPoint(**pt) for pt in raw]

    return FundamentalTimeseriesResponse(
        symbol=symbol.upper(),
        co_code=co_code,
        metrics=metrics_result,
    )
