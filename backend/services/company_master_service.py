"""
Company Master Service — loads sector/industry mapping from company_master_ACE.xlsx.

Filters:
  - ISIN starts with "INE" (Indian equities only)
  - Listing Status = "Listed" (active stocks only)
  - Excludes ETF sector and Index industry

Provides lookup by NSE Symbol, BSE Code, and ISIN for sector/industry overrides.
"""

import logging
import os
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

# Module-level lookups populated at startup
_by_symbol: dict[str, dict[str, str]] = {}   # NSE symbol → {sector, industry, isin, company_name}
_by_bse: dict[str, dict[str, str]] = {}      # BSE code → {sector, industry, isin, company_name}
_by_isin: dict[str, dict[str, str]] = {}     # ISIN → {symbol, sector, industry, company_name}
_all_sectors: list[str] = []
_all_industries: list[str] = []
_loaded: bool = False

# Exchange + MCap Type lookups from MongoDB (nsesymbol → value)
_exchange_by_symbol: dict[str, str] = {}
_mcaptype_by_symbol: dict[str, str] = {}  # "Large Cap" / "Mid Cap" / "Small Cap"


def load_excel(file_path: str | None = None) -> None:
    """Load company_master_ACE.xlsx and build lookup dicts."""
    global _by_symbol, _by_bse, _by_isin, _all_sectors, _all_industries, _loaded

    if file_path is None:
        file_path = str(Path(__file__).resolve().parents[2] / "company_master_ACE.xlsx")

    if not os.path.exists(file_path):
        logger.warning("Company master Excel not found: %s", file_path)
        _loaded = True
        return

    logger.info("Loading company master from %s", file_path)
    df = pd.read_excel(file_path, header=3)

    # Normalise column names
    df.columns = df.columns.str.strip()

    # Drop fully empty rows
    df = df.dropna(how="all")

    # --- Filter 1: ISIN starts with "INE" (Indian equities only) ---
    df = df[df["CD_ISIN No"].astype(str).str.startswith("INE")]

    # --- Filter 2: Active / Listed stocks only ---
    df["CD_Listing Status"] = df["CD_Listing Status"].astype(str).str.strip()
    df = df[df["CD_Listing Status"] == "Listed"]

    # --- Filter 3: Exclude ETF ---
    df = df[df["CD_Sector"].astype(str).str.strip() != "ETF"]

    # --- Filter 4: Exclude Index ---
    df = df[df["CD_Industry1"].astype(str).str.strip() != "Index"]

    # Build lookups
    sym_map: dict[str, dict[str, str]] = {}
    bse_map: dict[str, dict[str, str]] = {}
    isin_map: dict[str, dict[str, str]] = {}
    sectors_set: set[str] = set()
    industries_set: set[str] = set()

    for _, row in df.iterrows():
        isin = str(row.get("CD_ISIN No", "")).strip()
        sector = str(row.get("CD_Sector", "")).strip()
        industry = str(row.get("CD_Industry1", "")).strip()
        nse_sym = str(row.get("CD_NSE Symbol", "")).strip().upper()
        bse_code = str(row.get("CD_BSE Code", "")).strip()
        company_name = str(row.get("Company Name", "")).strip()

        if sector and sector != "nan":
            sectors_set.add(sector)
        if industry and industry != "nan":
            industries_set.add(industry)

        info = {
            "sector": sector if sector != "nan" else "",
            "industry": industry if industry != "nan" else "",
            "isin": isin,
            "company_name": company_name if company_name != "nan" else "",
        }

        # Map by ISIN (always available after INE filter)
        if isin:
            isin_map[isin] = {**info, "symbol": nse_sym if nse_sym != "NAN" else ""}

        # Map by NSE Symbol (may be NaN for some stocks)
        if nse_sym and nse_sym != "NAN":
            sym_map[nse_sym] = info

        # Map by BSE Code (covers stocks without NSE symbol)
        if bse_code and bse_code != "nan" and bse_code != "NAN":
            # Remove .0 from float conversion
            bse_code = bse_code.split(".")[0]
            if bse_code:
                bse_map[bse_code] = info

    _by_symbol = sym_map
    _by_bse = bse_map
    _by_isin = isin_map
    _all_sectors = sorted(sectors_set)
    _all_industries = sorted(industries_set)
    _loaded = True

    logger.info(
        "Company master loaded: %d by symbol, %d by BSE, %d by ISIN, %d sectors, %d industries",
        len(_by_symbol), len(_by_bse), len(_by_isin), len(_all_sectors), len(_all_industries),
    )


