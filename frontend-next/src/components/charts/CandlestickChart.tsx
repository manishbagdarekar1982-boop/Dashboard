"use client";

import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type AreaData,
} from 'lightweight-charts';
import { ZoomIn, ZoomOut, Maximize, X } from 'lucide-react';
import type { ChartType, OHLCPoint } from '@/types/ohlc';
import type { FundamentalDataPoint } from '@/types/fundamentals';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { EmptyState } from '@/components/common/EmptyState';
import { useThemeStore } from '@/store/themeStore';

// ── Fundamental pane config passed from parent ──
export interface FundamentalPaneConfig {
  key: string;
  label: string;
  unit: string;
  chartType: string;   // 'bar' | 'line'
  data: FundamentalDataPoint[];
  colorIndex: number;
}

interface CandlestickChartProps {
  data: OHLCPoint[];
  isLoading: boolean;
  symbol: string;
  chartType: ChartType;
  fundamentalPanes?: FundamentalPaneConfig[];
  onRemoveFundamental?: (key: string) => void;
}

const METRIC_COLORS = [
  '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981',
  '#EF4444', '#EC4899', '#06B6D4', '#84CC16',
];

const LIGHT = {
  background: '#FFFFFF', text: '#64748B', grid: '#F1F5F9',
  border: '#E2E8F0', bullish: '#16A34A', bearish: '#DC2626',
  line: '#2563EB', areaTop: 'rgba(37,99,235,0.2)',
  areaBottom: 'rgba(37,99,235,0.01)', crosshair: '#94A3B8', labelBg: '#475569',
  paneSep: '#E2E8F0', paneSepHover: 'rgba(100,116,139,0.2)',
};

const DARK = {
  background: '#0F172A', text: '#94A3B8', grid: '#1E293B',
  border: '#334155', bullish: '#22C55E', bearish: '#EF4444',
  line: '#3B82F6', areaTop: 'rgba(59,130,246,0.3)',
  areaBottom: 'rgba(59,130,246,0.01)', crosshair: '#475569', labelBg: '#334155',
  paneSep: '#334155', paneSepHover: 'rgba(148,163,184,0.2)',
};

// ── Value formatters ──
function formatFundamentalValue(value: number, unit: string): string {
  if (unit === 'cr') {
    const abs = Math.abs(value);
    if (abs >= 100000) return `${(value / 100000).toFixed(1)}L Cr`;
    if (abs >= 1000) return `${(value / 1000).toFixed(1)}K Cr`;
    if (abs >= 100) return `${value.toFixed(0)} Cr`;
    return `${value.toFixed(1)} Cr`;
  }
  if (unit === 'pct') return `${value.toFixed(2)}%`;
  if (unit === 'days') return `${value.toFixed(0)}d`;
  return value.toFixed(2);
}

function rebalanceStretchFactors(chart: IChartApi, subPaneCount: number) {
  const panes = chart.panes();
  if (panes.length <= 1) {
    panes[0]?.setStretchFactor(1);
    return;
  }
  const mainFactor = 3;
  const subFactor = 1;
  panes[0].setStretchFactor(mainFactor);
  for (let i = 1; i < panes.length; i++) {
    panes[i].setStretchFactor(subFactor);
  }
}

// Find the latest fundamental data point at or before a given date
function findNearestFundValue(points: FundamentalDataPoint[], dateStr: string): number | null {
  // data is sorted ascending by date; find last point <= dateStr
  let result: number | null = null;
  for (const p of points) {
    if (p.date <= dateStr && p.value != null) result = p.value;
    if (p.date > dateStr) break;
  }
  return result;
}

// ── Crosshair data bar state ──
interface DataBarInfo {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePct: number;
  isUp: boolean;
  fundamentals: { label: string; value: string; color: string }[];
}

// ── Track state per fundamental pane ──
interface FundPaneState {
  seriesApi: ISeriesApi<SeriesType>;
  metricKey: string;
}

