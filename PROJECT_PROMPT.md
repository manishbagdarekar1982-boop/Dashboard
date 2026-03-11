# PROJECT_PROMPT.md — StockVista Feature Specifications

> This document contains detailed specifications for every feature. Claude Code should reference this when implementing any feature from the development phases listed in CLAUDE.md.

---

## 🏗️ INITIAL SETUP INSTRUCTIONS

### Step 0: Database Discovery (MUST DO FIRST)

Before writing any code, Claude Code must discover the existing database schema:

```bash
# Connect to PostgreSQL and inspect
psql $DATABASE_URL -c "\dt"                          # List all tables
psql $DATABASE_URL -c "\d+ your_ohlc_table_name"     # Describe OHLC table
psql $DATABASE_URL -c "SELECT * FROM your_ohlc_table LIMIT 5;"  # Sample data
psql $DATABASE_URL -c "SELECT COUNT(*) FROM your_ohlc_table;"   # Data volume
psql $DATABASE_URL -c "SELECT DISTINCT symbol FROM your_ohlc_table LIMIT 20;"  # Available symbols
```

**Map the existing columns** to the application's expected format:
| Expected Field | Possible Existing Column Names |
|---------------|-------------------------------|
| symbol | symbol, ticker, stock_code, scrip_code, company_code |
| date | date, trade_date, timestamp, datetime |
| open | open, open_price, o |
| high | high, high_price, h |
| low | low, low_price, l |
| close | close, close_price, c, ltp |
| volume | volume, vol, traded_qty, total_traded_quantity |
| adjusted_close | adj_close, adjusted_close, adj_close_price |

**Create a mapping config** in `backend/config.py`:
```python
# Auto-detected or manually configured column mapping
OHLC_COLUMN_MAP = {
    "symbol": "detected_column_name",
    "date": "detected_column_name",
    "open": "detected_column_name",
    "high": "detected_column_name",
    "low": "detected_column_name",
    "close": "detected_column_name",
    "volume": "detected_column_name",
}
```

### Step 1: Backend Initialization

```bash
mkdir -p backend/{models,schemas,api/v1,services,integrations,tasks,utils,tests}
cd backend
python -m venv venv
source venv/bin/activate
pip install fastapi uvicorn sqlalchemy[asyncio] asyncpg alembic pydantic python-dotenv redis celery httpx pandas numpy structlog
pip freeze > requirements.txt
```

