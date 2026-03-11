"use client";

import { useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
  BarChart, Bar, ReferenceLine,
} from 'recharts';
import type { PieLabelRenderProps } from 'recharts';
import { Users, TrendingUp, Building2, Shield, BarChart3, Factory, ChevronUp, ChevronDown, Activity } from 'lucide-react';
import { StockSearch } from '@/components/forms/StockSearch';
import { SectorSelect } from '@/components/forms/SectorSelect';
import { MiniSparkline } from '@/components/charts/MiniSparkline';
import { useStockStore } from '@/store/stockStore';
import { useShareholding, useIndustryTrend, useAllSectorsSummary, useSectorAnalytics } from '@/api/shareholding';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useThemeStore } from '@/store/themeStore';
import type { SectorSummaryRow, SectorQuarterAnalytics } from '@/types/shareholding';

const CATEGORY_COLORS = [
  '#3B82F6', // Promoter — blue
  '#EF4444', // FII — red
  '#8B5CF6', // Mutual Funds — purple
  '#F59E0B', // Insurance — amber
  '#22C55E', // Retail — green
  '#06B6D4', // Govt — cyan
  '#EC4899', // Corporate — pink
  '#64748B', // Others — slate
];

const TREND_COLORS = {
  promoter: '#3B82F6',
  fii: '#EF4444',
  dii: '#8B5CF6',
  retail: '#22C55E',
  others: '#64748B',
};

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
    gridColor: dark ? '#1E293B' : '#F1F5F9',
    pieLabelFill: dark ? '#CBD5E1' : '#475569',
    legendColor: dark ? '#94A3B8' : '#64748B',
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
    if (percent < 0.03) return null;
    const radius = outerRadius + 18;
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