def get_sector_industry(symbol: str | None = None, bse_code: str | None = None) -> tuple[str, str] | None:
    """Return (sector, industry) by NSE symbol or BSE code."""
    if symbol:
        info = _by_symbol.get(symbol.upper())
        if info:
            return info["sector"], info["industry"]
    if bse_code:
        bse_key = str(bse_code).split(".")[0]
        info = _by_bse.get(bse_key)
        if info:
            return info["sector"], info["industry"]
    return None


def load_exchange_from_mongo() -> None:
    """Load exchange listing flags and mcaptype from MongoDB indira_cmots_company_master."""
    global _exchange_by_symbol, _mcaptype_by_symbol
    try:
        from backend.database_mongo import get_mongo_db
        db = get_mongo_db()
    except Exception:
        logger.warning("MongoDB not available — exchange/mcaptype lookup will be empty")
        return

    docs = db["indira_cmots_company_master"].find(
        {},
        {"nsesymbol": 1, "nselistedflag": 1, "bselistedflag": 1, "mcaptype": 1},
    )
    exchange_map: dict[str, str] = {}
    mcaptype_map: dict[str, str] = {}
    for doc in docs:
        nse_sym = (doc.get("nsesymbol") or "").strip().upper()
        if not nse_sym:
            continue
        nse_listed = (doc.get("nselistedflag") or "").strip().upper() in ("Y", "YES")
        bse_listed = (doc.get("bselistedflag") or "").strip().upper() in ("Y", "YES")
        if nse_listed and bse_listed:
            exchange_map[nse_sym] = "NSE, BSE"
        elif nse_listed:
            exchange_map[nse_sym] = "NSE"
        elif bse_listed:
            exchange_map[nse_sym] = "BSE"
        # MCap type from SEBI classification
        mcaptype = doc.get("mcaptype")
        if mcaptype and isinstance(mcaptype, str):
            mcaptype_map[nse_sym] = mcaptype.strip()
    _exchange_by_symbol = exchange_map
    _mcaptype_by_symbol = mcaptype_map
    logger.info(
        "Exchange lookup loaded from MongoDB: %d symbols, mcaptype: %d symbols",
        len(_exchange_by_symbol), len(_mcaptype_by_symbol),
    )


def get_exchange(symbol: str) -> str | None:
    """Return exchange string from MongoDB data: 'NSE', 'BSE', or 'NSE, BSE'."""
    return _exchange_by_symbol.get(symbol.upper())


def get_mcaptype(symbol: str) -> str | None:
    """Return SEBI mcap classification: 'Large Cap', 'Mid Cap', or 'Small Cap'."""
    return _mcaptype_by_symbol.get(symbol.upper())


def get_company_info(symbol: str) -> dict[str, str] | None:
    """Return full info dict for an NSE symbol."""
    return _by_symbol.get(symbol.upper())


def get_by_isin(isin: str) -> dict[str, str] | None:
    """Return info dict by ISIN."""
    return _by_isin.get(isin)


def get_by_bse(bse_code: str) -> dict[str, str] | None:
    """Return info dict by BSE code."""
    bse_key = str(bse_code).split(".")[0]
    return _by_bse.get(bse_key)


def get_all_sectors() -> list[str]:
    """Return sorted list of distinct sectors from Excel."""
    return _all_sectors


def get_all_industries() -> list[str]:
    """Return sorted list of distinct industries from Excel."""
    return _all_industries


def get_symbols_for_sector(sector: str) -> list[str]:
    """Return all NSE symbols belonging to a sector."""
    return [
        sym for sym, info in _by_symbol.items()
        if info["sector"] == sector
    ]


def get_co_codes_for_sector_via_bse(sector: str) -> list[str]:
    """Return all BSE codes belonging to a sector (for stocks without NSE symbols)."""
    return [
        bse for bse, info in _by_bse.items()
        if info["sector"] == sector
    ]


_EXCLUDED_SYMBOLS = {
    "KORE", "SIIL", "GSTL", "FOCUS", "MAL", "KEL",
    "RAJPUTANA", "WORTH", "SEL", "ZEAL", "CREATIVE",
}


def get_universe_symbols() -> set[str]:
    """Return the set of valid NSE symbols for the project universe.

    This is the single source of truth: INE ISIN + Listed + not ETF/Index
    + not in excluded list. All services should filter to this set.
    """
    return set(_by_symbol.keys()) - _EXCLUDED_SYMBOLS


def is_loaded() -> bool:
    return _loaded
