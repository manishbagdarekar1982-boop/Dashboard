"use client";

import { useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { X } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';
import type { FundamentalDataPoint } from '@/types/fundamentals';

const METRIC_COLORS = [
  '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981',
  '#EF4444', '#EC4899', '#06B6D4', '#84CC16',
];

interface FundamentalSubChartProps {
  metricKey: string;
  label: string;
  unit: string;
  chartType: string; // "bar" | "line"
  data: FundamentalDataPoint[];
  colorIndex: number;
  onRemove: () => void;
}

function formatValue(value: number | null, unit: string): string {
  if (value === null || value === undefined) return '—';
  if (unit === 'cr') {
    const abs = Math.abs(value);
    if (abs >= 100) return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
    return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr`;
  }
  if (unit === 'pct') return `${value.toFixed(2)}%`;
  if (unit === 'days') return `${value.toFixed(0)} days`;
  return value.toFixed(2);
}

function formatYAxis(value: number, unit: string): string {
  if (unit === 'cr') {
    const abs = Math.abs(value);
    if (abs >= 1000) return `${(value / 1000).toFixed(0)}K`;
    return value.toFixed(0);
  }
  if (unit === 'pct') return `${value.toFixed(0)}%`;
  if (unit === 'days') return `${value.toFixed(0)}`;
  return value.toFixed(1);
}

const MONTH_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatPeriodLabel(date: string): string {
  // "2025-03-31" → "Mar 25", "2025-06-30" → "Jun 25"
  // Also handles "2025-03" format
  const parts = date.split('-');
  if (parts.length < 2) return date;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (!year || !month || month < 1 || month > 12) return date;
  return `${MONTH_SHORT[month]} ${String(year).slice(-2)}`;
}

export function FundamentalSubChart({
  label,
  unit,
  chartType,
  data,
  colorIndex,
  onRemove,
}: FundamentalSubChartProps) {
  const theme = useThemeStore((s) => s.theme);
  const dark = theme === 'dark';
  const color = METRIC_COLORS[colorIndex % METRIC_COLORS.length];

  const chartData = useMemo(
    () => data.filter((d) => d.value !== null).map((d) => ({
      date: d.date,
      value: d.value,
      label: formatPeriodLabel(d.date),
    })),
    [data],
  );

  const latestValue = chartData.length > 0 ? chartData[chartData.length - 1].value : null;

  const tooltipStyle = useMemo(() => ({
    contentStyle: {
      backgroundColor: dark ? '#1E293B' : '#FFFFFF',
      border: `1px solid ${dark ? '#475569' : '#E2E8F0'}`,
      borderRadius: '6px',
      fontSize: '11px',
      color: dark ? '#F1F5F9' : '#1E293B',
      padding: '6px 10px',
    },
    itemStyle: { color: dark ? '#94A3B8' : '#475569' },
    labelStyle: { color: dark ? '#F1F5F9' : '#1E293B', fontWeight: 600 },
  }), [dark]);

  const axisColor = dark ? '#64748B' : '#94A3B8';
  const gridColor = dark ? '#1E293B' : '#F1F5F9';

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-slate-700">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">No data</span>
          <button onClick={onRemove} className="text-gray-400 hover:text-red-500 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  const renderChart = () => {
    if (chartType === 'bar') {
      return (
        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: axisColor }}
            axisLine={{ stroke: gridColor }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 9, fill: axisColor }}
            axisLine={false}
            tickLine={false}
            width={45}
            tickFormatter={(v: number) => formatYAxis(v, unit)}
          />
          <Tooltip
            formatter={(value: number | undefined) => [formatValue(value ?? null, unit), label]}
            labelFormatter={(l) => String(l ?? '')}
            {...tooltipStyle}
          />
          <Bar dataKey="value" radius={[2, 2, 0, 0]} maxBarSize={18}>
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.value !== null && entry.value >= 0
                  ? (dark ? '#22C55E' : '#16A34A')
                  : (dark ? '#EF4444' : '#DC2626')
                }
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      );
    }

    // Line / Area chart
    return (
      <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`grad-${label.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: axisColor }}
          axisLine={{ stroke: gridColor }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 9, fill: axisColor }}
          axisLine={false}
          tickLine={false}
          width={45}
          tickFormatter={(v: number) => formatYAxis(v, unit)}
        />
        <Tooltip
          formatter={(value: number | undefined) => [formatValue(value ?? null, unit), label]}
          labelFormatter={(l) => String(l ?? '')}
          {...tooltipStyle}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#grad-${label.replace(/\W/g, '')})`}
          dot={false}
          connectNulls
        />
      </AreaChart>
    );
  };

  return (
    <div className="border-b border-gray-200 dark:border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-2 pb-0">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-900 dark:text-white">
            {formatValue(latestValue, unit)}
          </span>
          <button
            onClick={onRemove}
            className="text-gray-400 hover:text-red-500 transition-colors"
            title={`Remove ${label}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {/* Chart */}
      <div className="h-[100px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
