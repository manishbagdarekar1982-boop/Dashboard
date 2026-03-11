# CLAUDE.md — Financial Dashboard Platform (StockVista)

> **Project Codename:** StockVista
> **Version:** 1.0.0
> **Last Updated:** 2026-02-24
> **Primary Developer Agent:** Claude Code

---

## 🧠 PROJECT IDENTITY & VISION

**StockVista** is a professional-grade, modular financial analytics dashboard that connects to a PostgreSQL database (managed via PgAdmin) containing OHLC (Open, High, Low, Close) stock data for multiple companies. The platform is designed to be **incrementally extensible** — starting with OHLC visualization and growing into a full-featured financial intelligence hub with fundamental analysis, news integration, AI-powered insights, portfolio tracking, and more.

### Core Philosophy
- **Database-first architecture** — PostgreSQL is the single source of truth
- **Modular feature development** — every feature is a self-contained module
- **API-driven backend** — RESTful + WebSocket for real-time capabilities
- **Responsive, beautiful UI** — professional financial-grade charts and dashboards
- **Future-proof schema design** — tables and relationships planned for all future features from day one

---

## 📁 PROJECT STRUCTURE

```
stockvista/
├── CLAUDE.md                          # THIS FILE — master instructions
├── PROJECT_PROMPT.md                  # Detailed feature specifications
├── README.md                          # Project documentation
├── docker-compose.yml                 # Docker orchestration
├── .env.example                       # Environment variable template
├── .env                               # Local environment (git-ignored)
│
├── backend/                           # Python FastAPI Backend
│   ├── main.py                        # Application entry point
│   ├── config.py                      # Configuration & environment
│   ├── database.py                    # SQLAlchemy engine, session, base
│   ├── requirements.txt               # Python dependencies
│   ├── alembic/                       # Database migrations
│   │   ├── alembic.ini
│   │   ├── env.py
│   │   └── versions/                  # Migration scripts
│   │
│   ├── models/                        # SQLAlchemy ORM Models
│   │   ├── __init__.py
│   │   ├── company.py                 # Company master data
│   │   ├── ohlc.py                    # OHLC price data
│   │   ├── fundamental.py             # Fundamental/financial data
│   │   ├── news.py                    # News articles & sentiment
│   │   ├── portfolio.py               # User portfolios & holdings
│   │   ├── watchlist.py               # User watchlists
│   │   ├── alert.py                   # Price & event alerts
│   │   ├── screener.py                # Saved screener configs
│   │   └── user.py                    # User accounts & preferences
│   │
│   ├── schemas/                       # Pydantic request/response schemas
│   │   ├── __init__.py
│   │   ├── company.py
│   │   ├── ohlc.py
│   │   ├── fundamental.py
│   │   ├── news.py
│   │   ├── portfolio.py
│   │   └── common.py                  # Shared schemas (pagination, filters)
│   │
│   ├── api/                           # API Route Handlers
│   │   ├── __init__.py
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── router.py              # V1 API router aggregation
│   │   │   ├── companies.py           # /api/v1/companies
│   │   │   ├── ohlc.py                # /api/v1/ohlc
│   │   │   ├── fundamentals.py        # /api/v1/fundamentals
│   │   │   ├── news.py                # /api/v1/news
│   │   │   ├── portfolio.py           # /api/v1/portfolio
│   │   │   ├── watchlist.py           # /api/v1/watchlist
│   │   │   ├── screener.py            # /api/v1/screener
│   │   │   ├── alerts.py              # /api/v1/alerts
│   │   │   ├── analytics.py           # /api/v1/analytics
│   │   │   ├── indicators.py          # /api/v1/indicators (technical)
│   │   │   └── compare.py             # /api/v1/compare
│   │   └── websocket/
│   │       ├── __init__.py
│   │       └── live_feed.py           # WebSocket for real-time data
│   │
│   ├── services/                      # Business Logic Layer
│   │   ├── __init__.py
│   │   ├── ohlc_service.py            # OHLC data operations
│   │   ├── indicator_service.py       # Technical indicator calculations
│   │   ├── fundamental_service.py     # Fundamental analysis logic
│   │   ├── news_service.py            # News fetching & sentiment
│   │   ├── portfolio_service.py       # Portfolio calculations
│   │   ├── screener_service.py        # Stock screening engine
│   │   ├── alert_service.py           # Alert evaluation engine
│   │   ├── comparison_service.py      # Multi-stock comparison
│   │   ├── export_service.py          # Data export (CSV, Excel, PDF)
│   │   └── cache_service.py           # Redis caching layer
│   │
│   ├── integrations/                  # External API Integrations
│   │   ├── __init__.py
│   │   ├── news_api.py                # NewsAPI / GNews / Finviz
│   │   ├── alpha_vantage.py           # Alpha Vantage API
│   │   ├── yahoo_finance.py           # Yahoo Finance scraper
│   │   ├── sec_edgar.py               # SEC EDGAR filings
│   │   └── economic_calendar.py       # Economic events calendar
│   │
│   ├── tasks/                         # Background Tasks (Celery)
│   │   ├── __init__.py
│   │   ├── celery_app.py              # Celery configuration
│   │   ├── data_sync.py               # Periodic OHLC data sync
│   │   ├── news_fetch.py              # Periodic news fetching
│   │   ├── alert_check.py             # Alert condition evaluation
│   │   └── report_generation.py       # Scheduled report generation
│   │
│   ├── utils/                         # Shared Utilities
│   │   ├── __init__.py
│   │   ├── calculations.py            # Financial math helpers
│   │   ├── date_utils.py              # Trading day/date helpers
│   │   ├── validators.py              # Input validation
│   │   └── formatters.py              # Number/currency formatting
│   │
│   └── tests/                         # Backend Tests
│       ├── __init__.py
│       ├── conftest.py                # Pytest fixtures
│       ├── test_ohlc.py
│       ├── test_indicators.py
│       ├── test_portfolio.py
│       └── test_screener.py
│
├── frontend/                          # React + TypeScript Frontend
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── index.html
│   │
│   ├── public/
│   │   └── assets/                    # Static assets
│   │
│   └── src/
│       ├── main.tsx                   # React entry point
│       ├── App.tsx                    # Root component + routing
│       ├── index.css                  # Global styles
│       │
│       ├── api/                       # API Client Layer
│       │   ├── client.ts              # Axios/fetch instance
│       │   ├── endpoints.ts           # API endpoint constants
│       │   ├── ohlc.ts                # OHLC API calls
│       │   ├── companies.ts           # Company API calls
│       │   ├── fundamentals.ts        # Fundamental API calls
│       │   ├── news.ts                # News API calls
│       │   ├── portfolio.ts           # Portfolio API calls
│       │   └── websocket.ts           # WebSocket client
│       │
│       ├── components/                # Reusable UI Components
│       │   ├── charts/                # Chart Components
│       │   │   ├── CandlestickChart.tsx
│       │   │   ├── LineChart.tsx
│       │   │   ├── AreaChart.tsx
│       │   │   ├── BarChart.tsx
│       │   │   ├── VolumeChart.tsx
│       │   │   ├── HeikinAshiChart.tsx
│       │   │   ├── RSIChart.tsx
│       │   │   ├── MACDChart.tsx
│       │   │   ├── BollingerBands.tsx
│       │   │   ├── ComparisonChart.tsx
│       │   │   ├── HeatmapChart.tsx
│       │   │   ├── TreemapChart.tsx
│       │   │   ├── PieChart.tsx
│       │   │   └── ChartContainer.tsx   # Shared chart wrapper
│       │   │
│       │   ├── tables/                # Data Table Components
│       │   │   ├── OHLCTable.tsx
│       │   │   ├── FundamentalTable.tsx
│       │   │   ├── ScreenerTable.tsx
│       │   │   ├── PortfolioTable.tsx
│       │   │   └── DataTable.tsx        # Generic sortable table
│       │   │
│       │   ├── widgets/               # Dashboard Widget Components
│       │   │   ├── StockTicker.tsx       # Scrolling ticker tape
│       │   │   ├── MarketOverview.tsx    # Market summary card
│       │   │   ├── TopMovers.tsx         # Gainers/losers widget
│       │   │   ├── NewsFeed.tsx          # News headlines widget
│       │   │   ├── WatchlistWidget.tsx   # Quick watchlist view
│       │   │   ├── AlertsWidget.tsx      # Active alerts panel
│       │   │   ├── SectorHeatmap.tsx     # Sector performance
│       │   │   ├── MiniChart.tsx         # Sparkline mini charts
│       │   │   └── StatCard.tsx          # Single metric card
│       │   │
│       │   ├── forms/                 # Input & Filter Components
│       │   │   ├── StockSearch.tsx       # Autocomplete stock search
│       │   │   ├── DateRangePicker.tsx   # Date range selector
│       │   │   ├── IntervalSelector.tsx  # Timeframe selector
│       │   │   ├── IndicatorPicker.tsx   # Technical indicator picker
│       │   │   ├── ScreenerFilters.tsx   # Screener filter builder
│       │   │   └── AlertForm.tsx         # Alert creation form
│       │   │
│       │   ├── layout/                # Layout Components
│       │   │   ├── Sidebar.tsx
│       │   │   ├── Header.tsx
│       │   │   ├── Footer.tsx
│       │   │   ├── DashboardGrid.tsx    # Drag-and-drop grid
│       │   │   └── ThemeToggle.tsx       # Dark/light mode
│       │   │
│       │   └── common/                # Generic Shared Components
│       │       ├── LoadingSpinner.tsx
│       │       ├── ErrorBoundary.tsx
│       │       ├── EmptyState.tsx
│       │       ├── Modal.tsx
│       │       ├── Tooltip.tsx
│       │       └── ExportButton.tsx
│       │
│       ├── pages/                     # Page-Level Components
│       │   ├── Dashboard.tsx            # Main dashboard (customizable)
│       │   ├── StockDetail.tsx          # Individual stock deep-dive
│       │   ├── Screener.tsx             # Stock screener page
│       │   ├── Portfolio.tsx            # Portfolio tracker page
│       │   ├── Watchlist.tsx            # Watchlist management
│       │   ├── News.tsx                 # News aggregation page
│       │   ├── Compare.tsx              # Multi-stock comparison
│       │   ├── Alerts.tsx               # Alert management page
│       │   ├── Fundamentals.tsx         # Fundamental analysis page
│       │   ├── Heatmap.tsx              # Market heatmap page
│       │   ├── EconomicCalendar.tsx     # Economic events page
│       │   └── Settings.tsx             # User preferences
│       │
│       ├── hooks/                     # Custom React Hooks
│       │   ├── useOHLC.ts
│       │   ├── useCompany.ts
│       │   ├── useIndicators.ts
│       │   ├── useWebSocket.ts
│       │   ├── usePortfolio.ts
│       │   ├── useScreener.ts
│       │   ├── useDebounce.ts
│       │   └── useLocalStorage.ts
│       │
│       ├── store/                     # State Management (Zustand)
│       │   ├── index.ts
│       │   ├── dashboardStore.ts        # Dashboard layout state
│       │   ├── stockStore.ts            # Selected stock state
│       │   ├── portfolioStore.ts        # Portfolio state
│       │   ├── themeStore.ts            # Theme preferences
│       │   └── filterStore.ts           # Global filter state
│       │
│       ├── types/                     # TypeScript Definitions
│       │   ├── ohlc.ts
│       │   ├── company.ts
│       │   ├── fundamental.ts
│       │   ├── news.ts
│       │   ├── portfolio.ts
│       │   ├── chart.ts
│       │   ├── indicator.ts
│       │   └── api.ts
│       │
│       └── utils/                     # Frontend Utilities
│           ├── chartHelpers.ts
│           ├── formatters.ts
│           ├── dateUtils.ts
│           ├── colorScales.ts
│           └── constants.ts
│
└── scripts/                           # DevOps & Utility Scripts
    ├── seed_data.py                   # Database seeding
    ├── migrate.sh                     # Migration helper
    ├── backup_db.sh                   # Database backup
    └── setup.sh                       # First-time setup
```

