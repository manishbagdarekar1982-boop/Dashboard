"use client";

import { useState, useMemo, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useEarningsAnalysis } from "@/api/earningsAnalysis";
import type { EarningsCompany } from "@/types/earnings";
import { useThemeStore } from "@/store/themeStore";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ChevronDown, ChevronUp, Download, Columns3 } from "lucide-react";

/* ──────────────────── THEME HOOK ──────────────────── */

function useChartStyles() {
  const { theme } = useThemeStore();
  const dark = theme === "dark";
  return {
    dark,
    gridColor: dark ? "#334155" : "#e5e7eb",
    axisColor: dark ? "#94a3b8" : "#6b7280",
    tooltipBg: dark ? "#1e293b" : "#ffffff",
    tooltipBorder: dark ? "#475569" : "#e5e7eb",
    tooltipColor: dark ? "#e2e8f0" : "#1f2937",
    cardBg: dark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200",
    headBg: dark ? "bg-slate-700/50" : "bg-gray-50",
    rowBorder: dark ? "border-slate-700" : "border-gray-100",
    textPrimary: dark ? "text-white" : "text-gray-900",
    textSecondary: dark ? "text-gray-400" : "text-gray-500",
    textMuted: dark ? "text-gray-500" : "text-gray-400",
  };
}

/* ──────────────────── HELPERS ──────────────────── */

const COLORS = {
  sales: "#3B82F6",
  op: "#8B5CF6",
  pat: "#22C55E",
  eps: "#1e293b",
};

const SUMMARY_CARD_COLORS = [
  "bg-blue-50 dark:bg-blue-600/10 text-blue-600 dark:text-blue-400",
  "bg-yellow-50 dark:bg-yellow-600/10 text-yellow-600 dark:text-yellow-400",
  "bg-green-50 dark:bg-green-600/10 text-green-600 dark:text-green-400",
  "bg-purple-50 dark:bg-purple-600/10 text-purple-600 dark:text-purple-400",
  "bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300",
];

