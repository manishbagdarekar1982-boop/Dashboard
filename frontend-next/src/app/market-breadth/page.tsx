'use client';

import { useState, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';
import { useMBCharts, useMBTables, useMBScreeners, useMBIndex, useMBShareholding } from '@/hooks/useMarketBreadth';
import type {
  BreadthPoint, ReturnRow, VwapStockRow, ScreenerRow,
  SectorEmaRow, DailyMovesRow, Stock52wRow,
  IndexDistRow, IndexChangeRow, ShareholdingMoverRow,
} from '@/types/marketBreadth';

/* ────────────────── helpers ────────────────── */

function useChartStyles() {
  const theme = useThemeStore((s) => s.theme);
  const dark = theme === 'dark';
  return {
    ts: {
      contentStyle: {
        backgroundColor: dark ? '#1E293B' : '#FFF',
        border: `1px solid ${dark ? '#475569' : '#E2E8F0'}`,
        borderRadius: '8px', fontSize: '12px',
        color: dark ? '#F1F5F9' : '#1E293B',
      },
    },
    ax: dark ? '#94A3B8' : '#64748B',
    grid: dark ? '#1E293B' : '#F1F5F9',
    legend: dark ? '#94A3B8' : '#64748B',
  };
}

function fmtNum(n: number) { return n.toLocaleString('en-IN'); }
function fmtPct(n: number) { return `${n.toFixed(2)}%`; }

/* ────────────────── Collapsible Section ────────────────── */

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="mb-3 flex w-full items-center gap-2 text-left">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {open && children}
    </div>
  );
}

/* ────────────────── Card wrapper ────────────────── */