---

## 🗄️ DATABASE SCHEMA DESIGN

### Guiding Principles
- Use **UUID** primary keys for all new tables (existing tables may use serial IDs)
- All timestamps in **UTC** with timezone
- Use **indexes** on frequently queried columns (symbol, date, sector)
- Use **foreign keys** with proper cascade rules
- Design for **partitioning** on date columns for large OHLC tables
- **Soft deletes** using `is_active` / `deleted_at` columns

### Existing Tables (CONNECT — DO NOT RECREATE)
The PostgreSQL database already contains OHLC data. Claude Code must:
1. **Introspect** the existing schema using `\dt`, `\d table_name` or SQLAlchemy reflection
2. **Map** existing tables to SQLAlchemy models using `automap` or manual mapping
3. **Never drop or alter** existing tables without explicit user confirmation
4. Create **new tables alongside** existing ones

### New Tables to Create

```sql
-- Company Master (if not already present)
CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    sector VARCHAR(100),
    industry VARCHAR(100),
    market_cap DECIMAL(20,2),
    exchange VARCHAR(50),
    country VARCHAR(50) DEFAULT 'India',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_companies_symbol ON companies(symbol);
CREATE INDEX idx_companies_sector ON companies(sector);

-- Fundamental Data
CREATE TABLE fundamentals (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    fiscal_year VARCHAR(10),
    fiscal_quarter VARCHAR(5),
    report_date DATE,
    revenue DECIMAL(20,2),
    net_income DECIMAL(20,2),
    eps DECIMAL(10,4),
    pe_ratio DECIMAL(10,4),
    pb_ratio DECIMAL(10,4),
    debt_to_equity DECIMAL(10,4),
    roe DECIMAL(10,4),
    roa DECIMAL(10,4),
    current_ratio DECIMAL(10,4),
    dividend_yield DECIMAL(10,4),
    book_value DECIMAL(15,4),
    free_cash_flow DECIMAL(20,2),
    operating_margin DECIMAL(10,4),
    net_margin DECIMAL(10,4),
    gross_margin DECIMAL(10,4),
    ebitda DECIMAL(20,2),
    total_assets DECIMAL(20,2),
    total_liabilities DECIMAL(20,2),
    shares_outstanding BIGINT,
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_fundamentals_company ON fundamentals(company_id);
CREATE INDEX idx_fundamentals_date ON fundamentals(report_date);

-- News Articles
CREATE TABLE news_articles (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT,
    source VARCHAR(255),
    author VARCHAR(255),
    url TEXT UNIQUE,
    image_url TEXT,
    published_at TIMESTAMPTZ,
    sentiment_score DECIMAL(5,4),       -- -1.0 to 1.0
    sentiment_label VARCHAR(20),         -- positive/negative/neutral
    category VARCHAR(100),
    fetched_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_news_published ON news_articles(published_at);

-- News-Company Association (many-to-many)
CREATE TABLE news_company_mentions (
    id SERIAL PRIMARY KEY,
    news_id INTEGER REFERENCES news_articles(id) ON DELETE CASCADE,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    relevance_score DECIMAL(5,4),
    UNIQUE(news_id, company_id)
);

-- User Portfolios
CREATE TABLE portfolios (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Portfolio Holdings
CREATE TABLE portfolio_holdings (
    id SERIAL PRIMARY KEY,
    portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE CASCADE,
    company_id INTEGER REFERENCES companies(id),
    quantity DECIMAL(15,4) NOT NULL,
    buy_price DECIMAL(15,4) NOT NULL,
    buy_date DATE NOT NULL,
    sell_price DECIMAL(15,4),
    sell_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Watchlists
CREATE TABLE watchlists (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE watchlist_items (
    id SERIAL PRIMARY KEY,
    watchlist_id INTEGER REFERENCES watchlists(id) ON DELETE CASCADE,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    UNIQUE(watchlist_id, company_id)
);

-- Price Alerts
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,      -- price_above, price_below, volume_spike, percent_change, etc.
    condition JSONB NOT NULL,              -- flexible condition storage
    is_triggered BOOLEAN DEFAULT FALSE,
    triggered_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Saved Screener Configurations
CREATE TABLE saved_screeners (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    filters JSONB NOT NULL,               -- serialized filter conditions
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Economic Calendar Events
CREATE TABLE economic_events (
    id SERIAL PRIMARY KEY,
    event_name VARCHAR(255) NOT NULL,
    country VARCHAR(50),
    event_date TIMESTAMPTZ NOT NULL,
    impact VARCHAR(20),                    -- high, medium, low
    actual VARCHAR(50),
    forecast VARCHAR(50),
    previous VARCHAR(50),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dashboard Layout Config (per-user customizable)
CREATE TABLE dashboard_layouts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) DEFAULT 'Default',
    layout_config JSONB NOT NULL,          -- widget positions, sizes, types
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🛠️ TECHNOLOGY STACK

### Backend
| Component | Technology | Notes |
|-----------|-----------|-------|
| Language | Python 3.11+ | Type hints everywhere |
| Framework | FastAPI | Async, auto-docs, validation |
| ORM | SQLAlchemy 2.0 | Async mode with asyncpg |
| Database | PostgreSQL 15+ | Existing PgAdmin setup |
| Migrations | Alembic | Auto-generate from models |
| Caching | Redis | Query caching, rate limiting |
| Task Queue | Celery + Redis | Background jobs |
| Validation | Pydantic v2 | Request/response schemas |
| Testing | pytest + httpx | Async test client |

### Frontend
| Component | Technology | Notes |
|-----------|-----------|-------|
| Framework | React 18 + TypeScript | Strict mode |
| Build Tool | Vite | Fast HMR |
| Styling | Tailwind CSS + shadcn/ui | Dark mode support |
| Charts | Lightweight Charts (TradingView) | Primary chart library |
| Alt Charts | Recharts / D3.js | For non-financial charts |
| State | Zustand | Lightweight store |
| Data Fetching | TanStack Query (React Query) | Cache, retry, pagination |
| Tables | TanStack Table | Sorting, filtering, virtualizing |
| Drag & Drop | react-grid-layout | Dashboard customization |
| Routing | React Router v6 | Nested routes |
| Forms | React Hook Form + Zod | Validation |
| Export | html2canvas + jsPDF | Chart/report export |

### DevOps
| Component | Technology |
|-----------|-----------|
| Containers | Docker + docker-compose |
| Reverse Proxy | Nginx (optional) |
| CI/CD | GitHub Actions |
| Monitoring | Prometheus + Grafana (future) |

---

## 🔑 CODING STANDARDS & CONVENTIONS

### Python (Backend)
- **Always use type hints** on all function parameters and return types
- **Async by default** — use `async def` for all API endpoints and DB operations
- **Docstrings** on all public functions (Google style)
- **Pydantic models** for all API input/output — never raw dicts
- **Service layer pattern** — API routes call services, services call DB
- **Environment variables** for all secrets and config — never hardcoded
- **Logging** with `structlog` — structured JSON logs
- **Error handling** — custom exception classes, global exception handler

### TypeScript (Frontend)
- **Strict TypeScript** — no `any` types, ever
- **Functional components** only — no class components
- **Custom hooks** for all data fetching and business logic
- **Props interfaces** defined in the same file or in `types/`
- **Named exports** — no default exports except pages
- **Memoization** — use `useMemo` / `useCallback` for expensive operations
- **Error boundaries** around every major section

### Git Conventions
- **Branch naming:** `feature/`, `fix/`, `refactor/`, `chore/`
- **Commit messages:** Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`)
- **PRs:** Always describe what + why

