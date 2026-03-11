"""
Universe Service — loads the full listed companies universe from All_companies_data.xlsx.

Provides browsable data for the Universe page with all company metadata,
ACE sector/industry classifications, and market cap info.
"""

import logging
import os
from pathlib import Path
from typing import Any

import pandas as pd

logger = logging.getLogger(__name__)

# Module-level cache
_companies: list[dict[str, Any]] = []
_meta: dict[str, Any] = {}
_by_co_code: dict[int, dict[str, Any]] = {}
_by_nse_symbol: dict[str, dict[str, Any]] = {}
_by_bse_symbol: dict[str, dict[str, Any]] = {}
_by_any_symbol: dict[str, dict[str, Any]] = {}  # NSE or BSE symbol → company
_co_codes: set[int] = set()
_nse_symbols: set[str] = set()
_bse_symbols: set[str] = set()
_all_symbols: set[str] = set()  # union of NSE + BSE symbols
_loaded: bool = False

# Columns to drop (always constant values)
_DROP_COLS = {"chetan", "categoryname"}

# Column rename mapping (original → snake_case)
_RENAME = {
    "companyshortname": "company_short_name",
    "companyname": "company_name",
    "bsecode": "bse_code",
    "bsegroup": "bse_group",
    "bselistedflag": "bse_listed_flag",
    "nselistedflag": "nse_listed_flag",
    "sectorcode": "sector_code",
    "sectorname": "sector_name",
    "industrycode": "industry_code",
    "industryname": "industry_name",
    "nsesymbol": "nse_symbol",
    "BSESymbol": "bse_symbol",
    "BSEStatus": "bse_status",
    "NSEStatus": "nse_status",
    "Ace Sector": "ace_sector",
    "Ace industry": "ace_industry",
}


def load(file_path: str | None = None) -> None:
    """Load All_companies_data.xlsx and cache as list of dicts."""
    global _companies, _meta, _by_co_code, _by_nse_symbol, _by_bse_symbol, _by_any_symbol, _co_codes, _nse_symbols, _bse_symbols, _all_symbols, _loaded

    if file_path is None:
        file_path = str(Path(__file__).resolve().parents[2] / "All_companies_data.xlsx")

    if not os.path.exists(file_path):
        logger.warning("Universe Excel not found: %s", file_path)
        _loaded = True
        return

    logger.info("Loading universe from %s", file_path)
    df = pd.read_excel(file_path, header=0)

    # Drop junk columns
    for col in _DROP_COLS:
        if col in df.columns:
            df = df.drop(columns=[col])

    # Rename columns to snake_case
    df = df.rename(columns=_RENAME)

    # Replace NaN with None for JSON serialisation
    df = df.where(pd.notna(df), None)

    # Convert numeric columns that may have None
    _companies = df.to_dict(orient="records")

    # Build lookup dicts
    _by_co_code = {}
    _by_nse_symbol = {}
    _by_bse_symbol = {}
    _by_any_symbol = {}
    for c in _companies:
        cc = c.get("co_code")
        if cc is not None:
            _by_co_code[int(cc)] = c
        nse = c.get("nse_symbol")
        if nse:
            key = str(nse).strip().upper()
            _by_nse_symbol[key] = c
            _by_any_symbol[key] = c
        bse = c.get("bse_symbol")
        if bse:
            key = str(bse).strip().upper()
            _by_bse_symbol[key] = c
            if key not in _by_any_symbol:  # NSE takes priority if same symbol
                _by_any_symbol[key] = c
    _co_codes = set(_by_co_code.keys())
    _nse_symbols = set(_by_nse_symbol.keys())
    _bse_symbols = set(_by_bse_symbol.keys())
    _all_symbols = _nse_symbols | _bse_symbols

    # Build metadata
    sectors = sorted(df["ace_sector"].dropna().unique().tolist())
    industries = sorted(df["ace_industry"].dropna().unique().tolist())
    columns = df.columns.tolist()

    mcap_counts: dict[str, int] = {}
    if "mcaptype" in df.columns:
        mcap_counts = df["mcaptype"].value_counts().to_dict()

    _meta = {
        "total": len(_companies),
        "columns": columns,
        "sectors": sectors,
        "industries": industries,
        "mcap_counts": mcap_counts,
    }

    _loaded = True
    logger.info(
        "Universe loaded: %d companies, %d sectors, %d industries",
        len(_companies), len(sectors), len(industries),
    )


def get_all() -> list[dict[str, Any]]:
    """Return all companies as list of dicts."""
    return _companies


def get_meta() -> dict[str, Any]:
    """Return metadata: columns, sectors, industries, counts."""
    return _meta


def get_by_co_code(co_code: int) -> dict[str, Any] | None:
    """Lookup a company by co_code. Returns full dict or None."""
    return _by_co_code.get(co_code)


def get_by_nse_symbol(symbol: str) -> dict[str, Any] | None:
    """Lookup a company by NSE symbol. Returns full dict or None."""
    return _by_nse_symbol.get(symbol.strip().upper())


def get_universe_co_codes() -> set[int]:
    """Return set of all co_codes in the universe."""
    return _co_codes


def get_universe_nse_symbols() -> set[str]:
    """Return set of all NSE symbols in the universe."""
    return _nse_symbols


def get_by_bse_symbol(symbol: str) -> dict[str, Any] | None:
    """Lookup a company by BSE symbol. Returns full dict or None."""
    return _by_bse_symbol.get(symbol.strip().upper())


def get_by_symbol(symbol: str) -> dict[str, Any] | None:
    """Lookup a company by any symbol (NSE or BSE). Returns full dict or None."""
    return _by_any_symbol.get(symbol.strip().upper())


def get_all_symbols() -> set[str]:
    """Return union of all NSE + BSE symbols in the universe."""
    return _all_symbols
