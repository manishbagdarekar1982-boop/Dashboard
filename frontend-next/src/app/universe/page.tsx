"use client";

import { useState, useMemo, useCallback } from "react";
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
import { useUniverse } from "@/api/universe";
import type { UniverseCompany } from "@/types/universe";
import { useThemeStore } from "@/store/themeStore";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Columns3,
  Search,
} from "lucide-react";

/* ──────────────────── THEME ──────────────────── */

function useStyles() {
  const { theme } = useThemeStore();
  const dark = theme === "dark";
  return {
    dark,
    cardBg: dark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200",
    headBg: dark ? "bg-slate-700/50" : "bg-gray-50",
    rowBorder: dark ? "border-slate-700" : "border-gray-100",
    textPrimary: dark ? "text-white" : "text-gray-900",
    textSecondary: dark ? "text-gray-400" : "text-gray-500",
  };
}

/* ──────────────────── COLUMN CONFIG ──────────────────── */

const COLUMN_LABELS: Record<string, string> = {
  company_name: "Company Name",
  company_short_name: "Short Name",
  nse_symbol: "NSE Symbol",
  bse_symbol: "BSE Symbol",
  bse_code: "BSE Code",
  co_code: "Co Code",
  isin: "ISIN",
  bse_group: "BSE Group",
  mcaptype: "MCap Type",
  mcap: "MCap (Cr)",
  ace_sector: "ACE Sector",
  ace_industry: "ACE Industry",
  sector_name: "BSE Sector",
  industry_name: "BSE Industry",
  bse_listed_flag: "BSE Listed",
  nse_listed_flag: "NSE Listed",
  bse_status: "BSE Status",
  nse_status: "NSE Status",
  sector_code: "Sector Code",
  industry_code: "Industry Code",
};

// Columns visible by default
const DEFAULT_VISIBLE = new Set([
  "company_name",
  "nse_symbol",
  "bse_symbol",
  "ace_sector",
  "ace_industry",
  "mcaptype",
  "mcap",
  "bse_group",
]);

/* ──────────────────── HELPERS ──────────────────── */

