"use client";

import { useMemo, useState, useCallback } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
} from 'recharts';
import { Filter, X, ChevronDown, Search, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { useMarketOverview, useReturns } from '@/api/marketOverview';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

import { useThemeStore } from '@/store/themeStore';



// --- Chart colors ---
const PIE_COLORS = [
  '#3B82F6', '#EF4444', '#8B5CF6', '#22C55E', '#F59E0B',
  '#06B6D4', '#EC4899', '#F97316', '#14B8A6', '#6366F1',
  '#84CC16', '#E11D48', '#0EA5E9', '#A855F7', '#10B981',
  '#D946EF', '#F43F5E', '#64748B',
];

const BAR_COLOR = '#3B82F6';

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
    legendColor: dark ? '#94A3B8' : '#64748B',
    pieLabelFill: dark ? '#CBD5E1' : '#475569',
  };
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-IN');
}

const MCAP_BUCKETS = [
  { label: '0 - 100 Cr', min: 0, max: 100 },
  { label: '100 - 1K Cr', min: 100, max: 1000 },
  { label: '1K - 10K Cr', min: 1000, max: 10000 },
  { label: '10K - 1L Cr', min: 10000, max: 100000 },
  { label: '1L+ Cr', min: 100000, max: Infinity },
];

// ──────────────────────── Main Page ────────────────────────

