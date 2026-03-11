import { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, BarChart2,
  CandlestickChart as CandleIcon, LineChart, AreaChart, Table2,
  Maximize2, X,
} from 'lucide-react';
import { CandlestickChart } from '../components/charts/CandlestickChart';
import { OHLCTable } from '../components/tables/OHLCTable';
import { IntervalSelector } from '../components/forms/IntervalSelector';
import { StockSearch } from '../components/forms/StockSearch';
import { useOHLC } from '../hooks/useOHLC';
import { useStockStore } from '../store/stockStore';
import type { ChartType } from '../types/ohlc';

type ViewTab = 'chart' | 'table';

function StatCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${
        positive === true  ? 'text-green-400' :
        positive === false ? 'text-red-400'   :
        'text-white'
      }`}>{value}</p>
    </div>
  );
}

const CHART_TYPES: { value: ChartType; icon: React.ElementType; label: string }[] = [
  { value: 'candlestick', icon: CandleIcon, label: 'Candles' },
  { value: 'line',        icon: LineChart,  label: 'Line'    },
  { value: 'area',        icon: AreaChart,  label: 'Area'    },
];

function ChartTypeSelector({
  chartType,
  setChartType,
}: {
  chartType: ChartType;
  setChartType: (t: ChartType) => void;
}) {
  return (
    <div className="flex rounded-lg border border-slate-700 bg-slate-800 p-0.5">
      {CHART_TYPES.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setChartType(value)}
          title={label}
          className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            chartType === value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function Dashboard() {
  const { selectedSymbol, chartType, setChartType } = useStockStore();
  const { data, isLoading, error } = useOHLC();
  const [viewTab, setViewTab]       = useState<ViewTab>('chart');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const ohlc      = data?.ohlc ?? [];
  const last      = ohlc[ohlc.length - 1];
  const prev      = ohlc[ohlc.length - 2];
  const change    = last && prev ? last.close - prev.close : null;
  const changePct = last && prev ? ((last.close - prev.close) / prev.close) * 100 : null;
  const isPos     = change !== null ? change >= 0 : undefined;

  const high52w = ohlc.length ? Math.max(...ohlc.map((d) => d.high)) : null;
  const low52w  = ohlc.length ? Math.min(...ohlc.map((d) => d.low))  : null;

  function fmt(n: number) {
    return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Keyboard shortcuts: Escape exits, F toggles fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
      if (e.key === 'f' || e.key === 'F') setIsFullscreen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  // Prevent body scroll when fullscreen
  useEffect(() => {
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isFullscreen]);

  return (
    <>
      {/* ── Fullscreen overlay ─────────────────────────────────────── */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[9999] flex flex-col bg-slate-900">
          {/* Fullscreen top bar */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-700 bg-slate-900 px-4 py-2.5">
            {/* Left: symbol + price + search */}
            <div className="flex items-center gap-3">
              <span className="text-base font-bold text-white">{selectedSymbol || '—'}</span>
              {last && (
                <span className="text-sm font-semibold text-white">{fmt(last.close)}</span>
              )}
              {changePct !== null && (
                <span className={`flex items-center gap-1 text-xs font-medium ${isPos ? 'text-green-400' : 'text-red-400'}`}>
                  {isPos ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {isPos ? '+' : ''}{changePct.toFixed(2)}%
                </span>
              )}
              <div className="ml-2 w-52">
                <StockSearch />
              </div>
            </div>

            {/* Right: interval + chart type + close */}
            <div className="flex items-center gap-2">
              <IntervalSelector />
              <ChartTypeSelector chartType={chartType} setChartType={setChartType} />
              <button
                onClick={() => setIsFullscreen(false)}
                title="Exit fullscreen (Esc)"
                className="ml-1 rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-400 transition-colors hover:border-slate-500 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Chart fills remaining space */}
          <div className="min-h-0 flex-1 p-2">
            <CandlestickChart
              data={ohlc}
              isLoading={isLoading}
              symbol={selectedSymbol}
              chartType={chartType}
            />
          </div>
        </div>
      )}

      {/* ── Normal dashboard ───────────────────────────────────────── */}
      <div className="flex flex-col gap-6 p-6">
        {/* Symbol header */}
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-3">
            <h2 className="text-3xl font-bold text-white">
              {last ? fmt(last.close) : '—'}
            </h2>
            {change !== null && changePct !== null && (
              <div className={`flex items-center gap-1 text-sm font-medium ${isPos ? 'text-green-400' : 'text-red-400'}`}>
                {isPos ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {isPos ? '+' : ''}{fmt(change)} ({isPos ? '+' : ''}{changePct.toFixed(2)}%)
              </div>
            )}
          </div>
          <p className="text-sm text-slate-400">{selectedSymbol} · {last?.date ?? '—'}</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Open"       value={last ? fmt(last.open)  : '—'} />
          <StatCard label="High"       value={last ? fmt(last.high)  : '—'} positive={true} />
          <StatCard label="Low"        value={last ? fmt(last.low)   : '—'} positive={false} />
          <StatCard label="Volume"     value={last ? last.volume.toLocaleString('en-IN') : '—'} />
          <StatCard label="52W High"   value={high52w ? fmt(high52w) : '—'} />
          <StatCard label="52W Low"    value={low52w  ? fmt(low52w)  : '—'} />
          <StatCard
            label="Day Change"
            value={change !== null ? `${isPos ? '+' : ''}${fmt(change)}` : '—'}
            positive={isPos}
          />
          <StatCard
            label="Change %"
            value={changePct !== null ? `${isPos ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
            positive={isPos}
          />
        </div>

        {/* Controls row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <IntervalSelector />

          <div className="flex items-center gap-2">
            {/* Chart type selector (visible only in chart view) */}
            {viewTab === 'chart' && (
              <ChartTypeSelector chartType={chartType} setChartType={setChartType} />
            )}

            {/* Chart / Table view toggle */}
            <div className="flex rounded-lg border border-slate-700 bg-slate-800 p-0.5">
              {([
                { value: 'chart' as ViewTab, icon: BarChart2, label: 'Chart' },
                { value: 'table' as ViewTab, icon: Table2,    label: 'Table' },
              ]).map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setViewTab(value)}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    viewTab === value ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-900 bg-red-900/20 px-4 py-3 text-sm text-red-400">
            {error.message}
          </div>
        )}

        {/* Chart or Table */}
        {viewTab === 'chart' ? (
          <div className="relative h-[500px]">
            <CandlestickChart
              data={ohlc}
              isLoading={isLoading}
              symbol={selectedSymbol}
              chartType={chartType}
            />
            {/* Fullscreen toggle button — top-right corner of chart */}
            <button
              onClick={() => setIsFullscreen(true)}
              title="Fullscreen (F)"
              className="absolute right-3 top-3 z-10 rounded-lg bg-slate-800/80 p-1.5 text-slate-400 backdrop-blur-sm transition-colors hover:bg-slate-700 hover:text-white"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <OHLCTable data={[...ohlc].reverse()} />
        )}
      </div>
    </>
  );
}