function fmtMcap(v: number | null): string {
  if (v == null) return "-";
  if (v >= 100000) return `${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  return v.toFixed(0);
}

/* ──────────────────── PAGE ──────────────────── */

export default function UniversePage() {
  const styles = useStyles();
  const { data, isLoading, error } = useUniverse();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [mcapFilter, setMcapFilter] = useState("All");
  const [sectorFilter, setSectorFilter] = useState("All");
  const [industryFilter, setIndustryFilter] = useState("All");
  const [showColPicker, setShowColPicker] = useState(false);

  // Build initial visibility from DEFAULT_VISIBLE
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () => {
      const vis: VisibilityState = {};
      for (const col of Object.keys(COLUMN_LABELS)) {
        if (!DEFAULT_VISIBLE.has(col)) vis[col] = false;
      }
      return vis;
    }
  );

  // Industries filtered by selected sector
  const filteredIndustries = useMemo(() => {
    if (!data || sectorFilter === "All") return data?.meta.industries ?? [];
    const set = new Set<string>();
    for (const c of data.companies) {
      if (c.ace_sector === sectorFilter && c.ace_industry) {
        set.add(c.ace_industry);
      }
    }
    return [...set].sort();
  }, [data, sectorFilter]);

  // Reset industry when sector changes
  const handleSectorChange = useCallback(
    (val: string) => {
      setSectorFilter(val);
      setIndustryFilter("All");
    },
    []
  );

  // Filtered data
  const filteredData = useMemo(() => {
    if (!data) return [];
    let rows = data.companies;
    if (mcapFilter !== "All") {
      rows = rows.filter((c) => c.mcaptype === mcapFilter);
    }
    if (sectorFilter !== "All") {
      rows = rows.filter((c) => c.ace_sector === sectorFilter);
    }
    if (industryFilter !== "All") {
      rows = rows.filter((c) => c.ace_industry === industryFilter);
    }
    if (globalFilter.trim()) {
      const q = globalFilter.toLowerCase();
      rows = rows.filter(
        (c) =>
          (c.company_name?.toLowerCase().includes(q)) ||
          (c.nse_symbol?.toLowerCase().includes(q)) ||
          (c.bse_symbol?.toLowerCase().includes(q)) ||
          (c.isin?.toLowerCase().includes(q))
      );
    }
    return rows;
  }, [data, mcapFilter, sectorFilter, industryFilter, globalFilter]);

  // Table columns
  const columns = useMemo<ColumnDef<UniverseCompany>[]>(() => {
    const cols: ColumnDef<UniverseCompany>[] = [];

    for (const key of Object.keys(COLUMN_LABELS)) {
      const label = COLUMN_LABELS[key];
      const colDef: ColumnDef<UniverseCompany> = {
        id: key,
        accessorFn: (row) => (row as Record<string, unknown>)[key],
        header: label,
        cell:
          key === "mcap"
            ? ({ getValue }) => {
                const v = getValue() as number | null;
                return (
                  <span className="tabular-nums">
                    {fmtMcap(v)}
                  </span>
                );
              }
            : ({ getValue }) => {
                const v = getValue();
                if (v == null) return <span className="text-gray-400">-</span>;
                return <>{String(v)}</>;
              },
      };

      if (key === "mcap") {
        colDef.sortingFn = "basic";
      }

      cols.push(colDef);
    }

    return cols;
  }, []);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  });

  // Export
  const exportToExcel = useCallback(async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(filteredData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Universe");
    XLSX.writeFile(wb, "universe_companies.xlsx");
  }, [filteredData]);

  /* ──────── Loading / Error ──────── */

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-96 items-center justify-center text-red-500">
        Failed to load universe data
      </div>
    );
  }

  /* ──────── Render ──────── */

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Title + MCap buttons */}
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className={`text-2xl font-bold ${styles.textPrimary}`}>
            Listed Universe
          </h1>
          <p className={`text-sm ${styles.textSecondary}`}>
            Showing {filteredData.length.toLocaleString()} of{" "}
            {data.meta.total.toLocaleString()} companies
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-1 dark:border-slate-700">
          {["All", "Large Cap", "Mid Cap", "Small Cap"].map((cap) => (
            <button
              key={cap}
              onClick={() => setMcapFilter(cap)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                mcapFilter === cap
                  ? "bg-blue-600 text-white shadow-sm"
                  : styles.dark
                    ? "text-gray-400 hover:bg-slate-700 hover:text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {cap}
              {cap !== "All" && data.meta.mcap_counts[cap] != null && (
                <span className="ml-1 text-xs opacity-70">
                  ({data.meta.mcap_counts[cap]})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search company, symbol, ISIN..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className={`rounded-lg border py-2 pl-9 pr-3 text-sm ${
              styles.dark
                ? "border-slate-600 bg-slate-700 text-white placeholder:text-gray-400"
                : "border-gray-300 bg-white placeholder:text-gray-400"
            } w-72`}
          />
        </div>

        {/* Sector */}
        <select
          value={sectorFilter}
          onChange={(e) => handleSectorChange(e.target.value)}
          className={`rounded-lg border px-3 py-2 text-sm ${
            styles.dark
              ? "border-slate-600 bg-slate-700 text-white"
              : "border-gray-300 bg-white"
          }`}
        >
          <option value="All">All Sectors ({data.meta.sectors.length})</option>
          {data.meta.sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Industry */}
        <select
          value={industryFilter}
          onChange={(e) => setIndustryFilter(e.target.value)}
          className={`rounded-lg border px-3 py-2 text-sm ${
            styles.dark
              ? "border-slate-600 bg-slate-700 text-white"
              : "border-gray-300 bg-white"
          }`}
        >
          <option value="All">
            All Industries ({filteredIndustries.length})
          </option>
          {filteredIndustries.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>

        {/* Column picker */}
        <div className="relative ml-auto">
          <button
            onClick={() => setShowColPicker(!showColPicker)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${
              styles.dark
                ? "border-slate-600 bg-slate-700 text-white"
                : "border-gray-300 bg-white"
            }`}
          >
            <Columns3 className="h-4 w-4" /> Columns
          </button>
          {showColPicker && (
            <div
              className={`absolute right-0 top-full z-50 mt-1 max-h-80 w-56 overflow-auto rounded-lg border p-2 shadow-lg ${
                styles.dark
                  ? "border-slate-600 bg-slate-800"
                  : "border-gray-200 bg-white"
              }`}
            >
              {table.getAllLeafColumns().map((col) => (
                <label
                  key={col.id}
                  className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-slate-700 ${styles.textPrimary}`}
                >
                  <input
                    type="checkbox"
                    checked={col.getIsVisible()}
                    onChange={col.getToggleVisibilityHandler()}
                    className="h-3.5 w-3.5"
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
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:border-slate-600 dark:text-blue-400 dark:hover:bg-blue-900/20"
        >
          <Download className="h-4 w-4" /> Export
        </button>
      </div>

      {/* Table */}
      <div className={`overflow-hidden rounded-xl border ${styles.cardBg}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={`sticky top-0 z-10 ${styles.headBg}`}>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      className={`cursor-pointer whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold ${styles.textSecondary}`}
                      onClick={h.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(
                          h.column.columnDef.header,
                          h.getContext()
                        )}
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
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t px-4 py-2 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <span className={`text-xs ${styles.textSecondary}`}>
              {filteredData.length.toLocaleString()} companies
            </span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className={`rounded border px-2 py-1 text-xs ${
                styles.dark
                  ? "border-slate-600 bg-slate-700 text-white"
                  : "border-gray-300 bg-white"
              }`}
            >
              {[25, 50, 100, 200].map((size) => (
                <option key={size} value={size}>
                  {size} rows
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-40 dark:text-blue-400 dark:hover:bg-blue-900/20"
            >
              Prev
            </button>
            <span className={`text-xs ${styles.textSecondary}`}>
              {table.getState().pagination.pageIndex + 1} /{" "}
              {table.getPageCount()}
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-40 dark:text-blue-400 dark:hover:bg-blue-900/20"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
