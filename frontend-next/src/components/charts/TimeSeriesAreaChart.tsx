"use client";

import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type AreaData,
} from 'lightweight-charts';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useThemeStore } from '@/store/themeStore';

interface TimeSeriesPoint {
  time: string;
  value: number;
}

interface TimeSeriesAreaChartProps {
  data: TimeSeriesPoint[];
  isLoading?: boolean;
  color?: string;
  label?: string;
  formatValue?: (value: number) => string;
}

const LIGHT = {
  background: '#FFFFFF', text: '#64748B', grid: '#F1F5F9',
  border: '#E2E8F0', crosshair: '#94A3B8', labelBg: '#475569',
};

const DARK = {
  background: '#0F172A', text: '#94A3B8', grid: '#1E293B',
  border: '#334155', crosshair: '#475569', labelBg: '#334155',
};

export function TimeSeriesAreaChart({
  data,
  isLoading = false,
  color = '#3B82F6',
  label,
  formatValue,
}: TimeSeriesAreaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const theme = useThemeStore((s) => s.theme);
  const C = theme === 'dark' ? DARK : LIGHT;

  // Init chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: C.background },
        textColor: C.text,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: C.grid },
        horzLines: { color: C.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: C.crosshair, labelBackgroundColor: C.labelBg },
        horzLine: { color: C.crosshair, labelBackgroundColor: C.labelBg },
      },
      rightPriceScale: {
        borderColor: C.border,
        scaleMargins: { top: 0.08, bottom: 0.05 },
      },
      timeScale: {
        borderColor: C.border,
        timeVisible: false,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 300,
      localization: formatValue ? {
        priceFormatter: formatValue,
      } : undefined,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: `${color}4D`,
      bottomColor: `${color}03`,
      lineWidth: 2,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // Update data & color
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || !data.length) return;

    series.applyOptions({
      lineColor: color,
      topColor: `${color}4D`,
      bottomColor: `${color}03`,
    });

    const areaData: AreaData[] = data.map((d) => ({
      time: d.time as `${number}-${number}-${number}`,
      value: d.value,
    }));
    series.setData(areaData);
    chart.timeScale().fitContent();
  }, [data, color, theme]);

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

      {!isLoading && data.length > 0 && (
        <div className="absolute bottom-3 left-3 z-10 flex gap-1">
          {([
            { icon: ZoomIn,   title: 'Zoom in',    action: () => zoom(0.5) },
            { icon: ZoomOut,  title: 'Zoom out',   action: () => zoom(1.5) },
            { icon: Maximize, title: 'Reset zoom', action: resetZoom },
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
          <LoadingSpinner size="md" label={label ? `Loading ${label}…` : 'Loading…'} />
        </div>
      )}

      {!isLoading && !data.length && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white text-sm text-gray-400 dark:bg-slate-900">
          No data available
        </div>
      )}
    </div>
  );
}