---

## 🚀 DEVELOPMENT PHASES

### Phase 1: Foundation (CURRENT)
- [x] Connect to existing PostgreSQL OHLC database
- [ ] Backend: FastAPI project setup with OHLC endpoints
- [ ] Frontend: React project setup with routing
- [ ] Candlestick chart with volume
- [ ] Line chart, area chart views
- [ ] OHLC data table with sorting/filtering
- [ ] Company selector with search
- [ ] Date range picker
- [ ] Timeframe selector (daily, weekly, monthly)
- [ ] Basic dashboard layout with sidebar

### Phase 2: Technical Analysis
- [ ] Moving Averages (SMA, EMA — 5, 10, 20, 50, 100, 200)
- [ ] RSI (Relative Strength Index)
- [ ] MACD (Moving Average Convergence Divergence)
- [ ] Bollinger Bands
- [ ] Stochastic Oscillator
- [ ] Average True Range (ATR)
- [ ] Volume Weighted Average Price (VWAP)
- [ ] On-Balance Volume (OBV)
- [ ] Fibonacci Retracement overlay
- [ ] Indicator picker panel (toggle on/off)
- [ ] Multi-pane chart layout (price + indicator sub-charts)

### Phase 3: Fundamental Data Integration
- [ ] Fundamental data tables (Income Statement, Balance Sheet, Cash Flow)
- [ ] Key ratio cards (PE, PB, ROE, Debt/Equity, etc.)
- [ ] Revenue & earnings growth charts
- [ ] Quarterly vs annual toggle
- [ ] Financial comparison across companies
- [ ] Fundamental data import pipeline (manual + API)
- [ ] SEC EDGAR integration (for US stocks)
- [ ] Intrinsic value calculator (DCF model)