export function CandlestickChart({
  data, isLoading, symbol, chartType,
  fundamentalPanes, onRemoveFundamental,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const priceRef     = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeRef    = useRef<ISeriesApi<'Histogram'> | null>(null);
  const fundPanesRef = useRef<Map<string, FundPaneState>>(new Map());
  // Keep current data/config in refs so crosshair callback avoids stale closures
  const dataRef = useRef(data);
  dataRef.current = data;
  const fundConfigRef = useRef(fundamentalPanes);
  fundConfigRef.current = fundamentalPanes;
  // Track pane top offsets for close button positioning
  const [paneOffsets, setPaneOffsets] = useState<Map<string, number>>(new Map());
  // Crosshair data bar
  const [dataBar, setDataBar] = useState<DataBarInfo | null>(null);
  // Per-pane crosshair values (key → { label, value, color, date })
  const [paneValues, setPaneValues] = useState<Map<string, { label: string; value: string; color: string; date: string }>>(new Map());
  const theme = useThemeStore((s) => s.theme);
  const C = theme === 'dark' ? DARK : LIGHT;

  // Recompute close-button offsets relative to container
  const recalcOffsets = useCallback(() => {
    const container = containerRef.current;
    const current = fundPanesRef.current;
    if (!container || current.size === 0) {
      setPaneOffsets(new Map());
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const offsets = new Map<string, number>();
    for (const [key, state] of current.entries()) {
      try {
        const paneEl = state.seriesApi.getPane().getHTMLElement();
        if (paneEl) {
          const paneRect = paneEl.getBoundingClientRect();
          offsets.set(key, paneRect.top - containerRect.top);
        }
      } catch { /* pane not ready */ }
    }
    setPaneOffsets(offsets);
  }, []);

  // ── Init chart (once) ──────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const initC = theme === 'dark' ? DARK : LIGHT;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: initC.background },
        textColor:  initC.text,
        fontSize:   12,
        panes: {
          separatorColor: initC.paneSep,
          separatorHoverColor: initC.paneSepHover,
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: initC.grid },
        horzLines: { color: initC.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: initC.crosshair, labelBackgroundColor: initC.labelBg },
        horzLine: { color: initC.crosshair, labelBackgroundColor: initC.labelBg },
      },
      rightPriceScale: {
        borderColor: initC.border,
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor:    initC.border,
        timeVisible:    true,
        secondsVisible: false,
      },
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 500,
    });

    const vol = chart.addSeries(HistogramSeries, {
      color:        initC.line,
      priceFormat:  { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current  = chart;
    volumeRef.current = vol;

    // ── Crosshair move → update data bar ──
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.size) {
        setDataBar(null);
        setPaneValues(new Map());
        return;
      }

      const price = priceRef.current;
      if (!price) return;

      const priceData = param.seriesData.get(price) as
        | (CandlestickData & { open: number; high: number; low: number; close: number })
        | (LineData & { value: number })
        | undefined;

      if (!priceData) { setDataBar(null); return; }

      const dateStr = String(param.time);
      let o: number, h: number, l: number, c: number;
      if ('open' in priceData) {
        o = priceData.open; h = priceData.high; l = priceData.low; c = priceData.close;
      } else {
        o = h = l = c = (priceData as LineData).value;
      }

      const volData = param.seriesData.get(vol) as HistogramData | undefined;
      const v = volData?.value ?? 0;

      // Find previous bar for change calc
      const curData = dataRef.current;
      const idx = curData.findIndex(d => d.date === dateStr);
      const prev = idx > 0 ? curData[idx - 1] : null;
      const change = prev ? c - prev.close : 0;
      const changePct = prev && prev.close !== 0 ? (change / prev.close) * 100 : 0;

      // Fundamental values — find nearest value at or before crosshair date
      const fundValues: DataBarInfo['fundamentals'] = [];
      const pv = new Map<string, { label: string; value: string; color: string; date: string }>();
      const configs = fundConfigRef.current ?? [];
      for (const cfg of configs) {
        const nearestVal = findNearestFundValue(cfg.data, dateStr);
        if (nearestVal != null) {
          const color = METRIC_COLORS[cfg.colorIndex % METRIC_COLORS.length];
          const formatted = formatFundamentalValue(nearestVal, cfg.unit);
          fundValues.push({ label: cfg.label, value: formatted, color });
          // Find the actual date of this data point for the pane label
          let pointDate = dateStr;
          for (const p of cfg.data) {
            if (p.date <= dateStr && p.value != null) pointDate = p.date;
            if (p.date > dateStr) break;
          }
          pv.set(cfg.key, { label: cfg.label, value: formatted, color, date: pointDate });
        }
      }

      setPaneValues(pv);
      setDataBar({
        date: dateStr, open: o, high: h, low: l, close: c,
        volume: v, change, changePct, isUp: change >= 0,
        fundamentals: fundValues,
      });
    });

    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
        // Recalc close-button positions after resize
        requestAnimationFrame(recalcOffsets);
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current  = null;
      priceRef.current  = null;
      volumeRef.current = null;
      fundPanesRef.current.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update theme colors without destroying chart ──────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: C.background },
        textColor: C.text,
        panes: {
          separatorColor: C.paneSep,
          separatorHoverColor: C.paneSepHover,
        },
      },
      grid: {
        vertLines: { color: C.grid },
        horzLines: { color: C.grid },
      },
      crosshair: {
        vertLine: { color: C.crosshair, labelBackgroundColor: C.labelBg },
        horzLine: { color: C.crosshair, labelBackgroundColor: C.labelBg },
      },
      rightPriceScale: { borderColor: C.border },
      timeScale: { borderColor: C.border },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // ── Rebuild price series + load data ──
  useEffect(() => {
    const chart = chartRef.current;
    const vol   = volumeRef.current;
    if (!chart || !vol || !data.length) return;

    if (priceRef.current) {
      chart.removeSeries(priceRef.current);
      priceRef.current = null;
    }

    const timeKey = (d: OHLCPoint) => d.date as `${number}-${number}-${number}`;

    if (chartType === 'candlestick') {
      const series = chart.addSeries(CandlestickSeries, {
        upColor:         C.bullish,
        downColor:       C.bearish,
        borderUpColor:   C.bullish,
        borderDownColor: C.bearish,
        wickUpColor:     C.bullish,
        wickDownColor:   C.bearish,
      }, 0);
      const candles: CandlestickData[] = data.map((d) => ({
        time:  timeKey(d),
        open:  d.open,
        high:  d.high,
        low:   d.low,
        close: d.close,
      }));
      series.setData(candles);
      priceRef.current = series;

    } else if (chartType === 'line') {
      const series = chart.addSeries(LineSeries, {
        color:     C.line,
        lineWidth: 2,
      }, 0);
      const lines: LineData[] = data.map((d) => ({ time: timeKey(d), value: d.close }));
      series.setData(lines);
      priceRef.current = series;

    } else {
      const series = chart.addSeries(AreaSeries, {
        lineColor:   C.line,
        topColor:    C.areaTop,
        bottomColor: C.areaBottom,
        lineWidth:   2,
      }, 0);
      const areas: AreaData[] = data.map((d) => ({ time: timeKey(d), value: d.close }));
      series.setData(areas);
      priceRef.current = series;
    }

    const volData: HistogramData[] = data.map((d) => ({
      time:  timeKey(d),
      value: d.volume,
      color: d.close >= d.open ? `${C.bullish}66` : `${C.bearish}66`,
    }));
    vol.setData(volData);

    chart.timeScale().fitContent();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, chartType, theme]);

  // ── Manage fundamental panes ──────────────
  // Stable serialisation key so effect only fires on real changes
  const fundKey = useMemo(() => {
    if (!fundamentalPanes?.length) return '';
    return fundamentalPanes.map(p =>
      `${p.key}:${p.data.length}:${p.data[0]?.date ?? ''}:${p.data[p.data.length - 1]?.date ?? ''}`
    ).join('|');
  }, [fundamentalPanes]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const current = fundPanesRef.current;
    const desired = new Set((fundamentalPanes ?? []).map(f => f.key));
    const themeC = theme === 'dark' ? DARK : LIGHT;

    // 1. Remove panes for deselected metrics
    for (const [key, state] of current.entries()) {
      if (!desired.has(key)) {
        try { chart.removeSeries(state.seriesApi); } catch { /* already gone */ }
        current.delete(key);
      }
    }

    // 2. Clean up empty panes (skip pane 0 = main chart)
    const allPanes = chart.panes();
    for (let i = allPanes.length - 1; i >= 1; i--) {
      if (allPanes[i].getSeries().length === 0) {
        try { chart.removePane(i); } catch { /* already gone */ }
      }
    }

    // 3. Add or update panes for selected metrics
    for (const config of (fundamentalPanes ?? [])) {
      const validPoints = config.data.filter(d => d.value !== null);
      const existing = current.get(config.key);

      if (existing) {
        // Update data for existing series
        if (config.chartType === 'bar') {
          const seriesData = validPoints.map(d => ({
            time: d.date as `${number}-${number}-${number}`,
            value: d.value as number,
            color: (d.value as number) >= 0 ? `${themeC.bullish}CC` : `${themeC.bearish}CC`,
          }));
          existing.seriesApi.setData(seriesData);
        } else {
          const seriesData = validPoints.map(d => ({
            time: d.date as `${number}-${number}-${number}`,
            value: d.value as number,
          }));
          existing.seriesApi.setData(seriesData);
        }
      } else {
        // Create new pane + series
        const newPane = chart.addPane();
        const color = METRIC_COLORS[config.colorIndex % METRIC_COLORS.length];

        let series: ISeriesApi<SeriesType>;
        if (config.chartType === 'bar') {
          series = newPane.addSeries(HistogramSeries, {
            color,
            priceFormat: {
              type: 'custom',
              formatter: (v: number) => formatFundamentalValue(v, config.unit),
            },
            title: config.label,
          });
          const seriesData = validPoints.map(d => ({
            time: d.date as `${number}-${number}-${number}`,
            value: d.value as number,
            color: (d.value as number) >= 0 ? `${themeC.bullish}CC` : `${themeC.bearish}CC`,
          }));
          series.setData(seriesData);
        } else {
          series = newPane.addSeries(LineSeries, {
            color,
            lineWidth: 2,
            priceFormat: {
              type: 'custom',
              formatter: (v: number) => formatFundamentalValue(v, config.unit),
            },
            title: config.label,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 4,
          });
          const seriesData = validPoints.map(d => ({
            time: d.date as `${number}-${number}-${number}`,
            value: d.value as number,
          }));
          series.setData(seriesData);
        }

        current.set(config.key, { seriesApi: series, metricKey: config.key });
      }
    }

    // 4. Rebalance stretch factors
    rebalanceStretchFactors(chart, fundamentalPanes?.length ?? 0);

    // 5. Compute pane offsets after DOM has laid out (needs rAF)
    requestAnimationFrame(recalcOffsets);

    // 6. Listen for mouseup on container to catch pane separator drags
    const container = containerRef.current;
    const handleMouseUp = () => requestAnimationFrame(recalcOffsets);
    if (container) {
      container.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      container?.removeEventListener('mouseup', handleMouseUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundKey, theme]);

  function zoom(factor: number) {
    const chart = chartRef.current;
    if (!chart) return;
    const range = chart.timeScale().getVisibleLogicalRange();
    if (!range) return;
    const mid = (range.from + range.to) / 2;
    const half = ((range.to - range.from) / 2) * factor;
    chart.timeScale().setVisibleLogicalRange({ from: mid - half, to: mid + half });
  }

  function resetZoom() {
    chartRef.current?.timeScale().fitContent();
  }

  return (
    <div className="relative h-full w-full rounded-xl bg-white border border-gray-200 dark:bg-slate-900 dark:border-slate-700">
      <div ref={containerRef} className="h-full w-full overflow-hidden rounded-xl" />

      {/* ── Data bar overlay ── */}
      {!isLoading && data.length > 0 && (
        <div className="pointer-events-none absolute left-2 top-1 z-10 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium leading-4">
          {(() => {
            const bar = dataBar ?? (() => {
              // Default: show last bar + latest fundamental values
              const last = data[data.length - 1];
              const prev = data[data.length - 2];
              if (!last) return null;
              const chg = prev ? last.close - prev.close : 0;
              const chgPct = prev && prev.close !== 0 ? (chg / prev.close) * 100 : 0;
              const fv: DataBarInfo['fundamentals'] = [];
              for (const cfg of (fundamentalPanes ?? [])) {
                const v = findNearestFundValue(cfg.data, last.date);
                if (v != null) {
                  fv.push({
                    label: cfg.label,
                    value: formatFundamentalValue(v, cfg.unit),
                    color: METRIC_COLORS[cfg.colorIndex % METRIC_COLORS.length],
                  });
                }
              }
              return {
                date: last.date, open: last.open, high: last.high, low: last.low, close: last.close,
                volume: last.volume, change: chg, changePct: chgPct, isUp: chg >= 0,
                fundamentals: fv,
              } as DataBarInfo;
            })();
            if (!bar) return null;
            const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const upClass = 'text-green-600 dark:text-green-400';
            const dnClass = 'text-red-600 dark:text-red-400';
            const lbl = 'text-gray-400 dark:text-gray-500';
            const val = bar.isUp ? upClass : dnClass;
            return (
              <>
                <span className="text-gray-600 dark:text-gray-300">{symbol}</span>
                <span><span className={lbl}>O </span><span className={val}>{fmt(bar.open)}</span></span>
                <span><span className={lbl}>H </span><span className={val}>{fmt(bar.high)}</span></span>
                <span><span className={lbl}>L </span><span className={val}>{fmt(bar.low)}</span></span>
                <span><span className={lbl}>C </span><span className={val}>{fmt(bar.close)}</span></span>
                <span className={val}>
                  {bar.isUp ? '+' : ''}{fmt(bar.change)} ({bar.isUp ? '+' : ''}{bar.changePct.toFixed(2)}%)
                </span>
                <span><span className={lbl}>Vol </span><span className="text-gray-600 dark:text-gray-300">{bar.volume.toLocaleString('en-IN')}</span></span>
                {bar.fundamentals.length > 0 && (
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                )}
                {bar.fundamentals.map((f) => (
                  <span key={f.label}>
                    <span className={lbl}>{f.label} </span>
                    <span style={{ color: f.color }}>{f.value}</span>
                  </span>
                ))}
              </>
            );
          })()}
        </div>
      )}

      {!isLoading && data.length > 0 && (
        <div className="absolute bottom-3 left-3 z-10 flex gap-1">
          {([
            { icon: ZoomIn,   title: 'Zoom in',       action: () => zoom(0.5)  },
            { icon: ZoomOut,  title: 'Zoom out',      action: () => zoom(1.5)  },
            { icon: Maximize, title: 'Reset zoom',    action: resetZoom        },
          ] as const).map(({ icon: Icon, title, action }) => (
            <button
              key={title}
              onClick={action}
              title={title}
              className="rounded-md bg-white/90 p-1.5 text-gray-400 shadow-sm backdrop-blur-sm transition-colors hover:bg-gray-100 hover:text-gray-700 dark:bg-slate-800/90 dark:text-gray-500 dark:hover:bg-slate-700 dark:hover:text-white"
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white dark:bg-slate-900">
          <LoadingSpinner size="lg" label={`Loading ${symbol} data…`} />
        </div>
      )}

      {!isLoading && !data.length && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white dark:bg-slate-900">
          <EmptyState />
        </div>
      )}

      {/* Per-pane value labels + close buttons */}
      {(fundamentalPanes ?? []).map((config) => {
        const topOffset = paneOffsets.get(config.key);
        if (topOffset === undefined) return null;
        const color = METRIC_COLORS[config.colorIndex % METRIC_COLORS.length];
        // Use crosshair value if available, else latest value
        const pv = paneValues.get(config.key);
        const defaultVal = (() => {
          if (!config.data.length) return null;
          const last = data[data.length - 1];
          if (!last) return null;
          const v = findNearestFundValue(config.data, last.date);
          if (v == null) return null;
          return { value: formatFundamentalValue(v, config.unit), date: '' };
        })();
        const display = pv ?? defaultVal;
        return (
          <div
            key={`pane-label-${config.key}`}
            className="pointer-events-none absolute z-20 flex items-center gap-1.5"
            style={{ left: 8, top: topOffset + 4 }}
          >
            {onRemoveFundamental && (
              <button
                onClick={() => onRemoveFundamental(config.key)}
                title={`Remove ${config.label}`}
                className="pointer-events-auto flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white/90 text-gray-400 shadow-sm transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-slate-600 dark:bg-slate-800/80 dark:text-gray-500 dark:hover:border-red-700 dark:hover:bg-red-900/40 dark:hover:text-red-400"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <span className="text-[11px] font-semibold" style={{ color }}>{config.label}</span>
            {display && (
              <span className="text-[11px] font-medium text-gray-700 dark:text-gray-200">
                {display.value}
              </span>
            )}
            {pv?.date && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                ({pv.date})
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