### Step 2: Frontend Initialization

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install @tanstack/react-query @tanstack/react-table zustand react-router-dom
npm install lightweight-charts recharts d3
npm install react-grid-layout react-hook-form @hookform/resolvers zod
npm install tailwindcss @tailwindcss/forms autoprefixer postcss
npm install lucide-react date-fns axios
npm install -D @types/react-grid-layout @types/d3
```

---

## 📊 FEATURE SPECIFICATIONS

---

### F1: OHLC Data Visualization (Phase 1)

#### F1.1: Candlestick Chart
**Description:** Interactive candlestick chart as the primary visualization.

**Requirements:**
- Use TradingView's `lightweight-charts` library
- Green candle for close > open, red for close < open
- Volume bars at the bottom (semi-transparent, matching candle color)
- Crosshair with price and date tooltip
- Y-axis on right side (financial standard)
- X-axis with intelligent date labels (skip weekends/holidays)
- Zoom: mouse wheel and pinch gesture
- Pan: click and drag
- Reset zoom button
- Auto-scale Y-axis to visible data range

**Data Format (API → Chart):**
```typescript
interface OHLCDataPoint {
    time: string;      // "2024-01-15" (ISO date)
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}
```

**API Endpoint:**
```
GET /api/v1/ohlc/{symbol}?start_date=2024-01-01&end_date=2024-12-31&interval=daily
```

**Response:**
```json
{
    "success": true,
    "data": {
        "symbol": "RELIANCE",
        "company_name": "Reliance Industries Ltd",
        "interval": "daily",
        "ohlc": [
            {
                "date": "2024-01-15",
                "open": 2450.50,
                "high": 2478.00,
                "low": 2442.10,
                "close": 2465.75,
                "volume": 8542100
            }
        ]
    },
    "meta": { "total_records": 245, "start_date": "2024-01-01", "end_date": "2024-12-31" }
}
```

#### F1.2: Line Chart View
- Toggle between candlestick and line chart
- Line based on close price
- Smooth line with area fill (gradient)
- Same zoom/pan capabilities

#### F1.3: OHLC Data Table
- Columns: Date, Open, High, Low, Close, Volume, Change, Change%
- Sortable by any column
- Color-coded change column (green/red)
- Pagination (50 rows default)
- Export button (CSV, Excel)
- Search/filter by date range
- Show daily range bar (visual min-max)

#### F1.4: Timeframe & Interval Controls
- **Intervals:** 1D, 1W, 1M (from aggregated data)
- **Quick ranges:** 1M, 3M, 6M, YTD, 1Y, 2Y, 5Y, MAX
- **Custom date range** picker
- Controls should be in a toolbar above the chart
- Active interval/range should be visually highlighted

#### F1.5: Company Selector
- Searchable dropdown with autocomplete
- Search by symbol OR company name
- Show symbol + name in dropdown options
- Recently viewed companies list (persist in localStorage)
- Keyboard navigation (arrow keys + enter)
- Debounced search (300ms)

**API Endpoint:**
```
GET /api/v1/companies/search?q=reli&limit=10
```

---

### F2: Technical Indicators (Phase 2)

#### F2.1: Moving Averages
**Supported Types:**
- SMA (Simple Moving Average): periods 5, 10, 20, 50, 100, 200
- EMA (Exponential Moving Average): periods 5, 10, 20, 50, 100, 200
- WMA (Weighted Moving Average)

**Backend Calculation:**
```python
# Calculate in the service layer using pandas
def calculate_sma(prices: pd.Series, period: int) -> pd.Series:
    return prices.rolling(window=period).mean()

def calculate_ema(prices: pd.Series, period: int) -> pd.Series:
    return prices.ewm(span=period, adjust=False).mean()