### Phase 4: News API Integration
- [ ] NewsAPI / GNews integration
- [ ] Company-specific news feed
- [ ] General market news feed
- [ ] News sentiment analysis (NLP scoring)
- [ ] Sentiment trend chart overlay
- [ ] News impact on price visualization
- [ ] Breaking news alerts
- [ ] News category filtering

### Phase 5: Portfolio & Watchlist
- [ ] Create/manage multiple portfolios
- [ ] Add/remove holdings with buy price & date
- [ ] Portfolio performance tracking (P&L, returns)
- [ ] Portfolio allocation pie chart
- [ ] Portfolio vs benchmark comparison
- [ ] Dividend tracking
- [ ] Watchlist management
- [ ] Watchlist mini-charts and quick stats

### Phase 6: Stock Screener
- [ ] Multi-criteria filter builder (price, volume, market cap, ratios)
- [ ] Technical condition filters (above SMA, RSI oversold, etc.)
- [ ] Fundamental condition filters (PE < X, ROE > Y, etc.)
- [ ] Save/load screener presets
- [ ] Screener results table with sorting
- [ ] Export screener results
- [ ] Pre-built screener templates (value stocks, growth stocks, momentum)

### Phase 7: Alerts & Notifications
- [ ] Price-based alerts (above/below threshold)
- [ ] Percentage change alerts (daily, weekly)
- [ ] Volume spike alerts
- [ ] Technical signal alerts (golden cross, RSI extremes)
- [ ] News-based alerts (company mentioned)
- [ ] In-app notification center
- [ ] Email notifications (optional)
- [ ] Alert history log

