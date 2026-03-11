import { useEffect, useRef } from 'react';
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
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import type { ChartType, OHLCPoint } from '../../types/ohlc';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { EmptyState } from '../common/EmptyState';

interface CandlestickChartProps {
  data: OHLCPoint[];
  isLoading: boolean;
  symbol: string;
  chartType: ChartType;
}

const C = {
  background:  '#0F172A',
  text:        '#94A3B8',
  grid:        '#1E293B',
  border:      '#334155',
  bullish:     '#22C55E',
  bearish:     '#EF4444',
  line:        '#3B82F6',
  areaTop:     'rgba(59,130,246,0.3)',
  areaBottom:  'rgba(59,130,246,0.01)',
  crosshair:   '#475569',
};

export function CandlestickChart({ data, isLoading, symbol, chartType }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const priceRef     = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeRef    = useRef<ISeriesApi<'Histogram'> | null>(null);

  // ── Init chart once (container is always mounted) ──────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: C.background },
        textColor:  C.text,
        fontSize:   12,
      },
      grid: {
        vertLines: { color: C.grid },
        horzLines: { color: C.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: C.crosshair, labelBackgroundColor: '#334155' },
        horzLine: { color: C.crosshair, labelBackgroundColor: '#334155' },
      },
      rightPriceScale: {
        borderColor: C.border,
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor:    C.border,
        timeVisible:    true,
        secondsVisible: false,
      },
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 500,
    });

    // Volume histogram pinned to bottom 20%
    const vol = chart.addSeries(HistogramSeries, {
      color:        C.line,
      priceFormat:  { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current  = chart;
    volumeRef.current = vol;

    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current  = null;
      priceRef.current  = null;
      volumeRef.current = null;
    };
  }, []);

  // ── Rebuild price series + load data when data or chartType changes ──
  useEffect(() => {
    const chart = chartRef.current;
    const vol   = volumeRef.current;
    if (!chart || !vol || !data.length) return;

    // Remove old price series
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
      });
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
      });
      const lines: LineData[] = data.map((d) => ({ time: timeKey(d), value: d.close }));
      series.setData(lines);
      priceRef.current = series;

    } else {
      const series = chart.addSeries(AreaSeries, {
        lineColor:   C.line,
        topColor:    C.areaTop,
        bottomColor: C.areaBottom,
        lineWidth:   2,
      });
      const areas: AreaData[] = data.map((d) => ({ time: timeKey(d), value: d.close }));
      series.setData(areas);
      priceRef.current = series;
    }

    // Volume bars colored to match candle direction
    const volData: HistogramData[] = data.map((d) => ({
      time:  timeKey(d),
      value: d.volume,
      color: d.close >= d.open ? `${C.bullish}66` : `${C.bearish}66`,
    }));
    vol.setData(volData);

    chart.timeScale().fitContent();
  }, [data, chartType]);

  // ── Zoom helpers ─────────────────────────────────────────────────
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
    <div className="relative h-full w-full rounded-xl bg-slate-900">
      {/* Container always mounted so the init effect can attach the chart */}
      <div ref={containerRef} className="h-full w-full overflow-hidden rounded-xl" />

      {/* Zoom controls — bottom-left */}
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
              className="rounded-md bg-slate-800/80 p-1.5 text-slate-400 backdrop-blur-sm transition-colors hover:bg-slate-700 hover:text-white"
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900">
          <LoadingSpinner size="lg" label={`Loading ${symbol} data…`} />
        </div>
      )}

      {/* Empty state overlay */}
      {!isLoading && !data.length && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900">
          <EmptyState />
        </div>
      )}
    </div>
  );
}