```

**Frontend Display:**
- Overlay on main price chart as colored lines
- Each MA in a different color from the accessible palette
- Toggle individual MAs on/off via indicator panel
- Show MA value in crosshair tooltip
- Highlight golden cross (50 SMA crosses above 200 SMA) and death cross

#### F2.2: RSI (Relative Strength Index)
- Display as sub-chart below main chart
- Default period: 14
- Y-axis: 0–100
- Horizontal lines at 30 (oversold) and 70 (overbought)
- Color zones: red above 70, green below 30, neutral in between
- Configurable period via settings

#### F2.3: MACD
- Display as sub-chart
- MACD line (blue), Signal line (orange), Histogram (green/red bars)
- Default: 12, 26, 9
- Zero line reference
- Histogram color: green when MACD > Signal, red when below

#### F2.4: Bollinger Bands
- Overlay on main chart
- Upper band, middle band (SMA), lower band
- Shaded area between bands (semi-transparent)
- Default: 20 period, 2 standard deviations
- Configurable period and std dev multiplier

#### F2.5: Additional Indicators
- **Stochastic Oscillator:** %K and %D lines, sub-chart, 80/20 zones
- **ATR (Average True Range):** Sub-chart, default 14 period
- **VWAP:** Overlay on intraday charts (recalculates each session)
- **OBV (On-Balance Volume):** Sub-chart, cumulative volume indicator
- **ADX (Average Directional Index):** Sub-chart, trend strength
- **Ichimoku Cloud:** Full cloud overlay with Tenkan, Kijun, Senkou A/B, Chikou

#### F2.6: Indicator Control Panel
- Collapsible sidebar panel or modal
- Grouped by category: Trend, Momentum, Volatility, Volume
- Toggle switch for each indicator
- Settings icon next to each for parameter customization
- "Reset to defaults" button
- Save indicator presets

**API Endpoint:**
```
GET /api/v1/ohlc/{symbol}/indicators?indicators=sma_20,sma_50,ema_20,rsi_14,macd,bollinger&start_date=2024-01-01&end_date=2024-12-31
```

---

### F3: Fundamental Data (Phase 3)

#### F3.1: Financial Statements View
- **Income Statement:** Revenue, Cost of Goods, Gross Profit, Operating Income, Net Income, EPS
- **Balance Sheet:** Total Assets, Total Liabilities, Equity, Cash, Debt
- **Cash Flow:** Operating CF, Investing CF, Financing CF, Free Cash Flow

**Display Format:**
- Table with years as columns, line items as rows
- Toggle between annual and quarterly view
- Highlight YoY growth (green up, red down)
- Expandable rows for sub-categories
- Bar chart for revenue/earnings trend

#### F3.2: Key Ratios Dashboard
Display as a grid of metric cards:
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ PE Ratio     │ │ PB Ratio     │ │ ROE          │ │ ROA          │
│ 24.5x        │ │ 3.2x         │ │ 18.4%        │ │ 8.2%         │
│ vs Sector 22x│ │ vs Sector 2.8│ │ ↑ from 16.2% │ │ ↑ from 7.5%  │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

**Ratios to Include:**
PE, PB, PS (Price/Sales), EV/EBITDA, Debt/Equity, Current Ratio, Quick Ratio, ROE, ROA, ROCE, Operating Margin, Net Margin, Gross Margin, Dividend Yield, Payout Ratio, Interest Coverage, Asset Turnover, Inventory Turnover

#### F3.3: Fundamental Data Import
- Manual CSV/Excel upload for fundamental data
- API integration with financial data providers
- Scheduled sync for automatic updates
- Data validation rules (no negative PE for profitable companies, etc.)
- Duplicate detection and merge strategy

#### F3.4: DCF (Discounted Cash Flow) Calculator
- Interactive inputs: growth rate, discount rate, terminal growth, years
- Sensitivity analysis table (grid of growth vs. discount rates)
- Comparison: calculated intrinsic value vs. current price
- Save assumptions per company

---

### F4: News Integration (Phase 4)

#### F4.1: News Feed
- **Sources:** NewsAPI, GNews API, RSS feeds from financial sites
- Company-specific news filtered by ticker/name mentions
- General market news section
- Real-time updates (polling every 5 minutes or WebSocket)
- News card layout: headline, source, time ago, thumbnail
- Click to open original article in new tab

**API Endpoint:**
```
GET /api/v1/news?symbol=RELIANCE&page=1&page_size=20
GET /api/v1/news/market?category=business&page=1&page_size=20
```

#### F4.2: Sentiment Analysis
- Process each article through sentiment analysis
- Score range: -1.0 (very negative) to +1.0 (very positive)
- Display sentiment badge on news cards (🟢 🟡 🔴)
- Aggregate sentiment trend chart per company
- Overlay sentiment on price chart

**Backend Pipeline:**
```python
# Use TextBlob or a financial sentiment model
from textblob import TextBlob

def analyze_sentiment(text: str) -> dict:
    blob = TextBlob(text)
    score = blob.sentiment.polarity
    label = "positive" if score > 0.1 else "negative" if score < -0.1 else "neutral"
    return {"score": round(score, 4), "label": label}
