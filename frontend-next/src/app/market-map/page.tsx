"use client";

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import type { PieLabelRenderProps } from 'recharts';
import { Building2, TrendingUp, Calendar } from 'lucide-react';
import { useMarketStats } from '@/hooks/useMarketStats';
import { useMarketCapTrend } from '@/hooks/useMarketCapTrend';
import { TimeSeriesAreaChart } from '@/components/charts/TimeSeriesAreaChart';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useThemeStore } from '@/store/themeStore';

const BUCKET_COLORS = ['#64748B', '#3B82F6', '#22C55E', '#F59E0B', '#8B5CF6'];

function fmtCr(cr: number): string {
  if (cr >= 1_00_000) return `₹${(cr / 1_00_000).toFixed(2)} L Cr`;
  if (cr >= 1_000)    return `₹${(cr / 1_000).toFixed(2)} K Cr`;
  return `₹${cr.toFixed(2)} Cr`;
}

function useChartStyles() {
  const theme = useThemeStore((s) => s.theme);
  const dark = theme === 'dark';
  return {
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
    axisLineColor: dark ? '#334155' : '#E2E8F0',
    pieLabelFill: dark ? '#CBD5E1' : '#475569',
    legendColor: dark ? '#94A3B8' : '#64748B',
    cursorFill: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  };
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'text-gray-900 dark:text-white',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="rounded-lg bg-gray-100 p-2.5 dark:bg-slate-700">
        <Icon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
      </div>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className={`mt-0.5 text-2xl font-bold ${color}`}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
      </div>
    </div>
  );
}

const RADIAN = Math.PI / 180;

function RenderPieLabel({ pieLabelFill }: { pieLabelFill: string }) {
  return function renderLabel(props: PieLabelRenderProps) {
    const cx = (props.cx as number) ?? 0;
    const cy = (props.cy as number) ?? 0;
    const midAngle = (props.midAngle as number) ?? 0;
    const outerRadius = (props.outerRadius as number) ?? 0;
    const percent = (props.percent as number) ?? 0;
    if (percent < 0.02) return null;
    const radius = outerRadius + 16;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x}
        y={y}
        fill={pieLabelFill}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={11}
        fontWeight={600}
      >
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    );
  };
}

function barTooltipFormatter(value: number | undefined) {
  return [`${(value ?? 0).toLocaleString('en-IN')} companies`, 'Count'];
}

function pieTooltipFormatter(value: number | undefined) {
  return [fmtCr(value ?? 0), 'Market Cap'];
}

const BUCKET_CHARTS = [
  { key: 'large_count' as const, name: 'Large Cap', range: '₹1L+ Cr', color: BUCKET_COLORS[4] },
  { key: 'mid_count' as const, name: 'Mid Cap', range: '₹10K–1L Cr', color: BUCKET_COLORS[3] },
  { key: 'small_count' as const, name: 'Small Cap', range: '₹1K–10K Cr', color: BUCKET_COLORS[2] },
  { key: 'micro_count' as const, name: 'Micro Cap', range: '₹100–1K Cr', color: BUCKET_COLORS[1] },
  { key: 'nano_count' as const, name: 'Nano Cap', range: '₹0–100 Cr', color: BUCKET_COLORS[0] },
];

