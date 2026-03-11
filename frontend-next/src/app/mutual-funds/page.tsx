"use client";

import { useMemo, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, Cell,
} from 'recharts';
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getPaginationRowModel, getFilteredRowModel, flexRender,
  type SortingState, type ColumnDef,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown, ChevronsUpDown, Download } from 'lucide-react';
import { useThemeStore } from '@/store/themeStore';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import {
  useMFMonths, useMFHoldings, useMFBuySell,
  useMFInsights, useMFAssetAllocation,
} from '@/hooks/useMutualFunds';
import type {
  MFHoldingRow, MFBuySellTrendPoint, MFNetValueItem,
  MFPopularStock, MFAssetAllocationItem,
} from '@/types/mutualFund';

// ─── Constants ───
type TabKey = 'buy-sell' | 'holdings' | 'insights' | 'asset-allocation';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'buy-sell', label: 'Buy & Sell' },
  { key: 'holdings', label: 'Holdings' },
  { key: 'insights', label: 'Insights' },
  { key: 'asset-allocation', label: 'Asset Allocation' },
];

const CHANGE_COLORS: Record<string, string> = {
  'New Entry': '#22C55E',
  'Modified': '#F59E0B',
  'Unchanged': '#6B7280',
  'Removed': '#EF4444',
};