```

#### F4.3: News-Company Association
- NLP-based entity extraction to identify mentioned companies
- Relevance scoring (headline mention = high, body mention = medium)
- Tag each article with related company symbols
- Enable "Related News" section on stock detail page

---

### F5: Portfolio Tracker (Phase 5)

#### F5.1: Portfolio Management
- Create multiple portfolios (e.g., "Long Term", "Trading", "Mutual Funds")
- Add holdings: symbol, quantity, buy price, buy date
- Record sell transactions
- Support for partial sells
- Notes field per transaction

#### F5.2: Portfolio Analytics Dashboard
```
┌──────────────────────────────────────────────────────┐
│ Portfolio: Long Term Investments                      │
│ Total Value: ₹15,42,350    Invested: ₹12,00,000     │
│ Total P&L:  ₹3,42,350 (+28.5%)                      │
│ Today:      ₹12,450 (+0.8%)                          │
├───────────┬──────────┬──────────┬────────┬───────────┤
│ Symbol    │ Qty      │ Avg Cost │ CMP    │ P&L       │
│ RELIANCE  │ 50       │ 2,400    │ 2,650  │ +12,500   │
│ TCS       │ 30       │ 3,200    │ 3,850  │ +19,500   │
│ INFY      │ 100      │ 1,450    │ 1,620  │ +17,000   │
└───────────┴──────────┴──────────┴────────┴───────────┘
```

**Calculations:**
- Current value = quantity × latest close price
- P&L = current value - invested value
- P&L % = (P&L / invested) × 100
- XIRR (annualized return considering timing of investments)
- Day change = sum of (quantity × today's change) for all holdings

#### F5.3: Portfolio Visualization
- **Allocation pie chart:** by stock, by sector
- **Performance line chart:** portfolio value over time vs benchmark (Nifty 50)
- **Treemap:** holdings sized by value, colored by daily change
- **P&L waterfall chart:** contribution of each stock to total P&L

---

### F6: Stock Screener (Phase 6)

#### F6.1: Filter Builder UI
Visual filter builder with add/remove conditions:
```
┌─────────────────────────────────────────────────┐
│ Stock Screener                                   │
│                                                   │
│ [+ Add Filter]                                    │
│                                                   │
│ 🔽 Market Cap      is between  [1000 Cr] - [∞]   │
│ 🔽 PE Ratio        is less than      [25]         │
│ 🔽 ROE             is greater than   [15%]        │
│ 🔽 Price vs 52W H  is within         [10%]        │
│ 🔽 Sector          is one of  [IT, Pharma]        │
│                                                   │
│ [Run Screener]  [Save as Preset]  [Reset]         │
└─────────────────────────────────────────────────┘
```

#### F6.2: Available Filters

**Price Filters:**
- Current price range
- 52-week high/low proximity
- Price change % (1D, 1W, 1M, 3M, 6M, 1Y)
- Above/below moving average (SMA 50, SMA 200)
- Near all-time high/low

**Volume Filters:**
- Average volume range
- Volume spike (today vs avg)
- Delivery percentage (for Indian markets)

**Fundamental Filters:**
- Market cap range
- PE, PB, PS, EV/EBITDA ranges
- ROE, ROA, ROCE ranges
- Debt/Equity range
- Revenue growth %, profit growth %
- Dividend yield range
- Promoter holding % (for Indian markets)

**Technical Filters:**
- RSI range (oversold < 30, overbought > 70)
- MACD crossover (bullish/bearish)
- Bollinger Band position (above/below/inside)
- Golden cross / death cross occurred in last N days

**API Endpoint:**
```
POST /api/v1/screener/run
{
    "filters": [
        { "field": "market_cap", "operator": "gte", "value": 10000 },
        { "field": "pe_ratio", "operator": "lte", "value": 25 },
        { "field": "roe", "operator": "gte", "value": 0.15 },
        { "field": "sector", "operator": "in", "value": ["IT", "Pharma"] }
    ],
    "sort_by": "market_cap",
    "sort_order": "desc",
    "page": 1,
    "page_size": 50
}
```

#### F6.3: Pre-built Screener Templates
- **Value Stocks:** Low PE, low PB, high dividend yield
- **Growth Stocks:** High revenue growth, high ROE, expanding margins
- **Momentum:** Near 52W high, above SMA200, high RSI
- **Defensive:** Low beta, high dividend, low debt
- **Turnaround:** Price near 52W low, improving fundamentals
- **Quality:** High ROE, low debt, consistent earnings

---

### F7: Alerts System (Phase 7)

#### F7.1: Alert Types
```python
class AlertType(Enum):
    PRICE_ABOVE = "price_above"          # Price crosses above threshold
    PRICE_BELOW = "price_below"          # Price drops below threshold
    PERCENT_CHANGE_UP = "pct_up"         # Daily gain exceeds X%
    PERCENT_CHANGE_DOWN = "pct_down"     # Daily loss exceeds X%
    VOLUME_SPIKE = "volume_spike"        # Volume > X times average
    SMA_CROSS_ABOVE = "sma_cross_up"    # Price crosses above SMA
    SMA_CROSS_BELOW = "sma_cross_down"  # Price crosses below SMA
    RSI_OVERSOLD = "rsi_oversold"        # RSI drops below 30
    RSI_OVERBOUGHT = "rsi_overbought"   # RSI rises above 70
    NEW_52W_HIGH = "52w_high"            # New 52-week high
    NEW_52W_LOW = "52w_low"              # New 52-week low
    NEWS_MENTION = "news_mention"        # Company mentioned in news
    EARNINGS_DATE = "earnings"           # Earnings date approaching