export default function MarketOverviewPage() {
  const { data, isLoading, error } = useMarketOverview();
  const { data: returnsData, isLoading: returnsLoading } = useReturns();
  const [mcapFilter, setMcapFilter] = useState<McapType>('all');
  const [exchangeFilter, setExchangeFilter] = useState<'all' | 'NSE' | 'BSE' | 'Both'>('all');
  const styles = useChartStyles();

  // --- Client-side filtering (mcap + exchange) ---
  const filtered = useMemo(() => {
    if (!data) return [];
    return data.companies.filter((c) => {
      if (!matchesMcapFilter(c.mcap_type, mcapFilter)) return false;
      if (exchangeFilter !== 'all') {
        if (exchangeFilter === 'NSE') {
          // NSE = listed on NSE (exchange is "NSE" or "Both")
          if (c.exchange !== 'NSE' && c.exchange !== 'Both') return false;
        } else if (exchangeFilter === 'BSE') {
          // BSE = listed on BSE (exchange is "BSE" or "Both")
          if (c.exchange !== 'BSE' && c.exchange !== 'Both') return false;
        } else if (exchangeFilter === 'Both') {
          // Both = listed on both exchanges only
          if (c.exchange !== 'Both') return false;
        }
      }
      return true;
    });
  }, [data, mcapFilter, exchangeFilter]);

  // --- Aggregations ---
  const totalMcap = useMemo(
    () => filtered.reduce((sum, c) => sum + (c.mcap ?? 0), 0),
    [filtered],
  );

  const mcapDistribution = useMemo(
    () => MCAP_BUCKETS.map((b) => ({
      label: b.label,
      count: filtered.filter((c) => {
        const m = c.mcap ?? 0;
        return m >= b.min && (b.max === Infinity ? true : m < b.max);
      }).length,
    })),
    [filtered],
  );

  // Industry (detailed) — company count
  const industryByCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of filtered) {
      const key = c.industry ?? 'Not Classified';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name: name.length > 28 ? name.slice(0, 25) + '...' : name, fullName: name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  // Industry (detailed) — total mcap
  const industryByMcap = useMemo(() => {
    const mcaps: Record<string, number> = {};
    for (const c of filtered) {
      const key = c.industry ?? 'Not Classified';
      mcaps[key] = (mcaps[key] ?? 0) + (c.mcap ?? 0);
    }
    return Object.entries(mcaps)
      .map(([name, mcap]) => ({ name: name.length > 28 ? name.slice(0, 25) + '...' : name, fullName: name, mcap: Math.round(mcap) }))
      .sort((a, b) => b.mcap - a.mcap);
  }, [filtered]);

  const industryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of filtered) {
      const key = c.sector ?? 'Not Classified';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    const sorted = Object.entries(counts)
      .map(([name, value]) => ({ name, value, pct: 0 }))
      .sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, d) => s + d.value, 0);
    for (const d of sorted) {
      d.pct = total > 0 ? (d.value / total) * 100 : 0;
    }
    return sorted;
  }, [filtered]);

  if (isLoading || returnsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" label="Loading market overview data…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">Failed to load market overview data</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Market Overview</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Interactive market analytics dashboard — {fmtNum(filtered.length)} of {fmtNum(data.total_companies)} companies
          </p>
        </div>
      </div>

      {/* Filters — applies to ALL sections */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Market Cap:</span>
          {MCAP_BTN.map((b) => (
            <button
              key={b.value}
              onClick={() => setMcapFilter(b.value)}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors ${mcapFilter === b.value ? b.activeColor : b.color + ' hover:bg-gray-200 dark:hover:bg-slate-600'}`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Exchange:</span>
          {EXCHANGE_BTN.map((b) => (
            <button
              key={b.value}
              onClick={() => setExchangeFilter(b.value)}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors ${exchangeFilter === b.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-amber-200 bg-amber-50 p-8 dark:border-amber-900/40 dark:bg-amber-900/10">
          <p className="text-5xl font-extrabold text-purple-700 dark:text-purple-400">{fmtNum(filtered.length)}</p>
          <p className="mt-2 text-sm font-medium text-gray-600 dark:text-gray-400">Total Listed Companies</p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-blue-200 bg-blue-50 p-8 dark:border-blue-900/40 dark:bg-blue-900/10">
          <p className="text-5xl font-extrabold text-purple-700 dark:text-purple-400">{fmtNum(Math.round(totalMcap))}</p>
          <p className="mt-2 text-sm font-medium text-gray-600 dark:text-gray-400">Total Market Cap (in cr.)</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Horizontal Bar Chart — Distribution by size */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
            How are companies distributed by size?
          </h3>
          <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">
            Distribution and concentration of companies based on their market cap in cr
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={mcapDistribution} layout="vertical" margin={{ top: 4, right: 60, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={styles.gridColor} horizontal={false} />
              <XAxis type="number" tick={{ fill: styles.axisColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" tick={{ fill: styles.axisColor, fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
              <Tooltip
                formatter={(value: number | undefined) => [fmtNum(value ?? 0), 'Companies']}
                {...styles.tooltipStyle}
              />
              <Bar dataKey="count" fill={BAR_COLOR} radius={[0, 4, 4, 0]} barSize={32} isAnimationActive={false}>
                <LabelList dataKey="count" position="right" fill={styles.axisColor} fontSize={12} fontWeight={600} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Donut Chart — Industry breakdown */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
            How is the market structured?
          </h3>
          <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">
            Percentage of listed companies in each industry
          </p>
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={industryBreakdown}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={130}
                paddingAngle={1}
                isAnimationActive={false}
                label={(props) => {
                  const { name, percent, cx: pcx, cy: pcy, midAngle, outerRadius: oR } = props;
                  const pctVal = ((percent as number) ?? 0) * 100;
                  if (pctVal < 1.5) return null;
                  const RADIAN = Math.PI / 180;
                  const radius = (oR as number) + 20;
                  const x = (pcx as number) + radius * Math.cos(-(midAngle as number) * RADIAN);
                  const y = (pcy as number) + radius * Math.sin(-(midAngle as number) * RADIAN);
                  return (
                    <text
                      x={x}
                      y={y}
                      fill={styles.pieLabelFill}
                      textAnchor={x > (pcx as number) ? 'start' : 'end'}
                      dominantBaseline="central"
                      fontSize={10}
                      fontWeight={500}
                    >
                      {`${name} ${pctVal.toFixed(2)}%`}
                    </text>
                  );
                }}
                labelLine={false}
              >
                {industryBreakdown.map((d, i) => (
                  <Cell key={d.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number | undefined, name: string | undefined) => {
                  const total = filtered.length;
                  const pct = total > 0 ? (((value ?? 0) / total) * 100).toFixed(2) : '0';
                  return [`${fmtNum(value ?? 0)} companies (${pct}%)`, name ?? ''];
                }}
                {...styles.tooltipStyle}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Industry Detail Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Companies per industry (count) */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
            How many listed companies are part of each industry?
          </h3>
          <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">
            Breakdown of listed companies by detailed business and industry classification ({industryByCount.length} industries)
          </p>
          <div className="overflow-y-auto" style={{ maxHeight: 800 }}>
            <ResponsiveContainer width="100%" height={industryByCount.length * 28 + 20}>
              <BarChart data={industryByCount} layout="vertical" margin={{ top: 4, right: 60, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={styles.gridColor} horizontal={false} />
                <XAxis type="number" tick={{ fill: styles.axisColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: styles.axisColor, fontSize: 10 }} axisLine={false} tickLine={false} width={160} />
                <Tooltip
                  formatter={(value: number | undefined) => [fmtNum(value ?? 0), 'Companies']}
                  {...styles.tooltipStyle}
                />
                <Bar dataKey="count" fill={BAR_COLOR} radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
                  <LabelList dataKey="count" position="right" fill={styles.axisColor} fontSize={11} fontWeight={600} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Industry by mcap */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
            How big is each Industry?
          </h3>
          <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">
            Distribution of industries by total market cap in crores ({industryByMcap.length} industries)
          </p>
          <div className="overflow-y-auto" style={{ maxHeight: 800 }}>
            <ResponsiveContainer width="100%" height={industryByMcap.length * 28 + 20}>
              <BarChart data={industryByMcap} layout="vertical" margin={{ top: 4, right: 80, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={styles.gridColor} horizontal={false} />
                <XAxis type="number" tick={{ fill: styles.axisColor, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtNum(v)} />
                <YAxis type="category" dataKey="name" tick={{ fill: styles.axisColor, fontSize: 10 }} axisLine={false} tickLine={false} width={160} />
                <Tooltip
                  formatter={(value: number | undefined) => [fmtNum(value ?? 0) + ' Cr', 'Market Cap']}
                  {...styles.tooltipStyle}
                />
                <Bar dataKey="mcap" fill="#60A5FA" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
                  <LabelList dataKey="mcap" position="right" fill={styles.axisColor} fontSize={11} fontWeight={600} formatter={(v: unknown) => fmtNum(Number(v ?? 0))} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Multi-Period Returns Table */}
      <ReturnsTableSection mcapFilter={mcapFilter} />

      {/* Returns Analytics */}
      <ReturnsAnalyticsSection mcapFilter={mcapFilter} />

    </div>
  );
}

// ──────────────────────── Multi-Period Returns Table ────────────────────────

const RETURN_PERIODS = ['1d', '1w', '1m', '3m', '6m', '1y', '2y', '3y', '5y', '10y'] as const;
const RETURN_HEADERS: Record<string, string> = {
  '1d': '1 Day', '1w': '1 Week', '1m': '1 Month', '3m': '3 Month',
  '6m': '6 Month', '1y': '1 Year', '2y': '2 Year', '3y': '3 Year',
  '5y': '5 Year', '10y': '10 Year',
};

type McapType = 'all' | 'large' | 'mid' | 'small';

const MCAP_BTN: { value: McapType; label: string; color: string; activeColor: string }[] = [
  { value: 'all', label: 'All', color: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300', activeColor: 'bg-blue-600 text-white' },
  { value: 'large', label: 'Large Cap', color: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300', activeColor: 'bg-indigo-600 text-white' },
  { value: 'mid', label: 'Mid Cap', color: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300', activeColor: 'bg-violet-600 text-white' },
  { value: 'small', label: 'Small Cap', color: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300', activeColor: 'bg-amber-600 text-white' },
];

const MCAP_FILTER_MAP: Record<McapType, string> = {
  all: '', large: 'Large Cap', mid: 'Mid Cap', small: 'Small Cap',
};

const EXCHANGE_BTN: { value: 'all' | 'NSE' | 'BSE' | 'Both'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'NSE', label: 'NSE' },
  { value: 'BSE', label: 'BSE' },
  { value: 'Both', label: 'Both' },
];

function matchesMcapFilter(mcapType: string | null, filter: McapType): boolean {
  if (filter === 'all') return true;
  return mcapType === MCAP_FILTER_MAP[filter];
}

type SortField = 'symbol' | 'price' | 'mcap' | 'mcapType' | 'exchange' | 'isin' | 'sector' | 'industry' | typeof RETURN_PERIODS[number];
type SortDir = 'asc' | 'desc';

function ReturnsTableSection({ mcapFilter }: { mcapFilter: McapType }) {
  const { data, isLoading, error } = useReturns();
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('symbol');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterExchange, setFilterExchange] = useState('');
  const [filterSector, setFilterSector] = useState('');
  const [filterIndustry, setFilterIndustry] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Derive unique filter options from data
  const filterOptions = useMemo(() => {
    if (!data) return { exchanges: [] as string[], sectors: [] as string[], industries: [] as string[] };
    const exchanges = new Set<string>();
    const sectors = new Set<string>();
    const industries = new Set<string>();
    for (const r of data) {
      if (r.exchange) exchanges.add(r.exchange);
      if (r.sector) sectors.add(r.sector);
      if (r.industry) industries.add(r.industry);
    }
    return {
      exchanges: [...exchanges].sort(),
      sectors: [...sectors].sort(),
      industries: [...industries].sort(),
    };
  }, [data]);

  // Industries filtered by selected sector
  const filteredIndustries = useMemo(() => {
    if (!data) return [] as string[];
    if (!filterSector) return filterOptions.industries;
    const set = new Set<string>();
    for (const r of data) {
      if (r.sector === filterSector && r.industry) set.add(r.industry);
    }
    return [...set].sort();
  }, [data, filterSector, filterOptions.industries]);

  const activeFilterCount = (filterExchange ? 1 : 0) + (filterSector ? 1 : 0) + (filterIndustry ? 1 : 0);

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return field;
      }
      setSortDir(field === 'symbol' || field === 'exchange' || field === 'isin' || field === 'mcapType' || field === 'sector' || field === 'industry' ? 'asc' : 'desc');
      return field;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setFilterExchange('');
    setFilterSector('');
    setFilterIndustry('');
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toUpperCase();
    let list = data;
    if (q) {
      list = list.filter((r) =>
        r.symbol.includes(q) ||
        (r.isin ?? '').toUpperCase().includes(q) ||
        (r.sector ?? '').toUpperCase().includes(q) ||
        (r.industry ?? '').toUpperCase().includes(q)
      );
    }
    if (filterExchange) list = list.filter((r) => r.exchange === filterExchange);
    if (filterSector) list = list.filter((r) => r.sector === filterSector);
    if (filterIndustry) list = list.filter((r) => r.industry === filterIndustry);
    if (mcapFilter !== 'all') list = list.filter((r) => matchesMcapFilter(r.mcap_type, mcapFilter));
    return [...list].sort((a, b) => {
      if (sortField === 'mcapType') {
        const at = a.mcap_type ?? '', bt = b.mcap_type ?? '';
        return sortDir === 'asc' ? at.localeCompare(bt) : bt.localeCompare(at);
      }
      const av = a[sortField] ?? '';
      const bv = b[sortField] ?? '';
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? ((av as number) || 0) - ((bv as number) || 0) : ((bv as number) || 0) - ((av as number) || 0);
    });
  }, [data, search, sortField, sortDir, filterExchange, filterSector, filterIndustry, mcapFilter]);

  const averages = useMemo(() => {
    if (!filtered.length) return null;
    const avgs: Record<string, number> = {};
    for (const p of RETURN_PERIODS) {
      const vals = filtered.map((r) => r[p] as number | null).filter((v): v is number => v != null && v !== 0);
      avgs[p] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    }
    return avgs;
  }, [filtered]);

  /* all rows shown via scroll */

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Multi-Period Returns</h2>
        <div className="flex h-40 items-center justify-center"><LoadingSpinner size="lg" /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        Failed to load returns data.
      </div>
    );
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="ml-0.5 inline h-3 w-3 opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp className="ml-0.5 inline h-3 w-3" />
      : <ChevronDown className="ml-0.5 inline h-3 w-3" />;
  };

  const cellColor = (v: number) => {
    if (v > 0) return 'text-green-600 dark:text-green-400';
    if (v < 0) return 'text-red-500 dark:text-red-400';
    return 'text-gray-400 dark:text-gray-500';
  };

  const fmtMcap = (v: number | null) => {
    if (v == null) return '-';
    if (v >= 100000) return `${(v / 100000).toFixed(1)}L Cr`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K Cr`;
    return `${v.toFixed(0)} Cr`;
  };

  const thCls = 'cursor-pointer whitespace-nowrap px-3 py-2.5 font-semibold text-gray-600 dark:text-gray-300';

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="border-b border-gray-100 px-5 py-4 dark:border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Multi-Period Returns
            {data && <span className="ml-2 text-sm font-normal text-gray-400">({filtered.length} symbols)</span>}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                showFilters || activeFilterCount > 0
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">{activeFilterCount}</span>
              )}
            </button>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search symbol / sector / industry…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64 rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-gray-400"
              />
            </div>
          </div>
        </div>

        {/* Filter Row */}
        {showFilters && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[140px]">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Exchange</label>
              <select
                value={filterExchange}
                onChange={(e) => setFilterExchange(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              >
                <option value="">All Exchanges</option>
                {filterOptions.exchanges.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="min-w-[180px]">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Sector</label>
              <select
                value={filterSector}
                onChange={(e) => { setFilterSector(e.target.value); setFilterIndustry(''); }}
                className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              >
                <option value="">All Sectors</option>
                {filterOptions.sectors.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="min-w-[180px]">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">Industry</label>
              <select
                value={filterIndustry}
                onChange={(e) => setFilterIndustry(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              >
                <option value="">All Industries</option>
                {filteredIndustries.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="overflow-auto" style={{ maxHeight: '600px' }}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-gray-100 bg-gray-50 dark:border-slate-700 dark:bg-slate-700/50">
              <th className={`sticky left-0 z-30 bg-gray-50 dark:bg-slate-700/50 ${thCls} text-left`} onClick={() => handleSort('symbol')}>
                Symbol <SortIcon field="symbol" />
              </th>
              <th className={`${thCls} text-left`} onClick={() => handleSort('exchange')}>Exchange <SortIcon field="exchange" /></th>
              <th className={`${thCls} text-left`} onClick={() => handleSort('isin')}>ISIN <SortIcon field="isin" /></th>
              <th className={`${thCls} text-left`} onClick={() => handleSort('sector')}>Sector <SortIcon field="sector" /></th>
              <th className={`${thCls} text-left`} onClick={() => handleSort('industry')}>Industry <SortIcon field="industry" /></th>
              <th className={`${thCls} text-right`} onClick={() => handleSort('mcap')}>MCap <SortIcon field="mcap" /></th>
              <th className={`${thCls} text-left`} onClick={() => handleSort('mcapType')}>MCap Type <SortIcon field="mcapType" /></th>
              <th className={`${thCls} text-right`} onClick={() => handleSort('price')}>Price <SortIcon field="price" /></th>
              {RETURN_PERIODS.map((p) => (
                <th key={p} className={`${thCls} text-right`} onClick={() => handleSort(p)}>
                  {RETURN_HEADERS[p]} <SortIcon field={p} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.symbol} className="border-b border-gray-50 hover:bg-gray-50 dark:border-slate-700/50 dark:hover:bg-slate-700/30">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-medium text-gray-900 dark:bg-slate-800 dark:text-white">{row.symbol}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-400">{row.exchange ?? '-'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-500 dark:text-gray-400 font-mono text-[11px]">{row.isin ?? '-'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-400 max-w-[120px] truncate" title={row.sector ?? ''}>{row.sector ?? '-'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-400 max-w-[140px] truncate" title={row.industry ?? ''}>{row.industry ?? '-'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-gray-700 dark:text-gray-300">{fmtMcap(row.mcap)}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    row.mcap_type === 'Large Cap' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                    : row.mcap_type === 'Mid Cap' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                    : row.mcap_type === 'Small Cap' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    : 'text-gray-400'
                  }`}>{row.mcap_type ?? '-'}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-gray-700 dark:text-gray-300">{row.price != null ? row.price.toFixed(2) : '-'}</td>
                {RETURN_PERIODS.map((p) => {
                  const v = row[p] as number | null;
                  if (v == null) return <td key={p} className="whitespace-nowrap px-3 py-2 text-right text-gray-400 dark:text-gray-500">-</td>;
                  return (
                    <td key={p} className={`whitespace-nowrap px-3 py-2 text-right font-medium ${cellColor(v)}`}>
                      {v > 0 ? '+' : ''}{v.toFixed(2)}%
                    </td>
                  );
                })}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={18} className="py-8 text-center text-sm text-gray-400">No data</td></tr>
            )}
          </tbody>
          {averages && (
            <tfoot className="sticky bottom-0 z-20">
              <tr className="border-t-2 border-gray-200 bg-gray-100 font-semibold dark:border-slate-600 dark:bg-slate-700">
                <td className="sticky left-0 z-30 bg-gray-100 px-3 py-2.5 text-gray-900 dark:bg-slate-700 dark:text-white">Average</td>
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5" />
                {RETURN_PERIODS.map((p) => {
                  const v = averages[p];
                  return (
                    <td key={p} className={`whitespace-nowrap px-3 py-2.5 text-right ${cellColor(v)}`}>
                      {v > 0 ? '+' : ''}{v.toFixed(2)}%
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

    </div>
  );
}

// ──────────────────────── Returns Analytics ────────────────────────

const DIST_BUCKETS = [
  { label: '< -50%', color: '#DC2626' },
  { label: '-50 to -20%', color: '#EF4444' },
  { label: '-20 to -10%', color: '#F87171' },
  { label: '-10 to 0%', color: '#FCA5A5' },
  { label: '0%', color: '#9CA3AF' },
  { label: '0 to 10%', color: '#86EFAC' },
  { label: '10 to 20%', color: '#4ADE80' },
  { label: '20 to 50%', color: '#22C55E' },
  { label: '> 50%', color: '#16A34A' },
];

function ReturnsAnalyticsSection({ mcapFilter }: { mcapFilter: McapType }) {
  const { data: rawData } = useReturns();
  const [selectedPeriod, setSelectedPeriod] = useState<typeof RETURN_PERIODS[number]>('1m');
  const isDark = useThemeStore((s) => s.theme) === 'dark';

  // Filter data by mcap type
  const data = useMemo(() => {
    if (!rawData) return null;
    if (mcapFilter === 'all') return rawData;
    return rawData.filter((r) => matchesMcapFilter(r.mcap_type, mcapFilter));
  }, [rawData, mcapFilter]);

  // ── Period-level statistics ──
  const periodStats = useMemo(() => {
    if (!data) return [];
    return RETURN_PERIODS.map((p) => {
      const vals = data.map((r) => r[p] as number | null).filter((v): v is number => v != null);
      const nonZero = vals.filter((v) => v !== 0);
      const advances = vals.filter((v) => v > 0).length;
      const declines = vals.filter((v) => v < 0).length;
      const unchanged = vals.length - advances - declines;
      const avg = nonZero.length ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;
      const sorted = [...nonZero].sort((a, b) => a - b);
      const median = sorted.length
        ? sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)]
        : 0;
      const variance = nonZero.length ? nonZero.reduce((s, v) => s + (v - avg) ** 2, 0) / nonZero.length : 0;
      const stdDev = Math.sqrt(variance);
      let maxVal = -Infinity, minVal = Infinity, maxSym = '', minSym = '';
      for (const r of data) {
        const v = r[p] as number | null;
        if (v != null && v > maxVal) { maxVal = v; maxSym = r.symbol; }
        if (v != null && v < minVal) { minVal = v; minSym = r.symbol; }
      }
      const adRatio = declines > 0 ? +(advances / declines).toFixed(2) : advances > 0 ? Infinity : 0;
      return {
        period: p, advances, declines, unchanged,
        advPct: vals.length ? (advances / vals.length) * 100 : 0,
        decPct: vals.length ? (declines / vals.length) * 100 : 0,
        adRatio, avg, median, stdDev, maxVal, minVal, maxSym, minSym,
      };
    });
  }, [data]);

  // ── Sector performance ──
  const sectorPerf = useMemo(() => {
    if (!data) return [];
    const map: Record<string, Record<string, number[]>> = {};
    const counts: Record<string, number> = {};
    for (const r of data) {
      const s = r.sector || 'Unclassified';
      if (!map[s]) { map[s] = {}; counts[s] = 0; }
      counts[s]++;
      for (const p of RETURN_PERIODS) {
        if (!map[s][p]) map[s][p] = [];
        const v = r[p] as number | null;
        if (v != null) map[s][p].push(v);
      }
    }
    return Object.entries(map)
      .map(([sector, returns]) => {
        const row: Record<string, unknown> = { sector, count: counts[sector] };
        for (const p of RETURN_PERIODS) {
          const v = returns[p] ?? [];
          row[p] = v.length ? v.reduce((s, val) => s + val, 0) / v.length : 0;
        }
        return row as { sector: string; count: number } & Record<string, number>;
      })
      .sort((a, b) => b.count - a.count);
  }, [data]);

  // ── Industry performance ──
  const industryPerf = useMemo(() => {
    if (!data) return [];
    const map: Record<string, Record<string, number[]>> = {};
    const counts: Record<string, number> = {};
    for (const r of data) {
      const s = r.industry || 'Unclassified';
      if (!map[s]) { map[s] = {}; counts[s] = 0; }
      counts[s]++;
      for (const p of RETURN_PERIODS) {
        if (!map[s][p]) map[s][p] = [];
        const v = r[p] as number | null;
        if (v != null) map[s][p].push(v);
      }
    }
    return Object.entries(map)
      .map(([industry, returns]) => {
        const row: Record<string, unknown> = { industry, count: counts[industry] };
        for (const p of RETURN_PERIODS) {
          const v = returns[p] ?? [];
          row[p] = v.length ? v.reduce((s, val) => s + val, 0) / v.length : 0;
        }
        return row as { industry: string; count: number } & Record<string, number>;
      })
      .sort((a, b) => b.count - a.count);
  }, [data]);

  // ── Top gainers/losers for selected period ──
  const { gainers, losers } = useMemo(() => {
    if (!data) return { gainers: [], losers: [] };
    const withData = data.filter((r) => r[selectedPeriod] != null);
    const sorted = [...withData].sort((a, b) => ((b[selectedPeriod] as number) || 0) - ((a[selectedPeriod] as number) || 0));
    return { gainers: sorted.slice(0, 10), losers: sorted.slice(-10).reverse() };
  }, [data, selectedPeriod]);

  // ── Distribution buckets for selected period ──
  const distribution = useMemo(() => {
    if (!data) return [];
    const counts = new Array(DIST_BUCKETS.length).fill(0);
    for (const r of data) {
      const v = r[selectedPeriod] as number | null;
      if (v == null) continue;
      if (v < -50) counts[0]++;
      else if (v < -20) counts[1]++;
      else if (v < -10) counts[2]++;
      else if (v < 0) counts[3]++;
      else if (v === 0) counts[4]++;
      else if (v <= 10) counts[5]++;
      else if (v <= 20) counts[6]++;
      else if (v <= 50) counts[7]++;
      else counts[8]++;
    }
    return DIST_BUCKETS.map((b, i) => ({ ...b, count: counts[i] }));
  }, [data, selectedPeriod]);

  if (!data || data.length === 0) return null;

  const cellClr = (v: number) => {
    if (v > 0) return 'text-green-600 dark:text-green-400';
    if (v < 0) return 'text-red-500 dark:text-red-400';
    return 'text-gray-400 dark:text-gray-500';
  };

  const heatBg = (v: number): string => {
    const a = Math.abs(v);
    if (v > 0) return a > 20 ? 'bg-green-500/30' : a > 10 ? 'bg-green-500/20' : a > 5 ? 'bg-green-400/15' : 'bg-green-300/10';
    if (v < 0) return a > 20 ? 'bg-red-500/30' : a > 10 ? 'bg-red-500/20' : a > 5 ? 'bg-red-400/15' : 'bg-red-300/10';
    return '';
  };

  const fmtMcapS = (v: number | null) => {
    if (v == null) return '-';
    if (v >= 100000) return `${(v / 100000).toFixed(1)}L Cr`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K Cr`;
    return `${v.toFixed(0)} Cr`;
  };

  const th = 'whitespace-nowrap px-3 py-2 font-semibold text-gray-600 dark:text-gray-300 text-xs';
  const stickyTd = 'sticky left-0 z-10 bg-white dark:bg-slate-800 whitespace-nowrap px-3 py-2 font-medium text-gray-700 dark:text-gray-300';
  const tooltipStyle = {
    contentStyle: { backgroundColor: isDark ? '#1e293b' : '#fff', border: `1px solid ${isDark ? '#334155' : '#e5e7eb'}`, borderRadius: '8px', fontSize: '12px' },
    labelStyle: { color: isDark ? '#e2e8f0' : '#1f2937' },
  };

  return (
    <div className="space-y-6">
      {/* ── 1. Summary Statistics ── */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Summary Statistics</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500">Key metrics across all time periods ({data.length} stocks)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 dark:border-slate-700 dark:bg-slate-700/50">
                <th className={`${th} text-left sticky left-0 z-10 bg-gray-50 dark:bg-slate-700/50`}>Metric</th>
                {RETURN_PERIODS.map((p) => <th key={p} className={`${th} text-right`}>{RETURN_HEADERS[p]}</th>)}
              </tr>
            </thead>
            <tbody>
              {/* Advances */}
              <tr className="border-b border-gray-50 dark:border-slate-700/50">
                <td className={stickyTd}>Advances</td>
                {periodStats.map((s) => (
                  <td key={s.period} className="whitespace-nowrap px-3 py-2 text-right text-green-600 dark:text-green-400">
                    {s.advances} <span className="text-[10px] opacity-70">({s.advPct.toFixed(1)}%)</span>
                  </td>
                ))}
              </tr>
              {/* Declines */}
              <tr className="border-b border-gray-50 dark:border-slate-700/50">
                <td className={stickyTd}>Declines</td>
                {periodStats.map((s) => (
                  <td key={s.period} className="whitespace-nowrap px-3 py-2 text-right text-red-500 dark:text-red-400">
                    {s.declines} <span className="text-[10px] opacity-70">({s.decPct.toFixed(1)}%)</span>
                  </td>
                ))}
              </tr>
              {/* Unchanged */}
              <tr className="border-b border-gray-50 dark:border-slate-700/50">
                <td className={stickyTd}>Unchanged</td>
                {periodStats.map((s) => (
                  <td key={s.period} className="whitespace-nowrap px-3 py-2 text-right text-gray-400">{s.unchanged}</td>
                ))}
              </tr>
              {/* A/D Ratio */}
              <tr className="border-b border-gray-50 dark:border-slate-700/50 bg-gray-50/50 dark:bg-slate-700/20">
                <td className={`${stickyTd} !bg-gray-50/50 dark:!bg-slate-700/20`}>A/D Ratio</td>
                {periodStats.map((s) => (
                  <td key={s.period} className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${s.adRatio >= 1 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    {s.adRatio === Infinity ? '∞' : s.adRatio.toFixed(2)}
                  </td>
                ))}
              </tr>
              {/* Average */}
              <tr className="border-b border-gray-50 dark:border-slate-700/50">
                <td className={stickyTd}>Average %</td>
                {periodStats.map((s) => (
                  <td key={s.period} className={`whitespace-nowrap px-3 py-2 text-right font-medium ${cellClr(s.avg)}`}>
                    {s.avg > 0 ? '+' : ''}{s.avg.toFixed(2)}%
                  </td>
                ))}
              </tr>
              {/* Median */}
              <tr className="border-b border-gray-50 dark:border-slate-700/50">
                <td className={stickyTd}>Median %</td>
                {periodStats.map((s) => (
                  <td key={s.period} className={`whitespace-nowrap px-3 py-2 text-right font-medium ${cellClr(s.median)}`}>
                    {s.median > 0 ? '+' : ''}{s.median.toFixed(2)}%
                  </td>
                ))}
              </tr>
              {/* Std Dev */}
              <tr className="border-b border-gray-50 dark:border-slate-700/50 bg-gray-50/50 dark:bg-slate-700/20">
                <td className={`${stickyTd} !bg-gray-50/50 dark:!bg-slate-700/20`}>Std Dev</td>
                {periodStats.map((s) => (
                  <td key={s.period} className="whitespace-nowrap px-3 py-2 text-right text-gray-600 dark:text-gray-400">{s.stdDev.toFixed(2)}%</td>
                ))}
              </tr>
              {/* Best Performer */}
              <tr className="border-b border-gray-50 dark:border-slate-700/50">
                <td className={stickyTd}>Best</td>
                {periodStats.map((s) => (
                  <td key={s.period} className="whitespace-nowrap px-3 py-2 text-right text-green-600 dark:text-green-400">
                    <span className="font-semibold">{s.maxSym}</span>{' '}
                    <span className="text-[10px]">+{s.maxVal.toFixed(1)}%</span>
                  </td>
                ))}
              </tr>
              {/* Worst Performer */}
              <tr>
                <td className={stickyTd}>Worst</td>
                {periodStats.map((s) => (
                  <td key={s.period} className="whitespace-nowrap px-3 py-2 text-right text-red-500 dark:text-red-400">
                    <span className="font-semibold">{s.minSym}</span>{' '}
                    <span className="text-[10px]">{s.minVal.toFixed(1)}%</span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Period Selector (shared for sections below) ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Period:</span>
        {RETURN_PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setSelectedPeriod(p)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedPeriod === p
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
            }`}
          >
            {RETURN_HEADERS[p]}
          </button>
        ))}
      </div>

      {/* ── 2. Top 10 Gainers / Losers ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Gainers */}
        <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-green-700 dark:text-green-400">
              Top 10 Gainers — {RETURN_HEADERS[selectedPeriod]}
            </h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 dark:border-slate-700 dark:bg-slate-700/50">
                <th className={`${th} text-left w-8`}>#</th>
                <th className={`${th} text-left`}>Symbol</th>
                <th className={`${th} text-left`}>Sector</th>
                <th className={`${th} text-right`}>MCap</th>
                <th className={`${th} text-right`}>Return</th>
              </tr>
            </thead>
            <tbody>
              {gainers.map((r, i) => (
                <tr key={r.symbol} className="border-b border-gray-50 hover:bg-gray-50 dark:border-slate-700/50 dark:hover:bg-slate-700/30">
                  <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-1.5 font-medium text-gray-900 dark:text-white">{r.symbol}</td>
                  <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 max-w-[100px] truncate">{r.sector ?? '-'}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-400">{fmtMcapS(r.mcap)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-green-600 dark:text-green-400">
                    +{((r[selectedPeriod] as number) || 0).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Losers */}
        <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">
              Top 10 Losers — {RETURN_HEADERS[selectedPeriod]}
            </h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 dark:border-slate-700 dark:bg-slate-700/50">
                <th className={`${th} text-left w-8`}>#</th>
                <th className={`${th} text-left`}>Symbol</th>
                <th className={`${th} text-left`}>Sector</th>
                <th className={`${th} text-right`}>MCap</th>
                <th className={`${th} text-right`}>Return</th>
              </tr>
            </thead>
            <tbody>
              {losers.map((r, i) => (
                <tr key={r.symbol} className="border-b border-gray-50 hover:bg-gray-50 dark:border-slate-700/50 dark:hover:bg-slate-700/30">
                  <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-1.5 font-medium text-gray-900 dark:text-white">{r.symbol}</td>
                  <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 max-w-[100px] truncate">{r.sector ?? '-'}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-400">{fmtMcapS(r.mcap)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-red-500 dark:text-red-400">
                    {((r[selectedPeriod] as number) || 0).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 3. Return Distribution ── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
          Return Distribution — {RETURN_HEADERS[selectedPeriod]}
        </h3>
        <p className="mb-4 text-xs text-gray-400 dark:text-gray-500">
          Number of stocks in each return range
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={distribution} margin={{ top: 20, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e5e7eb'} />
            <XAxis dataKey="label" tick={{ fill: isDark ? '#94a3b8' : '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: isDark ? '#94a3b8' : '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {distribution.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
              <LabelList dataKey="count" position="top" fill={isDark ? '#94a3b8' : '#6b7280'} fontSize={11} fontWeight={600} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── 4. Sector Performance Heatmap ── */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Sector Performance</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500">Average return (%) by sector across all periods</p>
        </div>
        <div className="overflow-x-auto" style={{ maxHeight: '500px' }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-gray-100 bg-gray-50 dark:border-slate-700 dark:bg-slate-700/50">
                <th className={`${th} text-left sticky left-0 z-30 bg-gray-50 dark:bg-slate-700/50`}>Sector</th>
                <th className={`${th} text-right`}>Stocks</th>
                {RETURN_PERIODS.map((p) => <th key={p} className={`${th} text-right`}>{RETURN_HEADERS[p]}</th>)}
              </tr>
            </thead>
            <tbody>
              {sectorPerf.map((row) => (
                <tr key={row.sector} className="border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50/50 dark:hover:bg-slate-700/20">
                  <td className="sticky left-0 z-10 bg-white dark:bg-slate-800 whitespace-nowrap px-3 py-2 font-medium text-gray-900 dark:text-white max-w-[180px] truncate" title={row.sector}>
                    {row.sector}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-gray-500 dark:text-gray-400">{row.count}</td>
                  {RETURN_PERIODS.map((p) => {
                    const v = row[p] as number;
                    return (
                      <td key={p} className={`whitespace-nowrap px-3 py-2 text-right font-medium ${cellClr(v)} ${heatBg(v)}`}>
                        {v > 0 ? '+' : ''}{v.toFixed(2)}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 5. Industry Performance Heatmap ── */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-gray-100 px-5 py-4 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Industry Performance</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500">Average return (%) by industry across all periods ({industryPerf.length} industries)</p>
        </div>
        <div className="overflow-x-auto" style={{ maxHeight: '600px' }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-gray-100 bg-gray-50 dark:border-slate-700 dark:bg-slate-700/50">
                <th className={`${th} text-left sticky left-0 z-30 bg-gray-50 dark:bg-slate-700/50`}>Industry</th>
                <th className={`${th} text-right`}>Stocks</th>
                {RETURN_PERIODS.map((p) => <th key={p} className={`${th} text-right`}>{RETURN_HEADERS[p]}</th>)}
              </tr>
            </thead>
            <tbody>
              {industryPerf.map((row) => (
                <tr key={row.industry} className="border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50/50 dark:hover:bg-slate-700/20">
                  <td className="sticky left-0 z-10 bg-white dark:bg-slate-800 whitespace-nowrap px-3 py-2 font-medium text-gray-900 dark:text-white max-w-[220px] truncate" title={row.industry}>
                    {row.industry}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-gray-500 dark:text-gray-400">{row.count}</td>
                  {RETURN_PERIODS.map((p) => {
                    const v = row[p] as number;
                    return (
                      <td key={p} className={`whitespace-nowrap px-3 py-2 text-right font-medium ${cellClr(v)} ${heatBg(v)}`}>
                        {v > 0 ? '+' : ''}{v.toFixed(2)}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