function fmtShares(n: number): string {
  if (n >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `${(n / 1_00_000).toFixed(2)} L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} K`;
  return n.toLocaleString('en-IN');
}

const INDUSTRY_CHART_CONFIG = [
  { key: 'promoter' as const, title: 'Promoter Trend', color: '#3B82F6', desc: 'Average promoter holding across sector' },
  { key: 'fii' as const, title: 'FII/FPI Trend', color: '#EF4444', desc: 'Average foreign institutional holding' },
  { key: 'dii' as const, title: 'DII Trend', color: '#8B5CF6', desc: 'Average domestic institutional holding (MF + Insurance)' },
  { key: 'public' as const, title: 'Public/Retail Trend', color: '#22C55E', desc: 'Average retail investor holding' },
];

export default function CapitalCompositionPage() {
  const selectedSymbol = useStockStore((s) => s.selectedSymbol);
  const { data, isLoading, error } = useShareholding(selectedSymbol);
  const styles = useChartStyles();

  // Industry trend state
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const { data: industryData, isLoading: industryLoading } = useIndustryTrend(selectedSector);

  const renderPieLabel = useMemo(
    () => RenderPieLabel({ pieLabelFill: styles.pieLabelFill }),
    [styles.pieLabelFill],
  );

  // Calculate DII (MF + Insurance) for stat card
  const promoterPct = data?.categories.find((c) => c.name === 'Promoter')?.percentage ?? 0;
  const fiiPct = data?.categories.find((c) => c.name === 'FII/FPI')?.percentage ?? 0;
  const mfPct = data?.categories.find((c) => c.name === 'Mutual Funds')?.percentage ?? 0;
  const insPct = data?.categories.find((c) => c.name === 'Insurance')?.percentage ?? 0;
  const diiPct = mfPct + insPct;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Capital Composition</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Shareholding pattern analysis — who owns the company
          </p>
        </div>
        <StockSearch />
      </div>

      {/* No symbol selected */}
      {!selectedSymbol && (
        <div className="flex h-64 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <p className="text-sm text-gray-400 dark:text-gray-500">Select a stock symbol to view shareholding data</p>
        </div>
      )}

      {/* Loading */}
      {selectedSymbol && isLoading && (
        <div className="flex h-64 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading shareholding data…" />
        </div>
      )}

      {/* Error */}
      {selectedSymbol && error && !isLoading && (
        <div className="flex h-64 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900 dark:text-white">No shareholding data available</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Shareholding data for <span className="font-semibold">{selectedSymbol}</span> is not available in the database.
            </p>
          </div>
        </div>
      )}

      {/* Data loaded */}
      {data && (
        <>
          {/* Company header */}
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{data.company_name}</h2>
            {data.sector && (
              <span className="rounded-full bg-blue-100 px-3 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                {data.sector}
              </span>
            )}
            {data.mcap_type && (
              <span className="rounded-full bg-purple-100 px-3 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                {data.mcap_type}
              </span>
            )}
            {data.latest_quarter && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Data as of {data.latest_quarter}
              </span>
            )}
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={TrendingUp}
              label="Promoter Holding"
              value={`${promoterPct.toFixed(1)}%`}
              sub="Promoter & promoter group"
              color="text-blue-600 dark:text-blue-400"
            />
            <StatCard
              icon={Building2}
              label="FII/FPI Holding"
              value={`${fiiPct.toFixed(1)}%`}
              sub="Foreign institutional investors"
              color="text-red-500 dark:text-red-400"
            />
            <StatCard
              icon={Shield}
              label="DII Holding"
              value={`${diiPct.toFixed(1)}%`}
              sub={`MF ${mfPct.toFixed(1)}% + Insurance ${insPct.toFixed(1)}%`}
              color="text-purple-600 dark:text-purple-400"
            />
            <StatCard
              icon={Users}
              label="Total Shares"
              value={fmtShares(data.total_shares)}
              sub="Total outstanding shares"
            />
          </div>

          {/* Pie chart + table side by side */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            {/* Donut Chart */}
            <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                Ownership Breakdown
              </h3>
              <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">
                Category-wise shareholding ({data.latest_quarter})
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.categories}
                    dataKey="percentage"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    label={renderPieLabel}
                    labelLine={false}
                    isAnimationActive={false}
                  >
                    {data.categories.map((c, i) => (
                      <Cell key={c.name} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(2)}%`, 'Stake']}
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

            {/* Category Table */}
            <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden dark:border-slate-700 dark:bg-slate-800">
              <div className="px-5 py-3 border-b border-gray-200 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Shareholding Categories</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500 dark:border-slate-700 dark:text-gray-400">
                      <th className="px-5 py-2.5 text-left font-medium">Category</th>
                      <th className="px-5 py-2.5 text-right font-medium">Holding %</th>
                      <th className="px-5 py-2.5 text-right font-medium">Shares</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.categories.map((c, i) => (
                      <tr key={c.name} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors dark:border-slate-800 dark:hover:bg-blue-900/30">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="h-3 w-3 rounded-sm shrink-0"
                              style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
                            />
                            <span className="font-medium text-gray-900 dark:text-white">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900 dark:text-white">
                          {c.percentage.toFixed(2)}%
                        </td>
                        <td className="px-5 py-3 text-right text-gray-500 dark:text-gray-400">
                          {c.shares > 0 ? fmtShares(c.shares) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Quarterly Trend — Stacked Area */}
          {data.quarterly_trend.length > 1 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
              <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
                Shareholding Trend
              </h3>
              <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">
                Quarterly ownership trend — Promoter, FII, DII, Retail, Others
              </p>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={data.quarterly_trend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={styles.gridColor} />
                  <XAxis
                    dataKey="quarter"
                    tick={{ fill: styles.axisColor, fontSize: 10 }}
                    axisLine={{ stroke: styles.axisLineColor }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: styles.axisColor, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip
                    formatter={(value: number | undefined, name: string | undefined) => [`${(value ?? 0).toFixed(2)}%`, name ?? '']}
                    {...styles.tooltipStyle}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: styles.legendColor }}
                    iconType="square"
                    iconSize={10}
                  />
                  <Area type="monotone" dataKey="promoter" name="Promoter" stackId="1" stroke={TREND_COLORS.promoter} fill={TREND_COLORS.promoter} fillOpacity={0.6} isAnimationActive={false} />
                  <Area type="monotone" dataKey="fii" name="FII/FPI" stackId="1" stroke={TREND_COLORS.fii} fill={TREND_COLORS.fii} fillOpacity={0.6} isAnimationActive={false} />
                  <Area type="monotone" dataKey="dii" name="DII" stackId="1" stroke={TREND_COLORS.dii} fill={TREND_COLORS.dii} fillOpacity={0.6} isAnimationActive={false} />
                  <Area type="monotone" dataKey="retail" name="Retail" stackId="1" stroke={TREND_COLORS.retail} fill={TREND_COLORS.retail} fillOpacity={0.6} isAnimationActive={false} />
                  <Area type="monotone" dataKey="others" name="Others" stackId="1" stroke={TREND_COLORS.others} fill={TREND_COLORS.others} fillOpacity={0.6} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Major Shareholders Table */}
          {data.major_shareholders.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden dark:border-slate-700 dark:bg-slate-800">
              <div className="px-5 py-3 border-b border-gray-200 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Major Shareholders ({'>'}1% stake)
                </h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {data.major_shareholders[0]?.date && `As of ${data.major_shareholders[0].date}`}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-gray-500 dark:border-slate-700 dark:text-gray-400">
                      <th className="px-5 py-2.5 text-left font-medium">#</th>
                      <th className="px-5 py-2.5 text-left font-medium">Shareholder</th>
                      <th className="px-5 py-2.5 text-left font-medium">Type</th>
                      <th className="px-5 py-2.5 text-right font-medium">Stake %</th>
                      <th className="px-5 py-2.5 text-right font-medium">Shares</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.major_shareholders.map((s, i) => (
                      <tr key={`${s.name}-${i}`} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors dark:border-slate-800 dark:hover:bg-blue-900/30">
                        <td className="px-5 py-3 text-gray-400 dark:text-gray-500">{i + 1}</td>
                        <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{s.name}</td>
                        <td className="px-5 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            s.type.toLowerCase().includes('promoter')
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                              : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300'
                          }`}>
                            {s.type || 'Public'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-900 dark:text-white">
                          {s.percentage.toFixed(2)}%
                        </td>
                        <td className="px-5 py-3 text-right text-gray-500 dark:text-gray-400">
                          {s.shares > 0 ? fmtShares(s.shares) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          INDUSTRY-WISE SHAREHOLDING TRENDS
          ═══════════════════════════════════════════════════════════════ */}
      <div className="border-t border-gray-200 dark:border-slate-700 pt-8 mt-2">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Industry-Wise Shareholding Trends
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Aggregated shareholding averages across all companies in a sector
            </p>
          </div>
          <SectorSelect value={selectedSector} onSelect={setSelectedSector} />
        </div>

        {/* No sector selected */}
        {!selectedSector && (
          <div className="flex h-48 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm text-gray-400 dark:text-gray-500">Select a sector to view industry-wise trends</p>
          </div>
        )}

        {/* Loading */}
        {selectedSector && industryLoading && (
          <div className="flex h-48 items-center justify-center">
            <LoadingSpinner size="lg" label="Aggregating sector data…" />
          </div>
        )}

        {/* Industry data loaded */}
        {industryData && industryData.quarters.length > 0 && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
              <StatCard
                icon={Factory}
                label="Sector"
                value={industryData.sector}
                color="text-blue-600 dark:text-blue-400"
              />
              <StatCard
                icon={Building2}
                label="Companies in Sector"
                value={industryData.total_companies.toLocaleString('en-IN')}
                sub="Total companies with shareholding data"
              />
              <StatCard
                icon={BarChart3}
                label="Latest Quarter"
                value={industryData.quarters[industryData.quarters.length - 1].quarter}
                sub={`${industryData.quarters[industryData.quarters.length - 1].companies_count} companies reported`}
              />
            </div>

            {/* 4 Line Charts — 2x2 grid */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {INDUSTRY_CHART_CONFIG.map(({ key, title, color, desc }) => (
                <div
                  key={key}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800"
                >
                  <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
                  <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">{desc}</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={industryData.quarters} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={styles.gridColor} />
                      <XAxis
                        dataKey="quarter"
                        tick={{ fill: styles.axisColor, fontSize: 10 }}
                        axisLine={{ stroke: styles.axisLineColor }}
                        tickLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: styles.axisColor, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <Tooltip
                        formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(2)}%`, title]}
                        labelFormatter={(label) => {
                          const labelStr = String(label ?? '');
                          const q = industryData.quarters.find((d) => d.quarter === labelStr);
                          return q ? `${labelStr} (${q.companies_count} companies)` : labelStr;
                        }}
                        {...styles.tooltipStyle}
                      />
                      <Line
                        type="monotone"
                        dataKey={key}
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0, fill: color }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Industry data with no quarters */}
        {industryData && industryData.quarters.length === 0 && (
          <div className="flex h-48 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm text-gray-400 dark:text-gray-500">No quarterly data available for this sector</p>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTOR SHAREHOLDING FLOW ANALYSIS
          ═══════════════════════════════════════════════════════════════ */}
      <SectorFlowAnalysisSection
        selectedSector={selectedSector}
        onSectorSelect={setSelectedSector}
        styles={styles}
      />

      {/* ═══════════════════════════════════════════════════════════════
          ALL SECTORS SHAREHOLDING SUMMARY TABLE
          ═══════════════════════════════════════════════════════════════ */}
      <AllSectorsSummarySection
        onSectorClick={(sector) => setSelectedSector(sector)}
      />
    </div>
  );
}

// --- Sector flow analysis section ---

const HOLDER_COLORS = {
  promoter: { main: '#3B82F6', light: '#93C5FD' },
  fii: { main: '#EF4444', light: '#FCA5A5' },
  dii: { main: '#8B5CF6', light: '#C4B5FD' },
  public: { main: '#22C55E', light: '#86EFAC' },
};

const HOLDER_KEYS = ['promoter', 'fii', 'dii', 'public'] as const;
type HolderKey = typeof HOLDER_KEYS[number];

function fmtCrore(n: number): string {
  const cr = n / 1e7;
  if (Math.abs(cr) >= 1000) return `${(cr / 1000).toFixed(1)}K Cr`;
  if (Math.abs(cr) >= 1) return `${cr.toFixed(1)} Cr`;
  const lakh = n / 1e5;
  return `${lakh.toFixed(1)} L`;
}

function SectorFlowAnalysisSection({
  selectedSector,
  onSectorSelect,
  styles,
}: {
  selectedSector: string | null;
  onSectorSelect: (s: string | null) => void;
  styles: ReturnType<typeof useChartStyles>;
}) {
  const { data: analytics, isLoading, error } = useSectorAnalytics(selectedSector);
  const [activeHolder, setActiveHolder] = useState<HolderKey>('fii');
  const [weightMode, setWeightMode] = useState<'mcap_weighted' | 'equal_weighted'>('mcap_weighted');

  // Build decomposition bar chart data for the active holder
  const decompData = useMemo(() => {
    if (!analytics?.quarters) return [];
    return analytics.quarters.map((q) => {
      const ht = q[activeHolder];
      return {
        quarter: q.quarter,
        price_effect: ht.price_effect ?? 0,
        holding_effect: ht.holding_effect ?? 0,
        value_change: ht.value_change ?? 0,
      };
    });
  }, [analytics, activeHolder]);

  // Build accumulation index line chart data
  const accumData = useMemo(() => {
    if (!analytics?.quarters) return [];
    return analytics.quarters.map((q) => {
      const m = q[weightMode];
      return {
        quarter: q.quarter,
        promoter: m.promoter_accum_index ?? null,
        fii: m.fii_accum_index ?? null,
        dii: m.dii_accum_index ?? null,
        public: m.public_accum_index ?? null,
      };
    });
  }, [analytics, weightMode]);

  // Latest quarter stats
  const latest = analytics?.quarters[analytics.quarters.length - 1];

  return (
    <div className="border-t border-gray-200 dark:border-slate-700 pt-8 mt-2">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Sector Shareholding Flow Analysis
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Decompose value changes into price effect and holding effect — cross-database analytics
          </p>
        </div>
        <SectorSelect value={selectedSector} onSelect={onSectorSelect} />
      </div>

      {!selectedSector && (
        <div className="flex h-48 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <p className="text-sm text-gray-400 dark:text-gray-500">Select a sector to view flow analysis</p>
        </div>
      )}

      {selectedSector && isLoading && (
        <div className="flex h-48 items-center justify-center">
          <LoadingSpinner size="lg" label="Computing cross-database analytics…" />
        </div>
      )}

      {selectedSector && error && !isLoading && (
        <div className="flex h-48 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <p className="text-sm text-gray-400 dark:text-gray-500">Failed to load sector analytics</p>
        </div>
      )}

      {analytics && analytics.quarters.length > 0 && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <StatCard
              icon={Factory}
              label="Matched Companies"
              value={`${analytics.matched_companies} / ${analytics.total_companies}`}
              sub="Companies with price + holding data"
              color="text-blue-600 dark:text-blue-400"
            />
            <StatCard
              icon={BarChart3}
              label="Sector Market Cap"
              value={latest ? fmtCrore(latest.total_sector_mcap) : '—'}
              sub="Total mcap of matched companies"
            />
            <StatCard
              icon={TrendingUp}
              label="FII Flow"
              value={latest?.mcap_weighted.fii_flow != null ? fmtCrore(latest.mcap_weighted.fii_flow) : '—'}
              sub="Latest quarter holding effect"
              color={latest?.mcap_weighted.fii_flow != null && latest.mcap_weighted.fii_flow > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}
            />
            <StatCard
              icon={Shield}
              label="DII Flow"
              value={latest?.mcap_weighted.dii_flow != null ? fmtCrore(latest.mcap_weighted.dii_flow) : '—'}
              sub="Latest quarter holding effect"
              color={latest?.mcap_weighted.dii_flow != null && latest.mcap_weighted.dii_flow > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}
            />
          </div>

          {/* Decomposition Bar Chart */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Value Change Decomposition
                </h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Stacked bars: Price Effect (lighter) + Holding Effect (darker) = Value Change
                </p>
              </div>
              <div className="flex gap-1">
                {HOLDER_KEYS.map((hk) => (
                  <button
                    key={hk}
                    onClick={() => setActiveHolder(hk)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeHolder === hk
                        ? 'text-white shadow-sm'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
                    }`}
                    style={activeHolder === hk ? { backgroundColor: HOLDER_COLORS[hk].main } : undefined}
                  >
                    {hk === 'fii' ? 'FII' : hk === 'dii' ? 'DII' : hk.charAt(0).toUpperCase() + hk.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={decompData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={styles.gridColor} />
                <XAxis
                  dataKey="quarter"
                  tick={{ fill: styles.axisColor, fontSize: 10 }}
                  axisLine={{ stroke: styles.axisLineColor }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: styles.axisColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => fmtCrore(v)}
                />
                <Tooltip
                  formatter={(value: number | undefined, name: string | undefined) => [
                    fmtCrore(value ?? 0),
                    name ?? '',
                  ]}
                  {...styles.tooltipStyle}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: styles.legendColor }}
                  iconType="square"
                  iconSize={10}
                />
                <ReferenceLine y={0} stroke={styles.axisLineColor} />
                <Bar dataKey="price_effect" name="Price Effect" stackId="decomp" fill={HOLDER_COLORS[activeHolder].light} isAnimationActive={false} />
                <Bar dataKey="holding_effect" name="Holding Effect" stackId="decomp" fill={HOLDER_COLORS[activeHolder].main} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Accumulation Index Line Chart */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Accumulation Index
                </h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Holding effect as % of sector market cap — positive = accumulation, negative = distribution
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setWeightMode('mcap_weighted')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    weightMode === 'mcap_weighted'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
                  }`}
                >
                  Mcap Weighted
                </button>
                <button
                  onClick={() => setWeightMode('equal_weighted')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    weightMode === 'equal_weighted'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
                  }`}
                >
                  Equal Weighted
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={accumData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={styles.gridColor} />
                <XAxis
                  dataKey="quarter"
                  tick={{ fill: styles.axisColor, fontSize: 10 }}
                  axisLine={{ stroke: styles.axisLineColor }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: styles.axisColor, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  formatter={(value: number | undefined, name: string | undefined) => [
                    value != null ? `${(value).toFixed(4)}%` : '—',
                    name ?? '',
                  ]}
                  {...styles.tooltipStyle}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: styles.legendColor }}
                  iconType="line"
                  iconSize={14}
                />
                <ReferenceLine y={0} stroke={styles.axisLineColor} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="promoter" name="Promoter" stroke={HOLDER_COLORS.promoter.main} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="fii" name="FII" stroke={HOLDER_COLORS.fii.main} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="dii" name="DII" stroke={HOLDER_COLORS.dii.main} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="public" name="Public" stroke={HOLDER_COLORS.public.main} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Summary Table */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden dark:border-slate-700 dark:bg-slate-800">
            <div className="px-5 py-3 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Quarterly Decomposition Detail
              </h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Per-holder value change breakdown — green cells indicate accumulation, red indicate distribution
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-gray-400">
                    <th className="px-3 py-2.5 text-left font-medium sticky left-0 bg-gray-50 dark:bg-slate-900/50">Quarter</th>
                    <th className="px-3 py-2.5 text-right font-medium">Cos</th>
                    <th className="px-3 py-2.5 text-right font-medium">Mcap</th>
                    {HOLDER_KEYS.map((hk) => (
                      <th key={hk} colSpan={3} className="px-3 py-2 text-center font-medium" style={{ borderLeft: `2px solid ${HOLDER_COLORS[hk].main}22` }}>
                        {hk === 'fii' ? 'FII' : hk === 'dii' ? 'DII' : hk.charAt(0).toUpperCase() + hk.slice(1)}
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b border-gray-200 bg-gray-50 text-[10px] text-gray-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-gray-500">
                    <th className="px-3 py-1 sticky left-0 bg-gray-50 dark:bg-slate-900/50"></th>
                    <th className="px-3 py-1"></th>
                    <th className="px-3 py-1"></th>
                    {HOLDER_KEYS.map((hk) => (
                      <HolderSubHeaders key={hk} hk={hk} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analytics.quarters.map((q) => (
                    <tr key={q.yrc} className="border-b border-gray-100 hover:bg-blue-50/50 dark:border-slate-800 dark:hover:bg-blue-900/30">
                      <td className="px-3 py-2.5 font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-slate-800">{q.quarter}</td>
                      <td className="px-3 py-2.5 text-right text-gray-500 dark:text-gray-400">{q.companies_matched}/{q.companies_total}</td>
                      <td className="px-3 py-2.5 text-right text-gray-500 dark:text-gray-400">{fmtCrore(q.total_sector_mcap)}</td>
                      {HOLDER_KEYS.map((hk) => (
                        <HolderCells key={hk} q={q} hk={hk} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function HolderSubHeaders({ hk }: { hk: HolderKey }) {
  return (
    <>
      <th className="px-2 py-1 text-right font-normal" style={{ borderLeft: `2px solid ${HOLDER_COLORS[hk].main}22` }}>Value</th>
      <th className="px-2 py-1 text-right font-normal">Price Eff.</th>
      <th className="px-2 py-1 text-right font-normal">Hold. Eff.</th>
    </>
  );
}

function HolderCells({ q, hk }: { q: SectorQuarterAnalytics; hk: HolderKey }) {
  const ht = q[hk];
  const he = ht.holding_effect;
  const heColor = he != null
    ? he > 0 ? 'text-green-600 dark:text-green-400 font-semibold' : he < 0 ? 'text-red-500 dark:text-red-400 font-semibold' : 'text-gray-500 dark:text-gray-400'
    : 'text-gray-300 dark:text-gray-600';

  return (
    <>
      <td className="px-2 py-2.5 text-right text-gray-700 dark:text-gray-300" style={{ borderLeft: `2px solid ${HOLDER_COLORS[hk].main}22` }}>
        {fmtCrore(ht.holding_value)}
      </td>
      <td className="px-2 py-2.5 text-right text-gray-500 dark:text-gray-400">
        {ht.price_effect != null ? fmtCrore(ht.price_effect) : '—'}
      </td>
      <td className={`px-2 py-2.5 text-right ${heColor}`}>
        {he != null ? fmtCrore(he) : '—'}
      </td>
    </>
  );
}

// --- All-sectors summary table section ---

const METRIC_COLUMNS = [
  { key: 'promoter' as const, label: 'Promoter', trendKey: 'promoter_trend' as const, color: '#3B82F6' },
  { key: 'fii' as const, label: 'FII', trendKey: 'fii_trend' as const, color: '#EF4444' },
  { key: 'dii' as const, label: 'DII', trendKey: 'dii_trend' as const, color: '#8B5CF6' },
  { key: 'public' as const, label: 'Public', trendKey: 'public_trend' as const, color: '#22C55E' },
  { key: 'others' as const, label: 'Others', trendKey: 'others_trend' as const, color: '#64748B' },
];

type SortColumn = 'sector' | 'promoter' | 'fii' | 'dii' | 'public' | 'others';

function SortIcon({ column, active, direction }: { column: string; active: string; direction: 'asc' | 'desc' }) {
  if (column !== active) {
    return <ChevronDown className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-40" />;
  }
  return direction === 'asc'
    ? <ChevronUp className="ml-1 h-3 w-3" />
    : <ChevronDown className="ml-1 h-3 w-3" />;
}

function AllSectorsSummarySection({ onSectorClick }: { onSectorClick: (sector: string) => void }) {
  const { data, isLoading, error } = useAllSectorsSummary();
  const [sort, setSort] = useState<{ column: SortColumn; direction: 'asc' | 'desc' }>({
    column: 'sector',
    direction: 'asc',
  });

  const sorted = useMemo(() => {
    if (!data?.sectors) return [];
    const copy = [...data.sectors];
    copy.sort((a, b) => {
      let cmp: number;
      if (sort.column === 'sector') {
        cmp = a.sector.localeCompare(b.sector);
      } else {
        cmp = a[sort.column] - b[sort.column];
      }
      return sort.direction === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [data?.sectors, sort]);

  const toggleSort = (col: SortColumn) => {
    setSort((prev) =>
      prev.column === col
        ? { column: col, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column: col, direction: col === 'sector' ? 'asc' : 'desc' }
    );
  };

  return (
    <div className="border-t border-gray-200 dark:border-slate-700 pt-8 mt-2">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Industry Shareholding Overview
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Average shareholding across all sectors with quarterly trend sparklines
          {data && ` — ${data.total_sectors} sectors as of ${data.latest_quarter}`}
        </p>
      </div>

      {isLoading && (
        <div className="flex h-48 items-center justify-center">
          <LoadingSpinner size="lg" label="Loading all sectors summary…" />
        </div>
      )}

      {error && !isLoading && (
        <div className="flex h-48 items-center justify-center rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <p className="text-sm text-gray-400 dark:text-gray-500">Failed to load sector summary</p>
        </div>
      )}

      {data && sorted.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden dark:border-slate-700 dark:bg-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-gray-400">
                  <th className="px-4 py-2.5 text-left font-medium w-8">#</th>
                  <th
                    className="group cursor-pointer px-4 py-2.5 text-left font-medium"
                    onClick={() => toggleSort('sector')}
                  >
                    <div className="flex items-center">
                      Sector
                      <SortIcon column="sector" active={sort.column} direction={sort.direction} />
                    </div>
                  </th>
                  {METRIC_COLUMNS.map(({ key, label }) => (
                    <th
                      key={key}
                      className="group cursor-pointer px-4 py-2.5 text-right font-medium"
                      onClick={() => toggleSort(key)}
                    >
                      <div className="flex items-center justify-end">
                        {label}
                        <SortIcon column={key} active={sort.column} direction={sort.direction} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr
                    key={row.sector}
                    className="border-b border-gray-100 transition-colors hover:bg-blue-50/50 dark:border-slate-800 dark:hover:bg-blue-900/30"
                  >
                    <td className="px-4 py-3 text-gray-400 dark:text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3">
                      <button
                        className="text-left font-medium text-gray-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400 transition-colors"
                        onClick={() => onSectorClick(row.sector)}
                        title={`View ${row.sector} trend charts`}
                      >
                        {row.sector}
                      </button>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        {row.companies_count} companies
                      </p>
                    </td>
                    {METRIC_COLUMNS.map(({ key, trendKey, color }) => (
                      <td key={key} className="px-4 py-2 text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {row[key].toFixed(1)}%
                          </span>
                          <MiniSparkline
                            data={row[trendKey]}
                            color={color}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