```

#### F7.2: Alert Evaluation Engine
- Background Celery task runs every 5 minutes during market hours
- Batch-evaluate all active alerts against latest data
- Mark triggered alerts and log trigger time
- Support one-time and recurring alerts
- Alert cooldown period (don't re-trigger same alert within N hours)

#### F7.3: Notification Delivery
- **In-app:** Notification bell icon with badge count, dropdown panel
- **Browser:** Push notifications (with permission)
- **Email:** Optional, configurable per-alert (future)

---

### F8: Multi-Stock Comparison (Phase 8)

#### F8.1: Price Comparison Chart
- Select 2–5 stocks to compare
- Normalize to percentage change from start date (base = 0%)
- Each stock as a different colored line
- Shared crosshair showing all values
- Date range selector
- Toggle between % change and absolute price

#### F8.2: Fundamental Comparison Table
- Side-by-side columns for each company
- Rows: all key metrics (PE, PB, ROE, margins, growth, etc.)
- Color highlight: best value in green, worst in red
- Radar/spider chart for visual comparison
- Sector average column for reference

#### F8.3: Sector Heatmap
- Treemap visualization: rectangles sized by market cap
- Color: daily % change (green to red gradient)
- Group by sector → industry → company
- Click to drill down
- Tooltip with key stats
- Time toggle: 1D, 1W, 1M, 3M, 1Y change

---

### F9: Dashboard Customization (Phase 9)

#### F9.1: Widget System
Available widgets for the dashboard grid:
```typescript
type WidgetType =
    | "candlestick_chart"     // Full OHLC chart
    | "mini_chart"            // Sparkline for a stock
    | "stock_ticker"          // Scrolling ticker tape
    | "market_overview"       // Index summary cards
    | "top_movers"            // Gainers & losers table
    | "news_feed"             // Latest headlines
    | "watchlist"             // Quick watchlist view
    | "portfolio_summary"     // Portfolio P&L card
    | "alerts_panel"          // Active alerts
    | "sector_heatmap"        // Sector performance map
    | "volume_leaders"        // Highest volume stocks
    | "stat_card"             // Single metric display
    | "economic_calendar"     // Upcoming events
    | "recent_trades"         // Recent portfolio transactions
    | "comparison_mini"       // Mini comparison chart