### Phase 8: Comparison & Analytics
- [ ] Multi-stock overlay chart (normalized %)
- [ ] Side-by-side fundamental comparison
- [ ] Sector/industry performance heatmap
- [ ] Market breadth indicators
- [ ] Correlation matrix
- [ ] Beta calculation
- [ ] Relative strength comparison
- [ ] Sector rotation analysis

### Phase 9: Advanced Dashboard
- [ ] Drag-and-drop dashboard customization (react-grid-layout)
- [ ] Save/load multiple dashboard layouts
- [ ] Widget library (add/remove widgets)
- [ ] Dark mode / light mode / custom themes
- [ ] Dashboard sharing via URL
- [ ] Full-screen chart mode
- [ ] Keyboard shortcuts
- [ ] Print / export dashboard as PDF

### Phase 10: AI & Intelligence (Future)
- [ ] AI-powered stock summary (connect to LLM API)
- [ ] Natural language stock queries ("show me tech stocks with PE < 20")
- [ ] Automated pattern recognition (head & shoulders, flags, etc.)
- [ ] Predictive analytics (basic ML models)
- [ ] AI-generated daily market report
- [ ] Anomaly detection on price/volume
- [ ] Smart alerts (AI-detected unusual activity)

### Phase 11: Data Pipeline & Automation
- [ ] Automated daily OHLC data sync job
- [ ] Data quality checks and validation
- [ ] Historical data backfill tools
- [ ] Data export (CSV, Excel, JSON, PDF)
- [ ] API rate limiting and caching strategy
- [ ] Database performance optimization (indexes, partitioning)
- [ ] Backup and restore automation

