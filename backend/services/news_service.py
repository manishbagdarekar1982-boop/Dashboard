"""
News Service — fetches news from Redbox API and stores in local SQLite.

DB file: backend/data/news.db
Table: news_articles + news_companies (linked by guid)
Deduplicates by guid.
"""

import json
import logging
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "news.db"
_NEWSPAPER_DIR = Path(__file__).resolve().parents[2] / "News_paper"
_initialized = False

_PAPER_MAP = {
    "BS": "Business Standard",
    "ET": "Economic Times",
    "FE": "Financial Express",
    "Mint": "Mint",
}

_FILENAME_RE = re.compile(
    r"^(BS|ET|FE|Mint)\s*[-\u2013]\s*.*?(\d{2}-\d{2}-\d{4})",
    re.IGNORECASE,
)


def _get_conn() -> sqlite3.Connection:
    """Return a SQLite connection, creating DB + tables on first call."""
    global _initialized
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH))
    conn.row_factory = sqlite3.Row
    if not _initialized:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS news_articles (
                guid TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                categories TEXT,
                published_at TEXT,
                has_enclosure INTEGER DEFAULT 0,
                custom_name TEXT,
                notification INTEGER DEFAULT 0,
                fetched_at TEXT
            );
            CREATE TABLE IF NOT EXISTS news_companies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guid TEXT NOT NULL REFERENCES news_articles(guid) ON DELETE CASCADE,
                company_name TEXT,
                nse_symbol TEXT,
                bse_code TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_articles_published ON news_articles(published_at);
            CREATE INDEX IF NOT EXISTS idx_companies_guid ON news_companies(guid);
            CREATE INDEX IF NOT EXISTS idx_companies_nse ON news_companies(nse_symbol);
        """)
        conn.commit()
        _initialized = True
    return conn


def _parse_date(date_str: str) -> str | None:
    """Parse the API date format and return ISO string."""
    formats = [
        "%a %B %d %Y %H:%M:%S",   # Wed March 11 2026 09:43:47
        "%a %b %d %Y %H:%M:%S",   # Wed Mar 11 2026 09:43:47
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str.strip(), fmt).replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except ValueError:
            continue
    logger.warning("Could not parse date: %s", date_str)
    return None


async def fetch_and_store() -> dict[str, int]:
    """Fetch news from Redbox API and upsert into SQLite.

    Returns dict with counts: total, new, existing.
    """
    url = settings.NEWS_API_URL
    if not url:
        raise ValueError("NEWS_API_URL is not configured in .env")

    logger.info("Fetching news from API...")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    items = data.get("items", [])
    if not items:
        logger.info("No news items returned from API")
        return {"total": 0, "new": 0, "existing": 0}

    conn = _get_conn()
    new_count = 0
    existing_count = 0
    now_iso = datetime.now(timezone.utc).isoformat()

    for item in items:
        guid = item.get("guid")
        if not guid:
            continue

        # Check if already exists
        existing = conn.execute("SELECT 1 FROM news_articles WHERE guid = ?", (guid,)).fetchone()
        if existing:
            existing_count += 1
            continue

        custom = item.get("custom_elements", [{}])
        ce = custom[0] if custom else {}
        categories = json.dumps(item.get("categories", []))
        published_at = _parse_date(item.get("date", "") or "")

        conn.execute(
            """INSERT INTO news_articles (guid, title, description, categories, published_at, has_enclosure, custom_name, notification, fetched_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                guid,
                (item.get("title") or "").strip(),
                (item.get("description") or "").strip(),
                categories,
                published_at,
                1 if item.get("enclosure") else 0,
                ce.get("customName", ""),
                1 if ce.get("notification") else 0,
                now_iso,
            ),
        )

        # Insert linked companies
        companies_raw = ce.get("companies", [])
        for c in companies_raw:
            name = (c.get("nameOfCompany") or "").strip()
            nse = (c.get("nse") or "").strip() if isinstance(c.get("nse"), str) else ""
            bse = c.get("bse")
            bse_str = str(bse) if bse and bse != 0 else ""
            if name or nse or bse_str:
                conn.execute(
                    "INSERT INTO news_companies (guid, company_name, nse_symbol, bse_code) VALUES (?, ?, ?, ?)",
                    (guid, name, nse.upper() if nse else "", bse_str),
                )

        new_count += 1

    conn.commit()
    conn.close()

    logger.info(
        "News fetch complete: %d total, %d new, %d already stored",
        len(items), new_count, existing_count,
    )
    return {"total": len(items), "new": new_count, "existing": existing_count}