```

#### F9.2: Drag & Drop Layout
- Use `react-grid-layout` for drag-and-drop widget positioning
- Responsive breakpoints: lg (1200px), md (996px), sm (768px)
- Widget resize handles
- Snap-to-grid behavior
- Lock/unlock layout toggle
- "Add Widget" button opens widget picker
- "Remove Widget" X button on each widget

#### F9.3: Layout Persistence
- Save layout to database (dashboard_layouts table)
- Support multiple saved layouts
- Default layout for new users
- Import/export layout as JSON

---

### F10: Data Export & Sharing (Phase 9)

#### F10.1: Export Options
- **CSV:** OHLC data, screener results, portfolio holdings
- **Excel (.xlsx):** Formatted tables with headers and styling
- **PDF:** Chart screenshots with data summary
- **JSON:** Raw data for developers
- **Image (PNG):** Chart screenshot only

#### F10.2: Export API
```
GET /api/v1/ohlc/{symbol}/export?format=csv&start_date=2024-01-01&end_date=2024-12-31
GET /api/v1/screener/export?format=xlsx&screener_id=5
GET /api/v1/portfolio/{id}/export?format=pdf
```

---

### F11: Performance Optimization

#### F11.1: Backend Optimizations
- **Database indexes:** On (symbol, date) composite index for OHLC table
- **Query optimization:** Use EXPLAIN ANALYZE, avoid N+1 queries
- **Connection pooling:** SQLAlchemy pool with 10 min, 50 max connections
- **Redis caching:** Cache indicator calculations (TTL: 5 min during market, 1 hour after)
- **Pagination:** Cursor-based for large datasets
- **Compression:** gzip response compression for large payloads
- **Table partitioning:** Partition OHLC by year or symbol range for large datasets

#### F11.2: Frontend Optimizations
- **Virtualized lists:** Use TanStack Virtual for large tables
- **Lazy loading:** Load charts only when visible (Intersection Observer)
- **Code splitting:** Route-based code splitting with React.lazy
- **Memoization:** useMemo for chart data transformations
- **Debounced inputs:** Search, filters (300ms debounce)
- **Web Workers:** Offload heavy indicator calculations
- **Service Worker:** Cache static assets for offline shell

---

### F12: Economic Calendar (Phase 8)

#### F12.1: Calendar View
- Monthly calendar view with event dots
- List view for upcoming events
- Filter by country (India, US, Global)
- Filter by impact (High, Medium, Low)
- Events: RBI policy, Fed decisions, GDP, inflation, earnings dates
- Color coding by impact level
- Countdown timer for upcoming high-impact events

---

### F13: Stock Detail Page (Comprehensive Single-Stock View)

The stock detail page is the deep-dive view when a user clicks on any company. It combines all available data into a single, comprehensive page.

#### Layout:
```
┌────────────────────────────────────────────────────────────┐
│ RELIANCE (₹2,650.75)  ↑₹32.50 (+1.24%)  Vol: 85.4L      │
│ Reliance Industries Limited | Energy | NSE                  │
├────────────────────────────────────────────────────────────┤
│ [Chart]  [Financials]  [News]  [Technicals]  [Peers]      │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────────── MAIN CHART AREA ──────────────────┐     │
│  │  Candlestick + Volume + Selected Indicators       │     │
│  │  [1D] [1W] [1M] [3M] [6M] [YTD] [1Y] [5Y] [MAX]│     │
│  └───────────────────────────────────────────────────┘     │
│                                                            │
│  ┌── Key Stats ──┐  ┌── About ───────────────────────┐    │
│  │ Open: 2,620    │  │ Market Cap: 18,00,000 Cr       │    │
│  │ High: 2,658    │  │ PE: 24.5  │  52W H: 2,800     │    │
│  │ Low:  2,615    │  │ PB: 3.1   │  52W L: 2,100     │    │
│  │ Prev: 2,618    │  │ Div Yield: 0.38%               │    │
│  └────────────────┘  └────────────────────────────────┘    │
│                                                            │
│  ┌── Recent News ─────────────────────────────────────┐    │
│  │ 🟢 Reliance Q3 results beat estimates...   2h ago  │    │
│  │ 🟡 Jio Platforms exploring AI ventures...  5h ago  │    │
│  │ 🔴 Oil prices decline impacts refining...  1d ago  │    │
│  └────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────┘
```

---

## 🔌 EXTERNAL API INTEGRATION SPECS

### NewsAPI
```python
# https://newsapi.org/
BASE_URL = "https://newsapi.org/v2"
ENDPOINTS = {
    "everything": "/everything",       # Search all articles
    "top_headlines": "/top-headlines",  # Breaking news
}
# Rate limit: 100 requests/day (free), 250K/month (paid)
# Parameters: q (query), from, to, sortBy, language, pageSize
```

### GNews API
```python
# https://gnews.io/
BASE_URL = "https://gnews.io/api/v4"
ENDPOINTS = {
    "search": "/search",
    "top_headlines": "/top-headlines",
}
# Rate limit: 100 requests/day (free)
# Parameters: q, lang, country, max, from, to, in (title/description/content)
```

### Alpha Vantage (Optional)
```python
# https://www.alphavantage.co/
# For US stocks fundamental data
# Endpoints: TIME_SERIES_DAILY, OVERVIEW, INCOME_STATEMENT, BALANCE_SHEET, CASH_FLOW
# Rate limit: 5 calls/min, 500/day (free)
```

### SEC EDGAR (Optional, US Stocks)
```python
# https://www.sec.gov/cgi-bin/browse-edgar
# 10-K (annual), 10-Q (quarterly) filings
# Free, no API key needed, but respect rate limits (10 req/sec)
```

---

## 🧪 TESTING STRATEGY

### Backend Tests
```python
# tests/conftest.py
@pytest.fixture
async def test_db():
    """Create a test database with sample data."""
    # Use a separate test database or in-memory SQLite
    pass