### Phase 12: Multi-User & Auth (Future)
- [ ] User registration & login (JWT)
- [ ] Role-based access (admin, viewer)
- [ ] Per-user dashboards, portfolios, watchlists
- [ ] Activity audit log
- [ ] OAuth integration (Google, GitHub)

---

## ⚙️ ENVIRONMENT VARIABLES

```env
# Database
DATABASE_URL=postgresql+asyncpg://username:password@localhost:5432/stockvista
DATABASE_SYNC_URL=postgresql://username:password@localhost:5432/stockvista

# Redis
REDIS_URL=redis://localhost:6379/0

# News API
NEWS_API_KEY=your_newsapi_key_here
GNEWS_API_KEY=your_gnews_key_here

# External Data APIs
ALPHA_VANTAGE_API_KEY=your_key_here
YAHOO_FINANCE_ENABLED=true

# App Config
APP_ENV=development
APP_DEBUG=true
APP_HOST=0.0.0.0
APP_PORT=8000
FRONTEND_URL=http://localhost:5173

# Security
SECRET_KEY=your-secret-key-change-in-production
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Celery
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2
```

---

## 📐 API DESIGN PATTERNS

### Endpoint Conventions
```
GET    /api/v1/companies                    — List all companies
GET    /api/v1/companies/{symbol}           — Get single company
GET    /api/v1/ohlc/{symbol}                — Get OHLC data
GET    /api/v1/ohlc/{symbol}/indicators     — Get computed indicators
GET    /api/v1/fundamentals/{symbol}        — Get fundamental data
GET    /api/v1/news                         — Get news feed
GET    /api/v1/news/{symbol}                — Get company-specific news
POST   /api/v1/portfolio                    — Create portfolio
GET    /api/v1/portfolio/{id}               — Get portfolio details
POST   /api/v1/screener/run                 — Execute screen
GET    /api/v1/compare?symbols=A,B,C        — Compare stocks
```