function Card({ title, subtitle, info, children, className = '' }: {
  title: string; subtitle?: string; info?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${className}`}>
      <div className="mb-2 flex items-center gap-1.5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        {info && <span title={info}><Info className="h-3.5 w-3.5 text-gray-400" /></span>}
      </div>
      {subtitle && <p className="mb-2 text-[10px] text-gray-400 dark:text-gray-500">{subtitle}</p>}
      {children}
    </div>
  );
}

/* ────────────────── Chart widgets ────────────────── */

function BreadthArea({ data, color = '#3B82F6', title, info }: { data: BreadthPoint[]; color?: string; title: string; info?: string }) {
  const s = useChartStyles();
  return (
    <Card title={title} info={info}>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={s.grid} />
          <XAxis dataKey="date" tick={{ fill: s.ax, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: s.ax, fontSize: 9 }} axisLine={false} tickLine={false} />
          <Tooltip {...s.ts} />
          <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.3} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}

function DualLine({ data, k1, k2, c1 = '#3B82F6', c2 = '#EF4444', title, info }: {
  data: { date: string; [k: string]: string | number }[]; k1: string; k2: string; c1?: string; c2?: string; title: string; info?: string;
}) {
  const s = useChartStyles();
  return (
    <Card title={title} info={info}>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={s.grid} />
          <XAxis dataKey="date" tick={{ fill: s.ax, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: s.ax, fontSize: 9 }} axisLine={false} tickLine={false} />
          <Tooltip {...s.ts} />
          <Line type="monotone" dataKey={k1} stroke={c1} dot={false} strokeWidth={1.5} isAnimationActive={false} />
          <Line type="monotone" dataKey={k2} stroke={c2} dot={false} strokeWidth={1.5} isAnimationActive={false} />
          <Legend wrapperStyle={{ fontSize: 10, color: s.legend }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

function PeaksBar({ data, color = '#3B82F6', title, info }: { data: BreadthPoint[]; color?: string; title: string; info?: string }) {
  const s = useChartStyles();
  return (
    <Card title={title} info={info}>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={s.grid} />
          <XAxis dataKey="date" tick={{ fill: s.ax, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: s.ax, fontSize: 9 }} axisLine={false} tickLine={false} />
          <Tooltip {...s.ts} />
          <Bar dataKey="value" fill={color} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

/* ────────────────── Table widgets ────────────────── */

function SortableTable<T extends Record<string, unknown>>({ title, columns, data, info }: {
  title: string; info?: string;
  columns: { key: string; label: string; fmt?: (v: unknown) => string; color?: (v: unknown) => string }[];
  data: T[];
}) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...data];
    if (sortCol) {
      copy.sort((a, b) => {
        const va = a[sortCol] as number; const vb = b[sortCol] as number;
        return asc ? va - vb : vb - va;
      });
    }
    return copy;
  }, [data, sortCol, asc]);

  function toggle(key: string) {
    if (sortCol === key) setAsc(!asc);
    else { setSortCol(key); setAsc(false); }
  }

  return (
    <Card title={title} info={info}>
      <div className="max-h-[320px] overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/80">
              {columns.map((c) => (
                <th key={c.key} className="cursor-pointer whitespace-nowrap px-2 py-1.5 font-semibold text-gray-600 dark:text-gray-400"
                  onClick={() => toggle(c.key)}>
                  {c.label} {sortCol === c.key ? (asc ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i} className={`border-b border-gray-100 dark:border-slate-800 ${i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-gray-50/50 dark:bg-slate-800/50'}`}>
                {columns.map((c) => {
                  const v = row[c.key];
                  const color = c.color ? c.color(v) : '';
                  return <td key={c.key} className={`whitespace-nowrap px-2 py-1.5 ${color}`}>{c.fmt ? c.fmt(v) : String(v ?? '')}</td>;
                })}
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={columns.length} className="px-2 py-4 text-center text-gray-400">No data</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ────────────────── Color helpers ────────────────── */

function pctColor(v: unknown): string {
  const n = Number(v);
  if (n > 0) return 'text-green-600 dark:text-green-400';
  if (n < 0) return 'text-red-600 dark:text-red-400';
  return '';
}

function symbolColor(): string {
  return 'text-blue-600 dark:text-blue-400 font-medium';
}

/* ────────────────── MAIN PAGE ────────────────── */

export default function MarketBreadthPage() {
  const charts = useMBCharts();
  const tables = useMBTables();
  const screeners = useMBScreeners();
  const indexData = useMBIndex();
  const shareholding = useMBShareholding();

  const isLoading = charts.isLoading || tables.isLoading;
  const cacheTs = charts.data?.cache_ts || tables.data?.cache_ts;

  return (
    <div className="space-y-6 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Market Breadth</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Technical breadth indicators across all stocks</p>
        </div>
        {cacheTs && <span className="text-xs text-gray-400 dark:text-gray-500">Data as of: {cacheTs}</span>}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <span className="ml-3 text-gray-500">Computing market breadth (first load may take 20-40s)...</span>
        </div>
      )}

      {/* ═══════════ CHARTS SECTION ═══════════ */}
      {charts.data && (
        <>
          <Section title="Moving Average Breadth">
            {/* Row 1: % DMA + EMA + Volume + 200 DMA Trend + EMA by MCap */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
              <BreadthArea data={charts.data.dma.pct_above_200dma} title="% above 200 DMA" info="Percentage of stocks trading above their 200-day moving average" />
              <BreadthArea data={charts.data.dma.pct_above_50dma} title="% above 50 DMA" color="#8B5CF6" />
              <BreadthArea data={charts.data.dma.pct_above_20dma} title="% above 20 DMA" color="#EC4899" />
              <DualLine
                data={charts.data.dma.trend_200dma_above.map((p, i) => ({
                  date: p.date, above: p.value,
                  below: charts.data!.dma.trend_200dma_below[i]?.value ?? 0,
                }))}
                k1="above" k2="below" title="200 Day Moving Avg Trend" info="Count of stocks above vs below 200 DMA"
              />
              <DualLine
                data={charts.data.dma.trend_50dma_above.map((p, i) => ({
                  date: p.date, above: p.value,
                  below: charts.data!.dma.trend_50dma_below[i]?.value ?? 0,
                }))}
                k1="above" k2="below" title="50 Day Moving Avg Trend"
              />
            </div>

            {/* Row 2 */}
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
              <DualLine
                data={charts.data.dma.trend_20dma_above.map((p, i) => ({
                  date: p.date, above: p.value,
                  below: charts.data!.dma.trend_20dma_below[i]?.value ?? 0,
                }))}
                k1="above" k2="below" title="20 Day Moving Avg Trend"
              />
              <DualLine
                data={charts.data.volume.map((v) => ({ date: v.date, above_avg: v.above_avg, below_avg: v.below_avg }))}
                k1="above_avg" k2="below_avg" c1="#22C55E" c2="#EF4444"
                title="Today's Volume vs 200Day EMA" info="Stocks with volume above/below 200-day average"
              />
              <DualLine
                data={charts.data.high_low_52w.map((v) => ({ date: v.date, new_highs: v.new_highs, new_lows: v.new_lows }))}
                k1="new_highs" k2="new_lows" c1="#22C55E" c2="#EF4444"
                title="52W High vs Low Trend"
              />
              <DualLine
                data={charts.data.vwap.map((v) => ({ date: v.date, above: v.above, below: v.below }))}
                k1="above" k2="below" c1="#3B82F6" c2="#A855F7"
                title="Stocks above/below VWAP"
              />
              {/* Gold vs Nifty */}
              {charts.data.gold_vs_nifty.length >= 2 && (
                <GoldNiftyChart series={charts.data.gold_vs_nifty} />
              )}
            </div>
          </Section>

          {/* Momentum & Drawdowns */}
          <Section title="Momentum & Drawdowns">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <PeaksBar data={charts.data.momentum_peaks} color="#3B82F6" title="Momentum Peaks" info="Count of stocks with daily gain > 1%" />
              <PeaksBar data={charts.data.drawdown_peaks} color="#EF4444" title="Drawdown Peaks" info="Count of stocks with daily loss > 1%" />
            </div>
          </Section>
        </>
      )}

      {/* ═══════════ TABLES SECTION ═══════════ */}
      {tables.data && (
        <>
          {/* Sector & Index Analysis */}
          <Section title="Sector & Index Analysis">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <SortableTable<SectorEmaRow>
                title="Sectors Above Key Weekly EMA"
                data={tables.data.sector_ema}
                columns={[
                  { key: 'sector', label: 'Sector', color: () => symbolColor() },
                  { key: 'pct_4w', label: '4w ema', fmt: (v) => fmtPct(v as number) },
                  { key: 'pct_20w', label: '20w ema', fmt: (v) => fmtPct(v as number) },
                  { key: 'pct_30w', label: '30w ema', fmt: (v) => fmtPct(v as number) },
                  { key: 'pct_40w', label: '40w ema', fmt: (v) => fmtPct(v as number) },
                  { key: 'pct_52w', label: '52w ema', fmt: (v) => fmtPct(v as number) },
                ]}
              />
              {indexData.data && (
                <SortableTable<IndexDistRow>
                  title="Indices: %Age Away from 40W"
                  data={indexData.data.dist_from_40w}
                  columns={[
                    { key: 'symbol', label: 'Symbol', color: () => symbolColor() },
                    { key: 'pct_from_40w', label: '% from 40W', fmt: (v) => fmtPct(v as number), color: pctColor },
                  ]}
                />
              )}
              <SortableTable<DailyMovesRow>
                title="Daily Market Moves"
                data={tables.data.daily_moves}
                columns={[
                  { key: 'date', label: 'Date' },
                  { key: 'abv_3', label: 'Abv 3%', fmt: (v) => fmtNum(v as number), color: () => 'text-green-600 dark:text-green-400' },
                  { key: 'blw_3', label: 'Blw 3%', fmt: (v) => fmtNum(v as number), color: () => 'text-red-600 dark:text-red-400' },
                  { key: 'abv_5', label: 'Abv 5%', fmt: (v) => fmtNum(v as number), color: () => 'text-green-600 dark:text-green-400' },
                  { key: 'blw_5', label: 'Blw 5%', fmt: (v) => fmtNum(v as number), color: () => 'text-red-600 dark:text-red-400' },
                  { key: 'abv_10', label: 'Abv 10%', fmt: (v) => fmtNum(v as number) },
                  { key: 'blw_10', label: 'Blw 10%', fmt: (v) => fmtNum(v as number) },
                ]}
              />
            </div>
          </Section>

          {/* Index Returns */}
          {indexData.data && (
            <Section title="Index Returns">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <SortableTable<IndexChangeRow>
                  title="Yearly Percentage Change in Indices"
                  data={indexData.data.yearly_change}
                  columns={[
                    { key: 'symbol', label: 'Symbol', color: () => symbolColor() },
                    { key: 'pct_change', label: '% change', fmt: (v) => fmtPct(v as number), color: pctColor },
                  ]}
                />
                <SortableTable<IndexChangeRow>
                  title="Quarterly Percentage Change"
                  data={indexData.data.quarterly_change}
                  columns={[
                    { key: 'symbol', label: 'Symbol', color: () => symbolColor() },
                    { key: 'pct_change', label: '% change', fmt: (v) => fmtPct(v as number), color: pctColor },
                  ]}
                />
                <SortableTable<IndexChangeRow>
                  title="Weekly Percentage Change"
                  data={indexData.data.weekly_change}
                  columns={[
                    { key: 'symbol', label: 'Symbol', color: () => symbolColor() },
                    { key: 'pct_change', label: '% change', fmt: (v) => fmtPct(v as number), color: pctColor },
                  ]}
                />
              </div>
            </Section>
          )}

          {/* Return Rankings */}
          <Section title="Return Rankings">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
              {([
                ['return_1y', 'Return Yearly'],
                ['return_6m', 'Return 6Month'],
                ['return_3m', 'Return 3Month'],
                ['return_1m', 'Return 1Month'],
                ['return_2w', 'Return 2Week'],
                ['return_1w', 'Return 1Week'],
              ] as const).map(([key, label]) => (
                <SortableTable<ReturnRow>
                  key={key}
                  title={label}
                  data={(tables.data as Record<string, ReturnRow[]>)[key] ?? []}
                  columns={[
                    { key: 'symbol', label: 'Symbol', color: () => symbolColor() },
                    { key: 'pct_change', label: '% change', fmt: (v) => fmtPct(v as number), color: pctColor },
                  ]}
                />
              ))}
            </div>
          </Section>

          {/* VWAP Analysis */}
          <Section title="VWAP Analysis">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {([
                ['vwap_largecap', 'Large Cap Stocks Above VWAP'],
                ['vwap_midcap', 'Mid Cap Stocks Above VWAP'],
                ['vwap_smallcap', 'Small Cap Stocks Above VWAP'],
                ['vwap_microcap', 'Micro Cap Stocks Above VWAP'],
              ] as const).map(([key, label]) => (
                <SortableTable<VwapStockRow>
                  key={key}
                  title={label}
                  data={(tables.data as Record<string, VwapStockRow[]>)[key] ?? []}
                  columns={[
                    { key: 'symbol', label: 'Symbol', color: () => symbolColor() },
                    { key: 'ltp', label: 'Ltp', fmt: (v) => fmtNum(v as number) },
                    { key: 'vwap', label: 'Vwap', fmt: (v) => fmtNum(v as number) },
                  ]}
                />
              ))}
            </div>
          </Section>

          {/* 52W High */}
          <Section title="52 Week Highs">
            <SortableTable<Stock52wRow>
              title="Stocks at 52 week high"
              info="Stocks trading within 2% of their 52-week high"
              data={tables.data.stocks_52w_high}
              columns={[
                { key: 'symbol', label: 'Symbol', color: () => symbolColor() },
                { key: 'close', label: 'Close', fmt: (v) => fmtNum(v as number) },
                { key: 'yearhigh', label: 'Yearhigh', fmt: (v) => fmtNum(v as number) },
                { key: 'marketcap', label: 'Market cap', fmt: (v) => fmtNum(v as number) },
                { key: 'mcap_category', label: 'Market cap category' },
                { key: 'industry', label: 'Industry' },
                { key: 'sector', label: 'Sector' },
                { key: 'weekly_return', label: 'Weekly return', fmt: (v) => fmtPct(v as number), color: pctColor },
                { key: 'vol_multiple', label: 'Current vol multiple of yr avg', fmt: (v) => (v as number).toFixed(2) },
              ]}
            />
          </Section>
        </>
      )}

      {/* ═══════════ SHAREHOLDING MOVERS ═══════════ */}
      {shareholding.data && (
        <Section title="Shareholding Movers">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {([
              ['retail_increasing', 'Stocks Where Retail is Increasing Shareholding'],
              ['dii_increasing', 'Stocks Where DIIs are Increasing Shareholding'],
              ['promoter_increasing', 'Stocks Where Promoters are Increasing Shareholding'],
              ['fii_increasing', 'Stocks Where FIIs are Increasing Shareholding'],
            ] as const).map(([key, label]) => (
              <SortableTable<ShareholdingMoverRow>
                key={key}
                title={label}
                data={(shareholding.data as Record<string, ShareholdingMoverRow[]>)[key] ?? []}
                columns={[
                  { key: 'symbol', label: 'Symbol', color: () => symbolColor() },
                  { key: 'q3_ago', label: '% 3 qtrs ago', fmt: (v) => fmtPct(v as number) },
                  { key: 'q2_ago', label: '% 2 qtr ago', fmt: (v) => fmtPct(v as number) },
                  { key: 'q1_ago', label: '% 1 qtr ago', fmt: (v) => fmtPct(v as number) },
                  { key: 'current_qtr', label: '% current qtr', fmt: (v) => fmtPct(v as number) },
                  { key: 'change_3q', label: 'Change in 3 qtrs', fmt: (v) => fmtPct(v as number), color: pctColor },
                ]}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ═══════════ SCREENERS ═══════════ */}
      {screeners.data && (
        <Section title="Screeners">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {([
              ['minervini', 'Minervini Screener', 'Price > SMA150 > SMA200, price > SMA50, near 52W high, above 52W low'],
              ['darvas', 'Darvas Screener', 'Near 52W high with above-average volume'],
              ['potential_breakouts', 'Potential Breakouts', 'Within 5% of 52W high with increasing volume'],
              ['modified_rs', 'Modified Relative Strength', 'Weighted return rank: 40% 3M + 30% 6M + 20% 1Y + 10% 1M'],
              ['breakouts_v2', 'Breakouts v2', 'Just crossed above 200 DMA with high volume'],
              ['cci_weekly', 'CCI Weekly > 100 (Long term breakout scanner)', 'Stocks with weekly CCI above 100'],
            ] as const).map(([key, label, info]) => (
              <SortableTable<ScreenerRow>
                key={key}
                title={label}
                info={info}
                data={(screeners.data as Record<string, ScreenerRow[]>)[key] ?? []}
                columns={[
                  { key: 'symbol', label: 'Symbol', color: () => symbolColor() },
                  { key: 'sector', label: 'Sector' },
                  { key: 'mcap_category', label: 'Market cap' },
                  { key: 'week_1_pct', label: '1 week %', fmt: (v) => fmtPct(v as number), color: pctColor },
                  { key: 'vol_vs_yr_avg', label: 'Vol > yr avg', fmt: (v) => (v as number).toFixed(2) },
                ]}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ────────────────── Gold vs Nifty chart ────────────────── */

function GoldNiftyChart({ series }: { series: { name: string; data: BreadthPoint[] }[] }) {
  const s = useChartStyles();
  // Merge two series by date
  const merged: Record<string, Record<string, number | string>> = {};
  for (const sr of series) {
    for (const p of sr.data) {
      if (!merged[p.date]) merged[p.date] = { date: p.date };
      merged[p.date][sr.name] = p.value;
    }
  }
  const data = Object.values(merged).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const keys = series.map((sr) => sr.name);
  const colors = ['#F59E0B', '#3B82F6'];

  return (
    <Card title="Gold vs Nifty">
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={s.grid} />
          <XAxis dataKey="date" tick={{ fill: s.ax, fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: s.ax, fontSize: 9 }} axisLine={false} tickLine={false} />
          <Tooltip {...s.ts} />
          {keys.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} stroke={colors[i]} dot={false} strokeWidth={1.5} isAnimationActive={false} />
          ))}
          <Legend wrapperStyle={{ fontSize: 10, color: s.legend }} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