@pytest.fixture
def sample_ohlc_data():
    """Generate realistic OHLC test data."""
    return [
        {"date": "2024-01-01", "open": 100, "high": 105, "low": 98, "close": 103, "volume": 1000000},
        # ... more data points
    ]
```

**Test Coverage Requirements:**
- API endpoints: 90%+ coverage
- Service layer: 95%+ coverage
- Indicator calculations: 100% coverage (verified against known values)
- Edge cases: empty data, single data point, weekends, market holidays

### Frontend Tests
- Component tests with React Testing Library
- Hook tests with `@testing-library/react-hooks`
- Chart rendering tests (snapshot tests)
- Form validation tests
- API mock tests with MSW (Mock Service Worker)

---

## 📱 RESPONSIVE DESIGN BREAKPOINTS

```css
/* Tailwind breakpoints */
sm:  640px   /* Mobile landscape */
md:  768px   /* Tablet */
lg:  1024px  /* Laptop */
xl:  1280px  /* Desktop */
2xl: 1536px  /* Large desktop */
```

**Mobile Adaptations:**
- Sidebar becomes bottom navigation on mobile
- Charts: full-width, minimum 300px height
- Tables: horizontal scroll with sticky first column
- Dashboard: single-column stack instead of grid
- Modals: full-screen on mobile

---

## 🌍 LOCALIZATION & FORMATTING

### Number Formatting (Indian by Default)
```typescript
// Indian number system: 1,00,000 instead of 100,000
const formatIndianNumber = (num: number): string => {
    return num.toLocaleString('en-IN');
};

// Currency formatting
const formatCurrency = (num: number): string => {
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
};

// Large numbers: 1.5 Cr, 2.3K, 45.6L
const formatCompact = (num: number): string => {
    if (num >= 1e7) return `${(num / 1e7).toFixed(2)} Cr`;
    if (num >= 1e5) return `${(num / 1e5).toFixed(2)} L`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)} K`;
    return num.toString();
};
```

### Date Formatting
- Display: "15 Jan 2024" or "Jan 15, 2024" (configurable)
- API: ISO 8601 format "2024-01-15"
- Charts: Abbreviated months "Jan", "Feb", etc.
- Relative: "2h ago", "Yesterday", "3 days ago"

---

## ⚡ QUICK-START COMMANDS (for Claude Code)

```bash
# Start backend
cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Start frontend
cd frontend && npm run dev

# Run migrations
cd backend && alembic upgrade head

# Create new migration
cd backend && alembic revision --autogenerate -m "description"

# Run tests
cd backend && pytest -v
cd frontend && npm test

# Start Redis (for caching & Celery)
redis-server

# Start Celery worker
cd backend && celery -A tasks.celery_app worker --loglevel=info

# Start Celery beat (scheduler)
cd backend && celery -A tasks.celery_app beat --loglevel=info

# Database backup
pg_dump -U username -d stockvista > backup_$(date +%Y%m%d).sql
```

---

## 📌 REMINDERS FOR CLAUDE CODE

1. **Always read CLAUDE.md first** at the start of every session
2. **Check existing DB schema** before creating any models
3. **Follow the phase order** — don't jump ahead unless explicitly asked
4. **Each feature = branch** — create a git branch for each feature
5. **Backend first, frontend second** — always build API before UI
6. **Test as you go** — write tests alongside implementation
7. **Commit frequently** with descriptive conventional commit messages
8. **Ask for clarification** if the DB schema doesn't match expectations
9. **Indian market context** — default to ₹, NSE/BSE, Indian number formatting
10. **Performance matters** — profile queries, use indexes, cache aggressively