// ─── Helpers ───
function fmtCr(n: number): string {
  if (Math.abs(n) >= 1_00_000) return `${(n / 1_00_000).toFixed(2)} L Cr`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(2)} K Cr`;
  return `${n.toFixed(2)} Cr`;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-IN');
}

function monthLabel(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
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
      },
    },
    axisColor: dark ? '#94A3B8' : '#64748B',
    gridColor: dark ? '#1E293B' : '#F1F5F9',
    dark,
  };
}

// ─── Main Page ───
export default function MutualFundsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('holdings');
  const { data: months, isLoading: monthsLoading } = useMFMonths();
  const [selectedMonth, setSelectedMonth] = useState('');

  // Set default month when months load
  const defaultMonth = months?.[0] ?? '';
  const month = selectedMonth || defaultMonth;

  if (monthsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Mutual Fund Holdings
          </h1>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600 dark:text-gray-400">Month:</label>
            <select
              value={month}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              {(months ?? []).map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex gap-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === key
                  ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600 dark:bg-blue-600/20 dark:text-blue-400 dark:border-blue-400'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'buy-sell' && <BuySellTab />}
        {activeTab === 'holdings' && <HoldingsTab month={month} />}
        {activeTab === 'insights' && <InsightsTab month={month} />}
        {activeTab === 'asset-allocation' && <AssetAllocationTab month={month} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Tab 1: Buy & Sell
// ═══════════════════════════════════════════════════════════
function BuySellTab() {
  const { data, isLoading, error } = useMFBuySell();
  const styles = useChartStyles();

  if (isLoading) return <LoadingSpinner size="lg" />;
  if (error) return <ErrorBox message={(error as Error).message} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="Total Buy Value"
          value={fmtCr(data.total_buy)}
          color="bg-blue-50 dark:bg-blue-600/10"
          textColor="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          label="Total Sell Value"
          value={fmtCr(data.total_sell)}
          color="bg-red-50 dark:bg-red-600/10"
          textColor="text-red-500 dark:text-red-400"
        />
      </div>

      {/* Trend Chart */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          Trend of Mutual Fund Buy and Sell
        </h3>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={data.trend}>
            <CartesianGrid strokeDasharray="3 3" stroke={styles.gridColor} />
            <XAxis
              dataKey="month"
              tickFormatter={monthLabel}
              tick={{ fontSize: 11, fill: styles.axisColor }}
            />
            <YAxis
              tickFormatter={(v: number) => fmtCr(v)}
              tick={{ fontSize: 11, fill: styles.axisColor }}
            />
            <Tooltip
              {...styles.tooltipStyle}
              formatter={(v: number | undefined, name?: string) => [fmtCr(v ?? 0), name ?? '']}
              labelFormatter={(label) => monthLabel(String(label))}
            />
            <Legend />
            <Line type="monotone" dataKey="buy_value" name="Buy" stroke="#3B82F6" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="sell_value" name="Sell" stroke="#EF4444" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* By Stock and By Sector */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HorizontalBarSection
          title="Total Net Value by Stock Name"
          data={data.by_stock}
          styles={styles}
        />
        <VerticalBarSection
          title="Total Net Value by Sector"
          data={data.by_sector}
          styles={styles}
        />
      </div>
    </div>
  );
}

function HorizontalBarSection({ title, data, styles }: {
  title: string;
  data: MFNetValueItem[];
  styles: ReturnType<typeof useChartStyles>;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">{title}</h3>
      <ResponsiveContainer width="100%" height={Math.max(400, data.length * 28)}>
        <BarChart data={data} layout="vertical" margin={{ left: 120, right: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={styles.gridColor} />
          <XAxis type="number" tickFormatter={(v: number) => fmtCr(v)} tick={{ fontSize: 10, fill: styles.axisColor }} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: styles.axisColor }} />
          <Tooltip {...styles.tooltipStyle} formatter={(v: number | undefined) => [fmtCr(v ?? 0), 'Net Value']} />
          <Bar dataKey="net_value" name="Net Value" isAnimationActive={false}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.net_value >= 0 ? '#3B82F6' : '#EF4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function VerticalBarSection({ title, data, styles }: {
  title: string;
  data: MFNetValueItem[];
  styles: ReturnType<typeof useChartStyles>;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">{title}</h3>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={data} margin={{ bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={styles.gridColor} />
          <XAxis dataKey="name" angle={-45} textAnchor="end" tick={{ fontSize: 10, fill: styles.axisColor }} interval={0} />
          <YAxis tickFormatter={(v: number) => fmtCr(v)} tick={{ fontSize: 10, fill: styles.axisColor }} />
          <Tooltip {...styles.tooltipStyle} formatter={(v: number | undefined) => [fmtCr(v ?? 0), 'Net Value']} />
          <Bar dataKey="net_value" name="Net Value" isAnimationActive={false}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.net_value >= 0 ? '#3B82F6' : '#EF4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Tab 2: Holdings
// ═══════════════════════════════════════════════════════════
function HoldingsTab({ month }: { month: string }) {
  const { data, isLoading, error } = useMFHoldings(month);
  const [changeFilter, setChangeFilter] = useState('All');
  const [fundFilter, setFundFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    let rows = data.rows;
    if (changeFilter !== 'All') {
      rows = rows.filter((r) => r.change_type === changeFilter);
    }
    if (fundFilter) {
      const lower = fundFilter.toLowerCase();
      rows = rows.filter((r) => r.fund_name.toLowerCase().includes(lower));
    }
    if (stockFilter) {
      const lower = stockFilter.toLowerCase();
      rows = rows.filter((r) => r.stock_name.toLowerCase().includes(lower));
    }
    return rows;
  }, [data?.rows, changeFilter, fundFilter, stockFilter]);

  const columns = useMemo<ColumnDef<MFHoldingRow>[]>(() => [
    {
      accessorKey: 'change_type',
      header: 'Change Type',
      cell: ({ getValue }) => {
        const v = getValue<string>();
        return (
          <span
            className="inline-block rounded px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: CHANGE_COLORS[v] ?? '#6B7280' }}
          >
            {v}
          </span>
        );
      },
      size: 120,
    },
    { accessorKey: 'fund_name', header: 'Fund Name', size: 280 },
    { accessorKey: 'stock_name', header: 'Stock Name', size: 200 },
    {
      accessorKey: 'perc_aum',
      header: 'Total % AUM',
      cell: ({ getValue }) => `${getValue<number>().toFixed(2)}%`,
      size: 110,
    },
    {
      accessorKey: 'perc_aum_prev',
      header: '% AUM (Prev)',
      cell: ({ getValue }) => `${getValue<number>().toFixed(2)}%`,
      size: 110,
    },
    {
      accessorKey: 'share_count',
      header: 'Share Count',
      cell: ({ getValue }) => fmtNum(getValue<number>()),
      size: 120,
    },
    {
      accessorKey: 'share_count_prev',
      header: 'Shares (Prev)',
      cell: ({ getValue }) => fmtNum(getValue<number>()),
      size: 120,
    },
  ], []);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  });

  const exportExcel = useCallback(async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(filteredRows.map((r) => ({
      'Change Type': r.change_type,
      'Fund Name': r.fund_name,
      'Stock Name': r.stock_name,
      'Total % AUM': r.perc_aum,
      '% AUM (Prev)': r.perc_aum_prev,
      'Share Count': r.share_count,
      'Shares (Prev)': r.share_count_prev,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Holdings');
    XLSX.writeFile(wb, `MF_Holdings_${month.slice(0, 10)}.xlsx`);
  }, [filteredRows, month]);

  if (isLoading) return <LoadingSpinner size="lg" />;
  if (error) return <ErrorBox message={(error as Error).message} />;
  if (!data) return null;

  const s = data.summary;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <SummaryCard label="New Entries" value={s.new_entries} color="bg-blue-100 dark:bg-blue-600/20 text-blue-700 dark:text-blue-300" />
        <SummaryCard label="Modified" value={s.modified} color="bg-yellow-100 dark:bg-yellow-600/20 text-yellow-700 dark:text-yellow-300" />
        <SummaryCard label="Unchanged" value={s.unchanged} color="bg-orange-100 dark:bg-orange-600/20 text-orange-700 dark:text-orange-300" />
        <SummaryCard label="Removed" value={s.removed} color="bg-red-100 dark:bg-red-600/20 text-red-700 dark:text-red-300" />
        <SummaryCard label="Total Mutual Funds" value={s.total_funds} color="bg-green-100 dark:bg-green-600/20 text-green-700 dark:text-green-300" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Change Type</label>
          <select
            value={changeFilter}
            onChange={(e) => setChangeFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          >
            <option value="All">All</option>
            <option value="New Entry">New Entry</option>
            <option value="Modified">Modified</option>
            <option value="Unchanged">Unchanged</option>
            <option value="Removed">Removed</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Fund Name</label>
          <input
            value={fundFilter}
            onChange={(e) => setFundFilter(e.target.value)}
            placeholder="Search fund..."
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm w-48 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Stock Name</label>
          <input
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            placeholder="Search stock..."
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm w-48 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <button
          onClick={exportExcel}
          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
        >
          <Download className="h-4 w-4" /> Export
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="cursor-pointer px-3 py-2.5 text-left text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 select-none"
                      style={{ width: header.getSize() }}
                    >
                      <span className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' ? <ChevronUp className="h-3 w-3" /> :
                         header.column.getIsSorted() === 'desc' ? <ChevronDown className="h-3 w-3" /> :
                         <ChevronsUpDown className="h-3 w-3 opacity-30" />}
                      </span>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 text-gray-700 dark:text-gray-300">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-4 py-2.5 text-sm">
          <span className="text-gray-500 dark:text-gray-400">
            {filteredRows.length.toLocaleString()} rows
            {filteredRows.length !== data.rows.length && ` (filtered from ${data.rows.length.toLocaleString()})`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded px-3 py-1 text-gray-600 hover:bg-gray-200 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-slate-700"
            >
              Prev
            </button>
            <span className="text-gray-600 dark:text-gray-300">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="rounded px-3 py-1 text-gray-600 hover:bg-gray-200 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-slate-700"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Tab 3: Insights
// ═══════════════════════════════════════════════════════════
function InsightsTab({ month }: { month: string }) {
  const { data, isLoading, error } = useMFInsights(month);
  const styles = useChartStyles();

  if (isLoading) return <LoadingSpinner size="lg" />;
  if (error) return <ErrorBox message={(error as Error).message} />;
  if (!data) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <PopularityChart
        title="Most Popular Stocks"
        subtitle="Stocks added by the most mutual funds this month"
        data={data.most_popular}
        color="#3B82F6"
        changeType="New Entry"
        styles={styles}
      />
      <PopularityChart
        title="Least Popular Stocks"
        subtitle="Stocks removed by the most mutual funds this month"
        data={data.least_popular}
        color="#EF4444"
        changeType="Removed"
        styles={styles}
      />
    </div>
  );
}

function PopularityChart({ title, subtitle, data, color, changeType, styles }: {
  title: string;
  subtitle: string;
  data: MFPopularStock[];
  color: string;
  changeType: string;
  styles: ReturnType<typeof useChartStyles>;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{subtitle}</p>
      <ResponsiveContainer width="100%" height={Math.max(400, data.length * 28)}>
        <BarChart data={data} layout="vertical" margin={{ left: 150, right: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={styles.gridColor} />
          <XAxis type="number" tick={{ fontSize: 11, fill: styles.axisColor }} />
          <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: styles.axisColor }} />
          <Tooltip
            {...styles.tooltipStyle}
            formatter={(v: number | undefined) => [v ?? 0, changeType]}
          />
          <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Tab 4: Asset Allocation
// ═══════════════════════════════════════════════════════════
function AssetAllocationTab({ month }: { month: string }) {
  const { data, isLoading, error } = useMFAssetAllocation(month);
  const styles = useChartStyles();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!data?.items) return [];
    if (!search) return data.items;
    const lower = search.toLowerCase();
    return data.items.filter((i) => i.fund_name.toLowerCase().includes(lower));
  }, [data?.items, search]);

  if (isLoading) return <LoadingSpinner size="lg" />;
  if (error) return <ErrorBox message={(error as Error).message} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Asset Allocation Across Mutual Funds
        </h3>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search fund..."
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm w-64 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-4 mb-4 text-xs">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#60A5FA' }} /> Cash</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#3B82F6' }} /> Debt</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#F97316' }} /> Equity</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded" style={{ background: '#6B7280' }} /> Misc</span>
        </div>

        <ResponsiveContainer width="100%" height={Math.max(500, filtered.length * 28)}>
          <BarChart data={filtered} layout="vertical" margin={{ left: 200, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={styles.gridColor} />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 10, fill: styles.axisColor }} />
            <YAxis type="category" dataKey="fund_name" width={190} tick={{ fontSize: 9, fill: styles.axisColor }} />
            <Tooltip
              {...styles.tooltipStyle}
              formatter={(v: number | undefined, name?: string) => [`${(v ?? 0).toFixed(1)}%`, name ?? '']}
            />
            <Bar dataKey="cash" name="Cash" stackId="a" fill="#60A5FA" isAnimationActive={false} />
            <Bar dataKey="debt" name="Debt" stackId="a" fill="#3B82F6" isAnimationActive={false} />
            <Bar dataKey="equity" name="Equity" stackId="a" fill="#F97316" isAnimationActive={false} />
            <Bar dataKey="misc" name="Misc" stackId="a" fill="#6B7280" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Shared components
// ═══════════════════════════════════════════════════════════
function StatCard({ label, value, color, textColor }: {
  label: string; value: string; color: string; textColor: string;
}) {
  return (
    <div className={`rounded-xl p-5 ${color}`}>
      <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{label}</p>
    </div>
  );
}

function SummaryCard({ label, value, color }: {
  label: string; value: number; color: string;
}) {
  return (
    <div className={`rounded-xl p-4 text-center ${color}`}>
      <p className="text-3xl font-bold">{fmtNum(value)}</p>
      <p className="text-xs mt-1 opacity-80">{label}</p>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
      {message}
    </div>
  );
}
