"use client";

import { useState, useEffect, useMemo, memo } from 'react';
import {
  TrendingUp, TrendingDown, BarChart2,
  CandlestickChart as CandleIcon, LineChart, AreaChart, Table2,
  Maximize2, X,
} from 'lucide-react';
import { CandlestickChart } from '@/components/charts/CandlestickChart';
import type { FundamentalPaneConfig } from '@/components/charts/CandlestickChart';
import { OHLCTable } from '@/components/tables/OHLCTable';
import { IntervalSelector } from '@/components/forms/IntervalSelector';
import { FundamentalsPickerButton, FundamentalsPickerModal } from '@/components/forms/FundamentalsPicker';
import { StockSearch } from '@/components/forms/StockSearch';
import { useOHLC } from '@/hooks/useOHLC';
import { useFundamentalCatalog, useFundamentalTimeseries } from '@/hooks/useFundamentals';
import { useStockStore } from '@/store/stockStore';
import { useFundamentalStore } from '@/store/fundamentalStore';
import type { ChartType } from '@/types/ohlc';

type ViewTab = 'chart' | 'table';

const StatCard = memo(function StatCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${
        positive === true  ? 'text-green-600 dark:text-green-400' :
        positive === false ? 'text-red-600 dark:text-red-400'   :
        'text-gray-900 dark:text-white'
      }`}>{value}</p>
    </div>
  );
});

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
    <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
      {CHART_TYPES.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setChartType(value)}
          title={label}
          className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
            chartType === value ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { selectedSymbol, chartType, setChartType } = useStockStore();
  const { data, isLoading, error } = useOHLC();
  const selectedMetrics = useFundamentalStore((s) => s.selectedMetrics);
  const removeMetric = useFundamentalStore((s) => s.removeMetric);
  const [viewTab, setViewTab]       = useState<ViewTab>('chart');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fundamental data
  const { data: catalog } = useFundamentalCatalog();
  const { data: tsData } = useFundamentalTimeseries();

  // Build FundamentalPaneConfig[] for the chart
  const fundamentalPanes: FundamentalPaneConfig[] = useMemo(() => {
    if (!catalog || !tsData || selectedMetrics.length === 0) return [];

    const catalogMap = new Map(catalog.metrics.map(m => [m.key, m]));

    return selectedMetrics
      .map((key, idx) => {
        const meta = catalogMap.get(key);
        if (!meta) return null;
        const points = tsData.metrics?.[key] ?? [];
        return {
          key,
          label: meta.label,
          unit: meta.unit,
          chartType: meta.chart_type,
          data: points,
          colorIndex: idx,
        } satisfies FundamentalPaneConfig;
      })
      .filter((x): x is FundamentalPaneConfig => x !== null);
  }, [catalog, tsData, selectedMetrics]);

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
      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[9999] flex flex-col bg-white dark:bg-slate-950">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <span className="text-base font-bold text-gray-900 dark:text-white">{selectedSymbol || '—'}</span>
              {last && (
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{fmt(last.close)}</span>
              )}
              {changePct !== null && (
                <span className={`flex items-center gap-1 text-xs font-medium ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {isPos ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {isPos ? '+' : ''}{changePct.toFixed(2)}%
                </span>
              )}
              <div className="ml-2 w-52">
                <StockSearch />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <IntervalSelector />
              <FundamentalsPickerButton />
              <ChartTypeSelector chartType={chartType} setChartType={setChartType} />
              <button
                onClick={() => setIsFullscreen(false)}
                title="Exit fullscreen (Esc)"
                className="ml-1 rounded-lg border border-gray-200 bg-gray-100 p-1.5 text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-400 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 p-2">
            <CandlestickChart
              data={ohlc}
              isLoading={isLoading}
              symbol={selectedSymbol}
              chartType={chartType}
              fundamentalPanes={fundamentalPanes}
              onRemoveFundamental={removeMetric}
            />
          </div>
        </div>
      )}

      {/* Normal dashboard — no page scroll */}
      <div className="flex h-full flex-col gap-4 overflow-hidden p-4 pb-2">
        <div className="shrink-0">
          <div className="flex items-baseline gap-3">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              {last ? fmt(last.close) : '—'}
            </h2>
            {change !== null && changePct !== null && (
              <div className={`flex items-center gap-1 text-sm font-medium ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {isPos ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {isPos ? '+' : ''}{fmt(change)} ({isPos ? '+' : ''}{changePct.toFixed(2)}%)
              </div>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{selectedSymbol} · {last?.date ?? '—'}</p>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
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

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <IntervalSelector />
          <div className="flex items-center gap-2">
            {viewTab === 'chart' && (
              <>
                <FundamentalsPickerButton />
                <ChartTypeSelector chartType={chartType} setChartType={setChartType} />
              </>
            )}
            <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
              {([
                { value: 'chart' as ViewTab, icon: BarChart2, label: 'Chart' },
                { value: 'table' as ViewTab, icon: Table2,    label: 'Table' },
              ]).map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setViewTab(value)}
                  className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                    viewTab === value
                      ? 'bg-gray-200 text-gray-900 dark:bg-slate-600 dark:text-white'
                      : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error.message}
          </div>
        )}

        {/* Chart or Table — fills remaining space */}
        <div className="min-h-0 flex-1">
          {viewTab === 'chart' ? (
            <div className="relative h-full">
              <CandlestickChart
                data={ohlc}
                isLoading={isLoading}
                symbol={selectedSymbol}
                chartType={chartType}
                fundamentalPanes={fundamentalPanes}
                onRemoveFundamental={removeMetric}
              />
              <button
                onClick={() => setIsFullscreen(true)}
                title="Fullscreen (F)"
                className="absolute right-3 top-3 z-10 rounded-lg bg-white/90 p-1.5 text-gray-400 shadow-sm backdrop-blur-sm transition-colors hover:bg-gray-100 hover:text-gray-700 dark:bg-slate-800/90 dark:text-gray-500 dark:hover:bg-slate-700 dark:hover:text-white"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="h-full overflow-auto">
              <OHLCTable data={[...ohlc].reverse()} />
            </div>
          )}
        </div>
      </div>

      {/* Fundamentals picker modal */}
      <FundamentalsPickerModal />
    </>
  );
}