### Standard Query Parameters
```
?start_date=2024-01-01
&end_date=2024-12-31
&interval=daily|weekly|monthly
&page=1
&page_size=50
&sort_by=date
&sort_order=desc
```

### Standard Response Envelope
```json
{
    "success": true,
    "data": { ... },
    "meta": {
        "total": 1000,
        "page": 1,
        "page_size": 50,
        "total_pages": 20
    },
    "errors": null
}
```

---

## 🎯 CRITICAL RULES FOR CLAUDE CODE

1. **NEVER delete or modify existing database tables** without explicit user approval
2. **Always introspect the existing DB schema first** before creating models
3. **Always use environment variables** for database credentials — never hardcode
4. **Always add proper error handling** — no bare exceptions
5. **Always add loading and error states** in the frontend
6. **Always make charts responsive** — they must work on all screen sizes
7. **Always include TypeScript types** — no implicit `any`
8. **Always paginate** large data responses
9. **Always add indexes** on columns used in WHERE, ORDER BY, JOIN
10. **Always cache expensive queries** (indicator calculations, aggregations)
11. **Always validate user input** on both frontend and backend
12. **Test database connection** before starting the application
13. **Use proper financial number formatting** (Indian ₹ or configurable locale)
14. **Handle market holidays and weekends** in date logic
15. **All chart colors must be accessible** (colorblind-friendly palette)

---

## 🎨 UI/UX GUIDELINES

### Color Palette
```css
/* Financial Standard Colors */
--color-bullish:    #22C55E;  /* Green — price up */
--color-bearish:    #EF4444;  /* Red — price down */
--color-neutral:    #6B7280;  /* Gray — no change */
--color-primary:    #3B82F6;  /* Blue — primary actions */
--color-accent:     #8B5CF6;  /* Purple — highlights */
--color-warning:    #F59E0B;  /* Amber — warnings */
--color-bg-dark:    #0F172A;  /* Dark mode background */
--color-bg-light:   #FFFFFF;  /* Light mode background */
--color-surface:    #1E293B;  /* Dark mode cards */
```

### Chart Defaults
- Candlestick: green (up) / red (down) with semi-transparent volume bars
- Line charts: blue primary, with distinct colors for overlays
- Grid: subtle, non-distracting
- Crosshair: enabled with price/time tooltip
- Default timeframe: 6 months daily
- Y-axis: right-aligned (financial convention)

### Layout Rules
- Sidebar: collapsible, 240px width
- Main content: fluid, min-width 768px
- Charts: minimum height 400px
- Tables: horizontal scroll on mobile
- Widgets: minimum 200x200px grid units
- Spacing: consistent 16px/24px padding

---

## 📝 WHEN STARTING A NEW FEATURE

Follow this checklist for every new feature:

1. **Read relevant sections** of CLAUDE.md and PROJECT_PROMPT.md
2. **Check existing DB schema** — don't duplicate tables/columns
3. **Create migration** if new tables/columns needed
4. **Backend first:** Model → Schema → Service → API route → Tests
5. **Frontend second:** Types → API client → Hook → Component → Page
6. **Add error handling** on both ends
7. **Add loading states** in the UI
8. **Test edge cases** (empty data, errors, large datasets)
9. **Update this CLAUDE.md** if architecture decisions change

---

## 🐛 TROUBLESHOOTING

| Issue | Fix |
|-------|-----|
| DB connection fails | Check `DATABASE_URL`, verify PgAdmin is running, check pg_hba.conf |
| Slow OHLC queries | Add indexes, check EXPLAIN ANALYZE, enable query caching |
| Chart not rendering | Check data format, ensure dates are ISO strings, check container size |
| CORS errors | Verify `CORS_ORIGINS` includes frontend URL |
| Migration conflicts | Check Alembic heads, merge if needed with `alembic merge heads` |
| Large CSV import slow | Use `COPY` command or bulk insert with `executemany` |
| WebSocket disconnects | Implement reconnection with exponential backoff |
