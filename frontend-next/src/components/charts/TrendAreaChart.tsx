"use client";

import { useCallback, useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Brush, ReferenceArea,
} from 'recharts';
import { useThemeStore } from '@/store/themeStore';
import type { TrendDataPoint } from '@/types/marketOverviewTrends';

interface TrendAreaChartProps {
  data: TrendDataPoint[];
  color: string;
  title: string;
  subtitle?: string;
  formatValue?: (value: number) => string;
}

export function TrendAreaChart({
  data,
  color,
  title,
  subtitle,
  formatValue = (v) => v.toLocaleString('en-IN'),
}: TrendAreaChartProps) {
  const theme = useThemeStore((s) => s.theme);
  const dark = theme === 'dark';

  // Zoom state: drag to select range, double-click to reset
  const [refAreaLeft, setRefAreaLeft] = useState<string>('');
  const [refAreaRight, setRefAreaRight] = useState<string>('');
  const [zoomDomain, setZoomDomain] = useState<{ left: number; right: number } | null>(null);

  const gradientId = useMemo(
    () => `grad-${title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}`,
    [title],
  );

  const styles = useMemo(() => ({
    tooltipStyle: {
      contentStyle: {
        backgroundColor: dark ? '#1E293B' : '#FFFFFF',
        border: `1px solid ${dark ? '#475569' : '#E2E8F0'}`,
        borderRadius: '8px',
        fontSize: '12px',
        color: dark ? '#F1F5F9' : '#1E293B',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
      },
      itemStyle: { color: dark ? '#94A3B8' : '#475569' },
      labelStyle: { color: dark ? '#F1F5F9' : '#1E293B', fontWeight: 600, marginBottom: 4 },
    },
    axisColor: dark ? '#94A3B8' : '#64748B',
    gridColor: dark ? '#1E293B' : '#F1F5F9',
    axisLineColor: dark ? '#334155' : '#E2E8F0',
  }), [dark]);

  const cleanData = useMemo(
    () => data.filter((d) => d.value !== null),
    [data],
  );

  // Compute visible data based on zoom
  const visibleData = useMemo(() => {
    if (!zoomDomain) return cleanData;
    return cleanData.slice(zoomDomain.left, zoomDomain.right + 1);
  }, [cleanData, zoomDomain]);

  const handleMouseDown = useCallback((e: { activeLabel?: string | number }) => {
    if (e?.activeLabel != null) setRefAreaLeft(String(e.activeLabel));
  }, []);

  const handleMouseMove = useCallback((e: { activeLabel?: string | number }) => {
    if (refAreaLeft && e?.activeLabel != null) setRefAreaRight(String(e.activeLabel));
  }, [refAreaLeft]);

  const handleMouseUp = useCallback(() => {
    if (!refAreaLeft || !refAreaRight) {
      setRefAreaLeft('');
      setRefAreaRight('');
      return;
    }
    // Find indices
    let idxL = cleanData.findIndex((d) => d.period === refAreaLeft);
    let idxR = cleanData.findIndex((d) => d.period === refAreaRight);
    if (idxL > idxR) [idxL, idxR] = [idxR, idxL];

    if (idxR - idxL >= 1) {
      setZoomDomain({ left: idxL, right: idxR });
    }
    setRefAreaLeft('');
    setRefAreaRight('');
  }, [refAreaLeft, refAreaRight, cleanData]);

  const handleReset = useCallback(() => {
    setZoomDomain(null);
  }, []);

  if (cleanData.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h3 className="mb-0.5 text-xs font-semibold text-gray-900 dark:text-white">{title}</h3>
        {subtitle && <p className="mb-3 text-[10px] text-gray-400 dark:text-gray-500 italic">{subtitle}</p>}
        <div className="flex h-[180px] items-center justify-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">No data available</p>
        </div>
      </div>
    );
  }

  const showBrush = cleanData.length > 6;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start justify-between mb-0.5">
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-white">{title}</h3>
          {subtitle && <p className="mb-3 text-[10px] text-gray-400 dark:text-gray-500 italic">{subtitle}</p>}
        </div>
        {zoomDomain && (
          <button
            onClick={handleReset}
            className="ml-2 shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600 transition-colors"
            title="Reset zoom"
          >
            Reset
          </button>
        )}
      </div>
      <p className="mb-1 text-[9px] text-gray-400 dark:text-gray-500">
        {zoomDomain ? 'Click "Reset" to zoom out' : 'Drag on chart to zoom in'}
      </p>
      <ResponsiveContainer width="100%" height={showBrush ? 220 : 180}>
        <AreaChart
          data={visibleData}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={styles.gridColor} />
          <XAxis
            dataKey="period"
            tick={{ fill: styles.axisColor, fontSize: 9 }}
            axisLine={{ stroke: styles.axisLineColor }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: styles.axisColor, fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => formatValue(v)}
            width={60}
            domain={['auto', 'auto']}
          />
          <Tooltip
            formatter={(value: number | undefined) => [formatValue(value ?? 0), '']}
            {...styles.tooltipStyle}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={{ r: 2.5, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 4, strokeWidth: 1.5 }}
            isAnimationActive={false}
          />
          {refAreaLeft && refAreaRight && (
            <ReferenceArea
              x1={refAreaLeft}
              x2={refAreaRight}
              strokeOpacity={0.3}
              fill={dark ? '#3B82F6' : '#93C5FD'}
              fillOpacity={0.3}
            />
          )}
          {showBrush && !zoomDomain && (
            <Brush
              dataKey="period"
              height={20}
              stroke={dark ? '#475569' : '#CBD5E1'}
              fill={dark ? '#0F172A' : '#F8FAFC'}
              tickFormatter={(v: string) => v}
              travellerWidth={8}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