export default function MarketMapPage() {
  const { data, isLoading, error } = useMarketStats();
  const { data: trendData, isLoading: trendLoading } = useMarketCapTrend({ interval: 'monthly' });
  const styles = useChartStyles();

  const mcapSeries = useMemo(() => {
    if (!trendData?.data) return [];
    return trendData.data.map((d) => ({ time: d.date, value: d.total_market_cap_cr }));
  }, [trendData]);

  const bucketSeries = useMemo(() => {
    if (!trendData?.data) return {} as Record<string, { time: string; value: number }[]>;
    const out: Record<string, { time: string; value: number }[]> = {};
    for (const b of BUCKET_CHARTS) {
      out[b.key] = trendData.data.map((d) => ({ time: d.date, value: d[b.key] }));
    }
    return out;
  }, [trendData]);

  const renderPieLabel = useMemo(() => RenderPieLabel({ pieLabelFill: styles.pieLabelFill }), [styles.pieLabelFill]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" label="Loading market statistics…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          {error?.message ?? 'Failed to load market statistics.'}
        </div>
      </div>
    );
  }

  const buckets = data.buckets;
  const totalCap = data.total_market_cap_cr;

  const coloredBuckets = buckets.map((b, i) => ({
    ...b,
    fill: BUCKET_COLORS[i % BUCKET_COLORS.length],
  }));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Market Map</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Market capitalisation breakdown across all listed companies
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={Building2}
          label="Total Listed Companies"
          value={data.total_symbols.toLocaleString('en-IN')}
          sub="distinct symbols in database"
          color="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          icon={TrendingUp}
          label="Total Market Capitalisation"
          value={fmtCr(totalCap)}
          sub="sum of latest market cap per symbol"
          color="text-green-600 dark:text-green-400"
        />
        <StatCard
          icon={Calendar}
          label="Data as of"
          value={data.latest_date ?? '—'}
          sub="most recent date in dataset"
        />
      </div>

      {/* Overall Market Cap Trend */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
          Overall Market Cap Trend
        </h2>
        <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">
          Total market capitalisation across all listed companies (all history, monthly)
        </p>
        <div className="h-[400px]">
          <TimeSeriesAreaChart
            data={mcapSeries}
            isLoading={trendLoading}
            color="#3B82F6"
            label="market cap trend"
            formatValue={fmtCr}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
            No. of Companies by Market Cap
          </h2>
          <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">Count of listed companies per market cap range</p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={coloredBuckets} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fill: styles.axisColor, fontSize: 11 }}
                axisLine={{ stroke: styles.axisLineColor }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: styles.axisColor, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v.toLocaleString('en-IN')}
              />
              <Tooltip
                formatter={barTooltipFormatter}
                {...styles.tooltipStyle}
                cursor={{ fill: styles.cursorFill }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60} isAnimationActive={false}>
                {coloredBuckets.map((b, i) => (
                  <Cell key={b.label} fill={BUCKET_COLORS[i % BUCKET_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {buckets.map((b, i) => (
              <span key={b.label} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: BUCKET_COLORS[i % BUCKET_COLORS.length] }}
                />
                {b.category}: <span className="font-medium text-gray-900 dark:text-white">{b.count.toLocaleString('en-IN')}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
            Market Cap Distribution
          </h2>
          <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">Share of total market cap by segment</p>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={coloredBuckets}
                dataKey="total_cap_cr"
                nameKey="category"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                label={renderPieLabel}
                labelLine={false}
                isAnimationActive={false}
              >
                {coloredBuckets.map((b, i) => (
                  <Cell key={b.label} fill={BUCKET_COLORS[i % BUCKET_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={pieTooltipFormatter}
                {...styles.tooltipStyle}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: styles.legendColor }}
                iconType="square"
                iconSize={10}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Companies Over Time */}
      <div>
        <h2 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
          Companies Over Time by Market Cap
        </h2>
        <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">
          Number of companies in each segment over full history (monthly, scroll &amp; zoom enabled)
        </p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {BUCKET_CHARTS.map((b) => (
            <div key={b.key} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-sm shrink-0"
                  style={{ backgroundColor: b.color }}
                />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{b.name}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{b.range}</span>
              </div>
              <div className="h-[250px]">
                <TimeSeriesAreaChart
                  data={bucketSeries[b.key] ?? []}
                  isLoading={trendLoading}
                  color={b.color}
                  label={b.name}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Segment Summary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500 dark:border-slate-700 dark:text-gray-400">
                <th className="px-5 py-2.5 text-left font-medium">Segment</th>
                <th className="px-5 py-2.5 text-left font-medium">Range (Cr)</th>
                <th className="px-5 py-2.5 text-right font-medium">Companies</th>
                <th className="px-5 py-2.5 text-right font-medium">% of Total</th>
                <th className="px-5 py-2.5 text-right font-medium">Market Cap</th>
                <th className="px-5 py-2.5 text-right font-medium">Cap %</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, i) => (
                <tr key={b.label} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors dark:border-slate-800 dark:hover:bg-blue-900/30">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-3 w-3 rounded-sm shrink-0"
                        style={{ backgroundColor: BUCKET_COLORS[i % BUCKET_COLORS.length] }}
                      />
                      <span className="font-medium text-gray-900 dark:text-white">{b.category}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{b.label}</td>
                  <td className="px-5 py-3 text-right font-medium text-gray-900 dark:text-white">
                    {b.count.toLocaleString('en-IN')}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-500 dark:text-gray-400">
                    {data.total_symbols > 0
                      ? `${((b.count / data.total_symbols) * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-green-600 dark:text-green-400">
                    {fmtCr(b.total_cap_cr)}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-500 dark:text-gray-400">
                    {totalCap > 0
                      ? `${((b.total_cap_cr / totalCap) * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 text-xs font-semibold dark:bg-slate-900/50">
                <td className="px-5 py-3 text-gray-700 dark:text-gray-300" colSpan={2}>Total</td>
                <td className="px-5 py-3 text-right text-gray-900 dark:text-white">
                  {data.total_symbols.toLocaleString('en-IN')}
                </td>
                <td className="px-5 py-3 text-right text-gray-500 dark:text-gray-400">100%</td>
                <td className="px-5 py-3 text-right text-green-600 dark:text-green-400">{fmtCr(totalCap)}</td>
                <td className="px-5 py-3 text-right text-gray-500 dark:text-gray-400">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