function computeMedian(arr: number[]): number | null {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function getGrowth(
  c: EarningsCompany,
  metric: "sales" | "op" | "pat" | "eps",
  quarter: string,
  type: "yoy" | "qoq"
): number | null {
  const key = `${metric}_growth_${type}` as keyof EarningsCompany;
  const map = c[key] as Record<string, number | null> | undefined;
  return map?.[quarter] ?? null;
}

function fmtNum(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "-";
  return v.toFixed(decimals);
}

function fmtCr(v: number | null | undefined): string {
  if (v == null) return "-";
  if (Math.abs(v) >= 100000) return `${(v / 100000).toFixed(0)}L Cr`;
  if (Math.abs(v) >= 100) return `${(v / 100).toFixed(0)}K Cr`;
  return `${v.toFixed(0)} Cr`;
}

function growthColor(v: number | null): string {
  if (v == null) return "text-gray-400 dark:text-gray-500";
  return v >= 0
    ? "text-green-600 dark:text-green-400"
    : "text-red-500 dark:text-red-400";
}

function peadLabel(patGrowth: number | null): string {
  if (patGrowth == null) return "-";
  if (patGrowth > 50) return "Strong PEAD";
  if (patGrowth > 10) return "Moderate PEAD";
  if (patGrowth >= -10) return "No PEAD";
  return "Weak PEAD";
}

function peadColor(label: string): string {
  switch (label) {
    case "Strong PEAD":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "Moderate PEAD":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "No PEAD":
      return "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
    case "Weak PEAD":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-gray-100 text-gray-500";
  }
}

/* ──────────────────── FILTER STATE ──────────────────── */

interface Filters {
  quarter: string;
  compareType: "yoy" | "qoq";
  industries: string[];
  mcapGroup: string;
  indices: string[];
  smeOnly: boolean;
}

/* ──────────────────── MAIN PAGE ──────────────────── */

export default function EarningsAnalysisPage() {
  const { data, isLoading, error } = useEarningsAnalysis();
  const styles = useChartStyles();

  const [filters, setFilters] = useState<Filters>({
    quarter: "",
    compareType: "yoy",
    industries: [],
    mcapGroup: "All",
    indices: [],
    smeOnly: false,
  });

  // Initialize quarter from data
  const activeQuarter = filters.quarter || data?.available_quarters[0] || "";

  /* ──── Filtered companies ──── */
  const filtered = useMemo(() => {
    if (!data) return [];
    return data.companies.filter((c) => {
      if (
        filters.industries.length > 0 &&
        !filters.industries.includes(c.industry ?? "")
      )
        return false;
      if (filters.mcapGroup !== "All" && c.mcap_type !== filters.mcapGroup)
        return false;
      if (
        filters.indices.length > 0 &&
        !c.nifty_indices.some((idx) => filters.indices.includes(idx))
      )
        return false;
      if (filters.smeOnly && !c.is_sme) return false;
      return true;
    });
  }, [data, filters]);

  /* ──── Summary stats ──── */
  const summary = useMemo(() => {
    const q = activeQuarter;
    const t = filters.compareType;
    const sg = filtered
      .map((c) => getGrowth(c, "sales", q, t))
      .filter((v): v is number => v !== null);
    const og = filtered
      .map((c) => getGrowth(c, "op", q, t))
      .filter((v): v is number => v !== null);
    const pg = filtered
      .map((c) => getGrowth(c, "pat", q, t))
      .filter((v): v is number => v !== null);
    const eg = filtered
      .map((c) => getGrowth(c, "eps", q, t))
      .filter((v): v is number => v !== null);
    return {
      medianSales: computeMedian(sg),
      medianOp: computeMedian(og),
      medianPat: computeMedian(pg),
      medianEps: computeMedian(eg),
      resultsDeclared: filtered.filter(
        (c) => c.sales[q] != null || c.pat[q] != null
      ).length,
    };
  }, [filtered, activeQuarter, filters.compareType]);

  /* ──── Trends chart data ──── */
  const trendsData = useMemo(() => {
    if (!data) return [];
    const hasFilters =
      filters.industries.length > 0 ||
      filters.mcapGroup !== "All" ||
      filters.indices.length > 0 ||
      filters.smeOnly;

    if (!hasFilters) return data.trends;

    // Recompute medians for filtered subset
    return data.trends.map((t) => {
      const q = t.quarter;
      const type = filters.compareType;
      const sg = filtered
        .map((c) => getGrowth(c, "sales", q, type))
        .filter((v): v is number => v !== null);
      const og = filtered
        .map((c) => getGrowth(c, "op", q, type))
        .filter((v): v is number => v !== null);
      const pg = filtered
        .map((c) => getGrowth(c, "pat", q, type))
        .filter((v): v is number => v !== null);
      const eg = filtered
        .map((c) => getGrowth(c, "eps", q, type))
        .filter((v): v is number => v !== null);
      return {
        quarter: q,
        median_sales_growth: computeMedian(sg),
        median_op_growth: computeMedian(og),
        median_pat_growth: computeMedian(pg),
        median_eps_growth: computeMedian(eg),
      };
    });
  }, [data, filtered, filters]);

  /* ──── Top performers ──── */
  const topPerformers = useMemo(() => {
    const q = activeQuarter;
    const t = filters.compareType;
    const top = (metric: "sales" | "op" | "pat" | "eps") =>
      filtered
        .map((c) => ({
          name: c.company_name,
          value: getGrowth(c, metric, q, t),
        }))
        .filter((x) => x.value !== null)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return {
      sales: top("sales"),
      op: top("op"),
      pat: top("pat"),
      eps: top("eps"),
    };
  }, [filtered, activeQuarter, filters.compareType]);

  /* ──── Margin growth top performers ──── */
  const marginPerformers = useMemo(() => {
    const q = activeQuarter;
    const topMargin = (field: "op_margin_growth_yoy" | "pat_margin_growth_yoy") =>
      filtered
        .map((c) => ({
          name: c.company_name,
          value: (c[field] as Record<string, number | null>)?.[q] ?? null,
        }))
        .filter((x) => x.value !== null)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return {
      opm: topMargin("op_margin_growth_yoy"),
      patm: topMargin("pat_margin_growth_yoy"),
    };
  }, [filtered, activeQuarter]);

  /* ──── Industry performance ──── */
  const industryPerf = useMemo(() => {
    const q = activeQuarter;
    const t = filters.compareType;
    const map = new Map<string, EarningsCompany[]>();
    for (const c of filtered) {
      const ind = c.industry ?? "Unclassified";
      if (!map.has(ind)) map.set(ind, []);
      map.get(ind)!.push(c);
    }
    return Array.from(map.entries())
      .map(([name, companies]) => {
        const sg = companies
          .map((c) => getGrowth(c, "sales", q, t))
          .filter((v): v is number => v !== null);
        const og = companies
          .map((c) => getGrowth(c, "op", q, t))
          .filter((v): v is number => v !== null);
        const pg = companies
          .map((c) => getGrowth(c, "pat", q, t))
          .filter((v): v is number => v !== null);
        const eg = companies
          .map((c) => getGrowth(c, "eps", q, t))
          .filter((v): v is number => v !== null);
        return {
          industry: name,
          mcap: companies.reduce((s, c) => s + (c.mcap ?? 0), 0),
          count: companies.length,
          salesGrowth: computeMedian(sg),
          opGrowth: computeMedian(og),
          patGrowth: computeMedian(pg),
          epsGrowth: computeMedian(eg),
        };
      })
      .sort((a, b) => b.mcap - a.mcap);
  }, [filtered, activeQuarter, filters.compareType]);

  if (isLoading)
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  if (error || !data)
    return (
      <div className="p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to load earnings data.{" "}
          {error instanceof Error ? error.message : ""}
        </div>
      </div>
    );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className={`text-xl font-bold ${styles.textPrimary}`}>
          Earning Analysis
        </h1>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-1 dark:border-slate-700">
          {["All", "Large Cap", "Mid Cap", "Small Cap"].map((cap) => (
            <button
              key={cap}
              onClick={() => setFilters((f) => ({ ...f, mcapGroup: cap }))}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                filters.mcapGroup === cap
                  ? "bg-blue-600 text-white shadow-sm"
                  : styles.dark
                    ? "text-gray-400 hover:bg-slate-700 hover:text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {cap}
            </button>
          ))}
        </div>
      </div>
      <p className={`-mt-4 text-sm ${styles.textSecondary}`}>
        {filtered.length.toLocaleString()} companies
        {filters.mcapGroup !== "All" ? ` (${filters.mcapGroup})` : ""}
      </p>

      {/* ──── SECTION 1: FILTERS ──── */}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        activeQuarter={activeQuarter}
        availableQuarters={data.available_quarters}
        resultsPerQuarter={data.results_per_quarter}
        industries={data.distinct_industries}
        indices={data.distinct_indices}
        styles={styles}
      />

      {/* ──── SECTION 2: SUMMARY CARDS ──── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Median Sales Growth", value: summary.medianSales },
          { label: "Median Op. Profit Growth", value: summary.medianOp },
          { label: "Median PAT Growth", value: summary.medianPat },
          { label: "Median EPS Growth", value: summary.medianEps },
          { label: "Results Declared", value: summary.resultsDeclared },
        ].map((card, i) => (
          <div
            key={card.label}
            className={`rounded-xl border p-4 text-center ${SUMMARY_CARD_COLORS[i]} border-transparent`}
          >
            <p className="text-2xl font-bold">
              {typeof card.value === "number"
                ? i < 4
                  ? fmtNum(card.value, 2)
                  : card.value.toLocaleString()
                : "-"}
            </p>
            <p className="mt-1 text-xs opacity-70">{card.label}</p>
          </div>
        ))}
      </div>

      {/* ──── SECTION 3: EARNING TRENDS CHART ──── */}
      <div
        className={`rounded-xl border p-5 ${styles.cardBg}`}
      >
        <h2 className={`mb-4 text-base font-semibold ${styles.textPrimary}`}>
          Earning Trends
        </h2>
        <p className={`mb-4 text-xs ${styles.textSecondary}`}>
          What is the trend of earnings growth for listed companies in India?
        </p>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={trendsData} barGap={2} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke={styles.gridColor} />
            <XAxis
              dataKey="quarter"
              tick={{ fontSize: 11, fill: styles.axisColor }}
            />
            <YAxis
              tickFormatter={(v) => `${v}`}
              tick={{ fontSize: 11, fill: styles.axisColor }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: styles.tooltipBg,
                border: `1px solid ${styles.tooltipBorder}`,
                color: styles.tooltipColor,
                borderRadius: "8px",
                fontSize: 12,
              }}
              formatter={(v: number | undefined) => [`${fmtNum(v ?? null, 1)}%`, ""]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              iconType="square"
              iconSize={10}
            />
            <Bar
              dataKey="median_sales_growth"
              name="Median Sales Growth"
              fill={COLORS.sales}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="median_op_growth"
              name="Median Op Profit Growth"
              fill={COLORS.op}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="median_pat_growth"
              name="Median PAT Growth"
              fill={COLORS.pat}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="median_eps_growth"
              name="Median EPS Growth"
              fill={COLORS.eps}
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ──── SECTION 5: TOP PERFORMERS ──── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HorizontalBarSection
          title="Sales Growth"
          subtitle="All values in percentage"
          data={topPerformers.sales}
          color={COLORS.sales}
          styles={styles}
          totalCount={filtered.length}
        />
        <HorizontalBarSection
          title="Op. Profit Growth"
          subtitle="All values in percentage"
          data={topPerformers.op}
          color={COLORS.op}
          styles={styles}
          totalCount={filtered.length}
        />
        <HorizontalBarSection
          title="Profit After Tax Growth"
          subtitle="All values in percentage"
          data={topPerformers.pat}
          color={COLORS.pat}
          styles={styles}
          totalCount={filtered.length}
        />
        <HorizontalBarSection
          title="EPS Growth"
          subtitle="All values in percentage"
          data={topPerformers.eps}
          color={COLORS.eps}
          styles={styles}
          totalCount={filtered.length}
        />
      </div>

      {/* ──── SECTION 6: MARGIN GROWTH ──── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HorizontalBarSection
          title="Operating Profit Margin Growth"
          subtitle="All values in percentage"
          data={marginPerformers.opm}
          color="#F59E0B"
          styles={styles}
          totalCount={filtered.length}
        />
        <HorizontalBarSection
          title="PAT Margin Growth"
          subtitle="All values in percentage"
          data={marginPerformers.patm}
          color="#EC4899"
          styles={styles}
          totalCount={filtered.length}
        />
      </div>

      {/* ──── SECTION 7: INDUSTRY PERFORMANCE TABLE ──── */}
      <IndustryTable data={industryPerf} styles={styles} />

      {/* ──── SECTION 8: COMPANY DETAIL TABLE ──── */}
      <CompanyDetailTable
        data={filtered}
        quarter={activeQuarter}
        compareType={filters.compareType}
        styles={styles}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  FILTER BAR                                                   */
/* ══════════════════════════════════════════════════════════════ */

function FilterBar({
  filters,
  setFilters,
  activeQuarter,
  availableQuarters,
  resultsPerQuarter,
  industries,
  indices,
  styles,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  activeQuarter: string;
  availableQuarters: string[];
  resultsPerQuarter: Record<string, number>;
  industries: string[];
  indices: string[];
  styles: ReturnType<typeof useChartStyles>;
}) {
  const [indOpen, setIndOpen] = useState(false);
  const [idxOpen, setIdxOpen] = useState(false);
  const [indSearch, setIndSearch] = useState("");
  const [idxSearch, setIdxSearch] = useState("");

  const filteredIndustries = industries.filter((i) =>
    i.toLowerCase().includes(indSearch.toLowerCase())
  );
  const filteredIndices = indices.filter((i) =>
    i.toLowerCase().includes(idxSearch.toLowerCase())
  );

  return (
    <div className={`rounded-xl border p-4 ${styles.cardBg}`}>
      <div className="flex flex-wrap items-end gap-3">
        {/* Result Season */}
        <div>
          <label className={`mb-1 block text-xs font-medium ${styles.textSecondary}`}>
            Result Season
          </label>
          <select
            value={activeQuarter}
            onChange={(e) =>
              setFilters((f) => ({ ...f, quarter: e.target.value }))
            }
            className={`rounded-lg border px-3 py-1.5 text-sm ${styles.dark ? "border-slate-600 bg-slate-700 text-white" : "border-gray-300 bg-white text-gray-900"}`}
          >
            {availableQuarters.map((q) => (
              <option key={q} value={q}>
                {q} ({resultsPerQuarter[q] ?? 0} results)
              </option>
            ))}
          </select>
        </div>

        {/* Compare Type */}
        <div>
          <label className={`mb-1 block text-xs font-medium ${styles.textSecondary}`}>
            Result Compare
          </label>
          <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-slate-600">
            {(["yoy", "qoq"] as const).map((t) => (
              <button
                key={t}
                onClick={() =>
                  setFilters((f) => ({ ...f, compareType: t }))
                }
                className={`px-3 py-1.5 text-sm ${
                  filters.compareType === t
                    ? "bg-blue-600 text-white"
                    : styles.dark
                      ? "bg-slate-700 text-gray-300 hover:bg-slate-600"
                      : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {t === "yoy" ? "Year over Year" : "Quarter over Quarter"}
              </button>
            ))}
          </div>
        </div>

        {/* Industry Multi-Select */}
        <div className="relative">
          <label className={`mb-1 block text-xs font-medium ${styles.textSecondary}`}>
            Industry
          </label>
          <button
            onClick={() => { setIndOpen(!indOpen); setIdxOpen(false); }}
            className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm ${styles.dark ? "border-slate-600 bg-slate-700 text-white" : "border-gray-300 bg-white text-gray-900"}`}
          >
            {filters.industries.length
              ? `${filters.industries.length} selected`
              : "All"}
            <ChevronDown className="h-3 w-3" />
          </button>
          {indOpen && (
            <div
              className={`absolute left-0 top-full z-50 mt-1 max-h-64 w-64 overflow-auto rounded-lg border shadow-lg ${styles.dark ? "border-slate-600 bg-slate-800" : "border-gray-200 bg-white"}`}
            >
              <div className="sticky top-0 p-2">
                <input
                  type="text"
                  placeholder="Search..."
                  value={indSearch}
                  onChange={(e) => setIndSearch(e.target.value)}
                  className={`w-full rounded border px-2 py-1 text-xs ${styles.dark ? "border-slate-600 bg-slate-700 text-white" : "border-gray-300 bg-white"}`}
                />
              </div>
              <button
                onClick={() => setFilters((f) => ({ ...f, industries: [] }))}
                className="w-full px-3 py-1 text-left text-xs text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                Clear all
              </button>
              {filteredIndustries.map((ind) => (
                <label
                  key={ind}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-slate-700 ${styles.textPrimary}`}
                >
                  <input
                    type="checkbox"
                    checked={filters.industries.includes(ind)}
                    onChange={() =>
                      setFilters((f) => ({
                        ...f,
                        industries: f.industries.includes(ind)
                          ? f.industries.filter((x) => x !== ind)
                          : [...f.industries, ind],
                      }))
                    }
                    className="h-3 w-3"
                  />
                  {ind}
                </label>
              ))}
            </div>
          )}
        </div>



        {/* Market Index Multi-Select */}
        <div className="relative">
          <label className={`mb-1 block text-xs font-medium ${styles.textSecondary}`}>
            Market Index
          </label>
          <button
            onClick={() => { setIdxOpen(!idxOpen); setIndOpen(false); }}
            className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm ${styles.dark ? "border-slate-600 bg-slate-700 text-white" : "border-gray-300 bg-white text-gray-900"}`}
          >
            {filters.indices.length
              ? `${filters.indices.length} selected`
              : "All"}
            <ChevronDown className="h-3 w-3" />
          </button>
          {idxOpen && (
            <div
              className={`absolute left-0 top-full z-50 mt-1 max-h-64 w-64 overflow-auto rounded-lg border shadow-lg ${styles.dark ? "border-slate-600 bg-slate-800" : "border-gray-200 bg-white"}`}
            >
              <div className="sticky top-0 p-2">
                <input
                  type="text"
                  placeholder="Search..."
                  value={idxSearch}
                  onChange={(e) => setIdxSearch(e.target.value)}
                  className={`w-full rounded border px-2 py-1 text-xs ${styles.dark ? "border-slate-600 bg-slate-700 text-white" : "border-gray-300 bg-white"}`}
                />
              </div>
              <button
                onClick={() => setFilters((f) => ({ ...f, indices: [] }))}
                className="w-full px-3 py-1 text-left text-xs text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                Clear all
              </button>
              {filteredIndices.map((idx) => (
                <label
                  key={idx}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-slate-700 ${styles.textPrimary}`}
                >
                  <input
                    type="checkbox"
                    checked={filters.indices.includes(idx)}
                    onChange={() =>
                      setFilters((f) => ({
                        ...f,
                        indices: f.indices.includes(idx)
                          ? f.indices.filter((x) => x !== idx)
                          : [...f.indices, idx],
                      }))
                    }
                    className="h-3 w-3"
                  />
                  {idx}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* SME Only */}
        <div>
          <label className={`mb-1 block text-xs font-medium ${styles.textSecondary}`}>
            SME Only
          </label>
          <button
            onClick={() =>
              setFilters((f) => ({ ...f, smeOnly: !f.smeOnly }))
            }
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              filters.smeOnly
                ? "border-blue-500 bg-blue-600 text-white"
                : styles.dark
                  ? "border-slate-600 bg-slate-700 text-gray-300"
                  : "border-gray-300 bg-white text-gray-700"
            }`}
          >
            {filters.smeOnly ? "Yes" : "All"}
          </button>
        </div>
      </div>
    </div>
  );
}


function GrowthBarCell({
  value,
  maxAbs,
}: {
  value: number | null;
  maxAbs: number;
}) {
  if (value == null) return <span className="text-gray-400">-</span>;
  const pct = Math.min(Math.abs(value) / maxAbs, 1) * 100;
  const positive = value >= 0;
  return (
    <div className="flex items-center gap-2">
      <span className={`min-w-[50px] text-right text-xs font-medium ${growthColor(value)}`}>
        {fmtNum(value, 2)}
      </span>
      <div className="h-3 flex-1 rounded-full bg-gray-100 dark:bg-slate-700">
        <div
          className={`h-3 rounded-full ${positive ? "bg-blue-400/60" : "bg-red-300/60"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  HORIZONTAL BAR SECTION (Top Performers / Margin Growth)      */
/* ══════════════════════════════════════════════════════════════ */

function HorizontalBarSection({
  title,
  subtitle,
  data,
  color,
  styles,
  totalCount,
}: {
  title: string;
  subtitle: string;
  data: { name: string; value: number | null }[];
  color: string;
  styles: ReturnType<typeof useChartStyles>;
  totalCount?: number;
}) {
  const [view, setView] = useState<"top" | "bottom" | "all">("top");

  if (!data.length) return null;

  const LIMIT = 20;
  const hasToggle = data.length > LIMIT;
  // data is sorted desc (highest first)
  const sliced =
    view === "all"
      ? data
      : view === "top" || !hasToggle
        ? data.slice(0, LIMIT)
        : [...data.slice(-LIMIT)].reverse();

  // Cap outlier bars: P75 of absolute values × 3
  const absVals = sliced
    .map((d) => Math.abs(d.value ?? 0))
    .sort((a, b) => a - b);
  const p75 = absVals[Math.floor(absVals.length * 0.75)] ?? 100;
  const cap = Math.max(p75 * 3, 10);

  const displayData = sliced.map((d) => ({
    name: d.name.length > 20 ? d.name.slice(0, 18) + "…" : d.name,
    fullName: d.name,
    value: d.value,
    barValue: Math.min(cap, Math.abs(d.value ?? 0)),
  }));

  const barHeight = 24;
  const chartHeight = displayData.length * barHeight + 20;
  const maxScrollHeight = 600;
  const needsScroll = chartHeight > maxScrollHeight;

  return (
    <div className={`rounded-xl border p-5 ${styles.cardBg}`}>
      <div className="mb-1 flex items-center justify-between">
        <h3 className={`text-sm font-semibold ${styles.textPrimary}`}>
          {title}
          <span className={`ml-2 text-xs font-normal ${styles.textMuted}`}>
            ({(totalCount ?? data.length).toLocaleString()} companies
            {totalCount && totalCount !== data.length
              ? `, ${data.length.toLocaleString()} with data`
              : ""}
            )
          </span>
        </h3>
        {hasToggle && (
          <div className="flex overflow-hidden rounded-md border border-gray-200 dark:border-slate-600">
            {(["top", "bottom", "all"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1 text-xs ${
                  view === v
                    ? "bg-blue-600 text-white"
                    : styles.dark
                      ? "text-gray-400 hover:bg-slate-700"
                      : "text-gray-500 hover:bg-gray-50"
                }`}
              >
                {v === "top" ? `Top ${LIMIT}` : v === "bottom" ? `Bottom ${LIMIT}` : "All"}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className={`mb-3 text-xs ${styles.textMuted}`}>{subtitle}</p>
      <div
        className={needsScroll ? "overflow-y-auto" : ""}
        style={needsScroll ? { maxHeight: maxScrollHeight } : undefined}
      >
        <div style={{ width: "100%", height: chartHeight }}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={displayData}
              layout="vertical"
              margin={{ left: 10, right: 60, top: 5, bottom: 5 }}
            >
              <XAxis type="number" hide />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fontSize: 9, fill: styles.axisColor }}
                width={100}
                interval={0}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload as {
                    fullName: string;
                    value: number | null;
                  };
                  return (
                    <div
                      style={{
                        backgroundColor: styles.tooltipBg,
                        border: `1px solid ${styles.tooltipBorder}`,
                        color: styles.tooltipColor,
                        borderRadius: 8,
                        fontSize: 11,
                        padding: "6px 10px",
                      }}
                    >
                      <p style={{ fontWeight: 600, marginBottom: 2 }}>
                        {d.fullName}
                      </p>
                      <p>{fmtNum(d.value, 2)}%</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="barValue" radius={[0, 3, 3, 0]} barSize={14}>
                <LabelList
                  dataKey="value"
                  position="right"
                  fontSize={9}
                  fill={styles.axisColor}
                  formatter={(v: unknown) => {
                    const n = v as number | null;
                    return n != null
                      ? `${n >= 0 ? "+" : ""}${fmtNum(n, 1)}%`
                      : "";
                  }}
                />
                {displayData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={(entry.value ?? 0) >= 0 ? color : "#ef4444"}
                    fillOpacity={0.75}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  INDUSTRY PERFORMANCE TABLE                                   */
/* ══════════════════════════════════════════════════════════════ */

interface IndustryRow {
  industry: string;
  mcap: number;
  count: number;
  salesGrowth: number | null;
  opGrowth: number | null;
  patGrowth: number | null;
  epsGrowth: number | null;
}

function IndustryTable({
  data,
  styles,
}: {
  data: IndustryRow[];
  styles: ReturnType<typeof useChartStyles>;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const maxAbs = useMemo(() => {
    let m = 1;
    for (const row of data) {
      for (const v of [
        row.salesGrowth,
        row.opGrowth,
        row.patGrowth,
        row.epsGrowth,
      ]) {
        if (v != null && Math.abs(v) > m) m = Math.abs(v);
      }
    }
    return m;
  }, [data]);

  const columns = useMemo<ColumnDef<IndustryRow>[]>(
    () => [
      { accessorKey: "industry", header: "Industry", size: 200 },
      {
        accessorKey: "mcap",
        header: "Market Cap (in cr.)",
        cell: ({ getValue }) => (
          <span>{(getValue() as number).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
        ),
      },
      { accessorKey: "count", header: "# Companies" },
      {
        accessorKey: "salesGrowth",
        header: "Median Sales Growth",
        cell: ({ getValue }) => (
          <GrowthBarCell value={getValue() as number | null} maxAbs={maxAbs} />
        ),
      },
      {
        accessorKey: "opGrowth",
        header: "Median Op. Profit Growth",
        cell: ({ getValue }) => (
          <GrowthBarCell value={getValue() as number | null} maxAbs={maxAbs} />
        ),
      },
      {
        accessorKey: "patGrowth",
        header: "Median PAT Growth",
        cell: ({ getValue }) => (
          <GrowthBarCell value={getValue() as number | null} maxAbs={maxAbs} />
        ),
      },
      {
        accessorKey: "epsGrowth",
        header: "Median EPS Growth",
        cell: ({ getValue }) => (
          <GrowthBarCell value={getValue() as number | null} maxAbs={maxAbs} />
        ),
      },
    ],
    [maxAbs]
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className={`overflow-hidden rounded-xl border ${styles.cardBg}`}>
      <div className="p-4">
        <h2 className={`text-base font-semibold ${styles.textPrimary}`}>
          Industry Performance
          <span className={`ml-2 text-xs font-normal ${styles.textMuted}`}>
            ({data.length} industries)
          </span>
        </h2>
      </div>
      <div className="overflow-auto" style={{ maxHeight: 600 }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className={styles.headBg}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className={`cursor-pointer px-3 py-2.5 text-left text-xs font-semibold ${styles.textSecondary}`}
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === "asc" && (
                        <ChevronUp className="h-3 w-3" />
                      )}
                      {h.column.getIsSorted() === "desc" && (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={`border-t ${styles.rowBorder} hover:bg-gray-50 dark:hover:bg-slate-700/30`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={`px-3 py-2 ${styles.textPrimary}`}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
/*  COMPANY DETAIL TABLE                                         */
/* ══════════════════════════════════════════════════════════════ */

interface CompanyRow {
  industry: string;
  company_name: string;
  yoy_sales: number | null;
  qoq_sales: number | null;
  yoy_op: number | null;
  qoq_op: number | null;
  yoy_eps: number | null;
  qoq_eps: number | null;
  yoy_pat: number | null;
  qoq_pat: number | null;
  mcap: number | null;
  pe: number | null;
  peg: number | null;
  pead: string;
  op_margin: number | null;
  pat_margin: number | null;
}

function CompanyDetailTable({
  data,
  quarter,
  compareType,
  styles,
}: {
  data: EarningsCompany[];
  quarter: string;
  compareType: "yoy" | "qoq";
  styles: ReturnType<typeof useChartStyles>;
}) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "yoy_sales", desc: true },
  ]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [peadFilter, setPeadFilter] = useState("All");
  const [showColPicker, setShowColPicker] = useState(false);

  const rows = useMemo<CompanyRow[]>(() => {
    return data.map((c) => {
      const yoyPat = getGrowth(c, "pat", quarter, "yoy");
      return {
        industry: c.industry ?? "Unclassified",
        company_name: c.company_name,
        yoy_sales: getGrowth(c, "sales", quarter, "yoy"),
        qoq_sales: getGrowth(c, "sales", quarter, "qoq"),
        yoy_op: getGrowth(c, "op", quarter, "yoy"),
        qoq_op: getGrowth(c, "op", quarter, "qoq"),
        yoy_eps: getGrowth(c, "eps", quarter, "yoy"),
        qoq_eps: getGrowth(c, "eps", quarter, "qoq"),
        yoy_pat: yoyPat,
        qoq_pat: getGrowth(c, "pat", quarter, "qoq"),
        mcap: c.mcap,
        pe: c.pe,
        peg: c.peg_ratio,
        pead: peadLabel(yoyPat),
        op_margin: c.operating_profit_margin?.[quarter] ?? null,
        pat_margin: c.pat_margin?.[quarter] ?? null,
      };
    });
  }, [data, quarter]);

  const filteredRows = useMemo(() => {
    if (peadFilter === "All") return rows;
    return rows.filter((r) => r.pead === peadFilter);
  }, [rows, peadFilter]);

  const growthCell = useCallback(
    ({ getValue }: { getValue: () => unknown }) => {
      const v = getValue() as number | null;
      if (v == null) return <span className="text-gray-400">-</span>;
      return (
        <span className={`text-xs font-medium ${growthColor(v)}`}>
          {v >= 0 ? "+" : ""}
          {fmtNum(v, 2)}
        </span>
      );
    },
    []
  );

  const columns = useMemo<ColumnDef<CompanyRow>[]>(
    () => [
      { accessorKey: "industry", header: "Industry", size: 160 },
      { accessorKey: "company_name", header: "Company Name", size: 200 },
      {
        accessorKey: "yoy_sales",
        header: "YoY Sales Growth",
        cell: growthCell,
      },
      {
        accessorKey: "qoq_sales",
        header: "QoQ Sales Growth",
        cell: growthCell,
      },
      {
        accessorKey: "yoy_op",
        header: "YoY Op Profit Growth",
        cell: growthCell,
      },
      {
        accessorKey: "qoq_op",
        header: "QoQ Op Profit Growth",
        cell: growthCell,
      },
      {
        accessorKey: "yoy_eps",
        header: "YoY EPS Growth",
        cell: growthCell,
      },
      {
        accessorKey: "qoq_eps",
        header: "QoQ EPS Growth",
        cell: growthCell,
      },
      {
        accessorKey: "yoy_pat",
        header: "YoY PAT Growth",
        cell: growthCell,
      },
      {
        accessorKey: "qoq_pat",
        header: "QoQ PAT Growth",
        cell: growthCell,
      },
      {
        accessorKey: "mcap",
        header: "Market Cap",
        cell: ({ getValue }) => (
          <span className="text-xs">
            {(getValue() as number | null) != null
              ? (getValue() as number).toLocaleString("en-IN", {
                  maximumFractionDigits: 0,
                })
              : "-"}
          </span>
        ),
      },
      {
        accessorKey: "pe",
        header: "PE",
        cell: ({ getValue }) => (
          <span className="text-xs">{fmtNum(getValue() as number | null, 1)}</span>
        ),
      },
      {
        accessorKey: "peg",
        header: "PEG Ratio",
        cell: ({ getValue }) => (
          <span className="text-xs">{fmtNum(getValue() as number | null, 2)}</span>
        ),
      },
      {
        accessorKey: "pead",
        header: "PEAD Classification",
        cell: ({ getValue }) => {
          const label = getValue() as string;
          return (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${peadColor(label)}`}
            >
              {label}
            </span>
          );
        },
      },
    ],
    [growthCell]
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const exportToExcel = useCallback(async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(filteredRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Earnings");
    XLSX.writeFile(wb, `earnings_analysis_${quarter}.xlsx`);
  }, [filteredRows, quarter]);

  return (
    <div className={`overflow-hidden rounded-xl border ${styles.cardBg}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <h2 className={`text-base font-semibold ${styles.textPrimary}`}>
          Company Results Detail
        </h2>
        <div className="flex items-center gap-3">
          {/* PEAD filter */}
          <select
            value={peadFilter}
            onChange={(e) => setPeadFilter(e.target.value)}
            className={`rounded-lg border px-2 py-1 text-xs ${styles.dark ? "border-slate-600 bg-slate-700 text-white" : "border-gray-300 bg-white"}`}
          >
            <option value="All">All PEAD</option>
            <option value="Strong PEAD">Strong PEAD</option>
            <option value="Moderate PEAD">Moderate PEAD</option>
            <option value="No PEAD">No PEAD</option>
            <option value="Weak PEAD">Weak PEAD</option>
          </select>

          {/* Column picker */}
          <div className="relative">
            <button
              onClick={() => setShowColPicker(!showColPicker)}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${styles.dark ? "border-slate-600 bg-slate-700 text-white" : "border-gray-300 bg-white"}`}
            >
              <Columns3 className="h-3 w-3" /> Columns
            </button>
            {showColPicker && (
              <div
                className={`absolute right-0 top-full z-50 mt-1 max-h-64 w-52 overflow-auto rounded-lg border p-2 shadow-lg ${styles.dark ? "border-slate-600 bg-slate-800" : "border-gray-200 bg-white"}`}
              >
                {table.getAllLeafColumns().map((col) => (
                  <label
                    key={col.id}
                    className={`flex cursor-pointer items-center gap-2 px-2 py-1 text-xs ${styles.textPrimary}`}
                  >
                    <input
                      type="checkbox"
                      checked={col.getIsVisible()}
                      onChange={col.getToggleVisibilityHandler()}
                      className="h-3 w-3"
                    />
                    {typeof col.columnDef.header === "string"
                      ? col.columnDef.header
                      : col.id}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Export */}
          <button
            onClick={exportToExcel}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:border-slate-600 dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            <Download className="h-3 w-3" /> Export
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto" style={{ maxHeight: 700 }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className={styles.headBg}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className={`cursor-pointer whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold ${styles.textSecondary}`}
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === "asc" && (
                        <ChevronUp className="h-3 w-3" />
                      )}
                      {h.column.getIsSorted() === "desc" && (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={`border-t ${styles.rowBorder} hover:bg-gray-50 dark:hover:bg-slate-700/30`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`whitespace-nowrap px-3 py-2 ${styles.textPrimary}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-2 dark:border-slate-700">
        <span className={`text-xs ${styles.textSecondary}`}>
          {filteredRows.length.toLocaleString()} companies
        </span>
      </div>
    </div>
  );
}