def get_news(
    skip: int = 0,
    limit: int = 50,
    category: str | None = None,
    symbol: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Retrieve stored news articles with optional filters."""
    conn = _get_conn()

    where_clauses = []
    params: list[Any] = []

    if category:
        where_clauses.append("a.categories LIKE ?")
        params.append(f'%"{category}"%')
    if symbol:
        where_clauses.append("EXISTS (SELECT 1 FROM news_companies nc WHERE nc.guid = a.guid AND nc.nse_symbol = ?)")
        params.append(symbol.upper())

    where_sql = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

    # Count
    total = conn.execute(f"SELECT COUNT(*) FROM news_articles a{where_sql}", params).fetchone()[0]

    # Fetch articles
    rows = conn.execute(
        f"SELECT * FROM news_articles a{where_sql} ORDER BY a.published_at DESC LIMIT ? OFFSET ?",
        params + [limit, skip],
    ).fetchall()

    articles = []
    for row in rows:
        guid = row["guid"]
        # Fetch linked companies
        companies = [
            {"company_name": c["company_name"], "nse_symbol": c["nse_symbol"], "bse_code": c["bse_code"]}
            for c in conn.execute("SELECT company_name, nse_symbol, bse_code FROM news_companies WHERE guid = ?", (guid,)).fetchall()
        ]
        articles.append({
            "guid": guid,
            "title": row["title"],
            "description": row["description"],
            "categories": json.loads(row["categories"]) if row["categories"] else [],
            "published_at": row["published_at"],
            "has_enclosure": bool(row["has_enclosure"]),
            "custom_name": row["custom_name"],
            "notification": bool(row["notification"]),
            "companies": companies,
            "fetched_at": row["fetched_at"],
        })

    conn.close()
    return articles, total


def get_categories() -> list[str]:
    """Return distinct news categories."""
    conn = _get_conn()
    rows = conn.execute("SELECT DISTINCT categories FROM news_articles").fetchall()
    conn.close()
    cats: set[str] = set()
    for row in rows:
        for c in json.loads(row["categories"] or "[]"):
            cats.add(c)
    return sorted(cats)


def get_stats() -> dict[str, Any]:
    """Return news collection stats."""
    conn = _get_conn()
    total = conn.execute("SELECT COUNT(*) FROM news_articles").fetchone()[0]
    latest = conn.execute("SELECT MAX(published_at) FROM news_articles").fetchone()[0]
    oldest = conn.execute("SELECT MIN(published_at) FROM news_articles").fetchone()[0]
    conn.close()
    return {
        "total_articles": total,
        "latest": latest,
        "oldest": oldest,
        "categories": get_categories(),
        "db_path": str(_DB_PATH),
    }


def list_newspaper_files() -> dict[str, Any]:
    """Scan News_paper directory and return PDFs grouped by date."""
    if not _NEWSPAPER_DIR.exists():
        return {"dates": [], "papers": {}}

    papers_by_date: dict[str, list[dict[str, Any]]] = {}

    for f in _NEWSPAPER_DIR.glob("*.pdf"):
        match = _FILENAME_RE.match(f.name)
        if not match:
            continue
        raw_code = match.group(1)
        # Normalize code
        code = raw_code
        for key in _PAPER_MAP:
            if key.upper() == raw_code.upper():
                code = key
                break

        date_str = match.group(2)  # DD-MM-YYYY
        day, month, year = date_str.split("-")
        iso_date = f"{year}-{month}-{day}"

        size_mb = round(f.stat().st_size / (1024 * 1024), 1)

        papers_by_date.setdefault(iso_date, []).append({
            "code": code,
            "name": _PAPER_MAP.get(code, code),
            "filename": f.name,
            "size_mb": size_mb,
        })

    dates = sorted(papers_by_date.keys(), reverse=True)
    for d in dates:
        papers_by_date[d].sort(key=lambda x: x["code"])

    return {"dates": dates, "papers": papers_by_date}


def get_newspaper_path(filename: str) -> Path | None:
    """Validate and return full path for a newspaper PDF. Returns None if invalid."""
    if not filename.endswith(".pdf"):
        return None
    if ".." in filename or "/" in filename or "\\" in filename:
        return None

    file_path = (_NEWSPAPER_DIR / filename).resolve()

    # Path traversal check
    if not str(file_path).startswith(str(_NEWSPAPER_DIR.resolve())):
        return None
    if not file_path.exists():
        return None

    return file_path
