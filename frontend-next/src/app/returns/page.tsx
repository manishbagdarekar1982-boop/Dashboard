"use client";

import { useState, useMemo, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  useYearlyReturns,
  type YearlyReturnEntry,
} from "@/api/marketOverview";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import {
  Search,
  Download,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

/* ────────── Types ────────── */

type Tab = "stocks" | "industry" | "sector";
type McapFilter = "all" | "Large Cap" | "Mid Cap" | "Small Cap";
type AggMode = "average" | "mean" | "median";

interface AggGroup {
  name: string;
  count: number;
  stocks: YearlyReturnEntry[];
  [year: string]: number | string | null | YearlyReturnEntry[];
}

const MCAP_OPTIONS: { value: McapFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Large Cap", label: "Large" },
  { value: "Mid Cap", label: "Mid" },
  { value: "Small Cap", label: "Small" },
];

const AGG_OPTIONS: { value: AggMode; label: string }[] = [
  { value: "average", label: "Average" },
  { value: "mean", label: "Mean" },
  { value: "median", label: "Median" },
];

/* ────────── Helpers ────────── */

const cellClr = (v: number) => {
  if (v > 0) return "text-green-600 dark:text-green-400";
  if (v < 0) return "text-red-500 dark:text-red-400";
  return "text-gray-400 dark:text-gray-500";
};

const heatBg = (v: number): string => {
  const a = Math.abs(v);
  if (v > 0)
    return a > 20
      ? "bg-green-500/30"
      : a > 10
        ? "bg-green-500/20"
        : a > 5
          ? "bg-green-400/15"
          : "bg-green-300/10";
  if (v < 0)
    return a > 20
      ? "bg-red-500/30"
      : a > 10
        ? "bg-red-500/20"
        : a > 5
          ? "bg-red-400/15"
          : "bg-red-300/10";
  return "";
};

function calcMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calcMean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function aggregate(vals: number[], mode: AggMode): number {
  if (mode === "median") return calcMedian(vals);
  return calcMean(vals); // average and mean both use arithmetic mean
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

/* ────────── Sort Icon ────────── */

function SortIcon({ col }: { col: { getIsSorted: () => false | "asc" | "desc" } }) {
  const s = col.getIsSorted();
  if (s === "asc") return <ArrowUp className="inline ml-1 h-3 w-3" />;
  if (s === "desc") return <ArrowDown className="inline ml-1 h-3 w-3" />;
  return <ArrowUpDown className="inline ml-1 h-3 w-3 opacity-30" />;
}

/* ────────── Return Cell ────────── */

function ReturnCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-gray-400">—</span>;
  const v = Number(value);
  return (
    <span className={`${cellClr(v)} ${heatBg(v)} px-1.5 py-0.5 rounded`}>
      {v > 0 ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

/* ────────── Excel Export ────────── */

async function exportToExcel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Record<string, any>[],
  columns: string[],
  nameCol: string,
  fileName: string,
) {
  const XLSX = await import("xlsx");
  const header = [nameCol, ...columns];
  const data = rows.map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: Record<string, any> = { [nameCol]: r[nameCol.toLowerCase()] ?? r.name ?? r.symbol };
    for (const c of columns) {
      out[c] = r[c] ?? "";
    }
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Returns");
  XLSX.writeFile(wb, fileName);
}

/* ================================================================
   Main Page Component
   ================================================================ */

export default function ReturnsPage() {
  const { data: resp, isLoading, error } = useYearlyReturns();
  const [tab, setTab] = useState<Tab>("stocks");
  const [mcap, setMcap] = useState<McapFilter>("all");
  const [search, setSearch] = useState("");
  const [aggMode, setAggMode] = useState<AggMode>("average");

  const yearCols = useMemo(() => resp?.columns ?? [], [resp]);

  /* ── Filtered data ── */
  const filtered = useMemo(() => {
    if (!resp) return [];
    let d = resp.data;
    if (mcap !== "all") d = d.filter((r) => r.mcap_type === mcap);
    if (search) {
      const q = search.toLowerCase();
      d = d.filter(
        (r) =>
          (r.symbol && r.symbol.toLowerCase().includes(q)) ||
          (r.sector && r.sector.toLowerCase().includes(q)) ||
          (r.industry && r.industry.toLowerCase().includes(q)),
      );
    }
    return d;
  }, [resp, mcap, search]);

  /* ── Build groups for industry/sector ── */
  const industryGroups = useMemo(() => {
    return buildGroups(filtered, "industry", yearCols, aggMode);
  }, [filtered, yearCols, aggMode]);

  const sectorGroups = useMemo(() => {
    return buildGroups(filtered, "sector", yearCols, aggMode);
  }, [filtered, yearCols, aggMode]);

  /* ── Export ── */
  const handleExport = useCallback(() => {
    if (!yearCols.length) return;
    if (tab === "stocks") {
      exportToExcel(filtered, yearCols, "Symbol", "stock_yearly_returns.xlsx");
    } else if (tab === "industry") {
      exportToExcel(industryGroups, yearCols, "Industry", "industry_yearly_returns.xlsx");
    } else {
      exportToExcel(sectorGroups, yearCols, "Sector", "sector_yearly_returns.xlsx");
    }
  }, [tab, filtered, industryGroups, sectorGroups, yearCols]);

  /* ── Loading / Error states ── */
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-500">
        Error: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-4 gap-3 overflow-hidden">
      {/* ── Header bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold dark:text-white">Yearly Returns</h1>

        {/* Tabs */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 text-sm">
          {(["stocks", "industry", "sector"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md capitalize transition-colors ${
                tab === t
                  ? "bg-white dark:bg-gray-700 shadow text-blue-600 dark:text-blue-400 font-semibold"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* MCap filter */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 text-sm">
          {MCAP_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setMcap(o.value)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                mcap === o.value
                  ? "bg-white dark:bg-gray-700 shadow font-semibold text-blue-600 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Average / Mean / Median toggle (industry/sector only) */}
        {tab !== "stocks" && (
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 text-sm">
            {AGG_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setAggMode(o.value)}
                className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                  aggMode === o.value
                    ? "bg-white dark:bg-gray-700 shadow font-semibold text-blue-600 dark:text-blue-400"
                    : "text-gray-600 dark:text-gray-400"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
          />
        </div>

        {/* Export */}
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <Download className="h-4 w-4" /> Export
        </button>

        {/* Count badge */}
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {tab === "stocks"
            ? `${filtered.length} stocks`
            : tab === "industry"
              ? `${industryGroups.length} industries`
              : `${sectorGroups.length} sectors`}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        {tab === "stocks" ? (
          <StocksTable data={filtered} yearCols={yearCols} />
        ) : tab === "industry" ? (
          <GroupTable groups={industryGroups} yearCols={yearCols} nameLabel="Industry" />
        ) : (
          <GroupTable groups={sectorGroups} yearCols={yearCols} nameLabel="Sector" />
        )}
      </div>
    </div>
  );
}

/* ────────── Build groups helper ────────── */

function buildGroups(
  data: YearlyReturnEntry[],
  groupKey: "industry" | "sector",
  yearCols: string[],
  aggMode: AggMode,
): AggGroup[] {
  if (!data.length || !yearCols.length) return [];
  const groups: Record<string, YearlyReturnEntry[]> = {};
  for (const r of data) {
    const key = (r[groupKey] as string) || "Unknown";
    (groups[key] ??= []).push(r);
  }
  return Object.entries(groups)
    .map(([name, items]) => {
      const row: AggGroup = { name, count: items.length, stocks: items };
      for (const yr of yearCols) {
        const vals = items
          .map((i) => i[yr])
          .filter((v): v is number => v != null && typeof v === "number");
        row[yr] = vals.length > 0 ? round2(aggregate(vals, aggMode)) : null;
      }
      return row;
    })
    .sort((a, b) => b.count - a.count);
}

/* ================================================================
   Stocks Table (TanStack Table with pagination)
   ================================================================ */

function StocksTable({
  data,
  yearCols,
}: {
  data: YearlyReturnEntry[];
  yearCols: string[];
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<YearlyReturnEntry>[]>(() => {
    const cols: ColumnDef<YearlyReturnEntry>[] = [
      {
        accessorKey: "symbol",
        header: "Symbol",
        size: 120,
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="font-semibold dark:text-white">{getValue() as string}</span>
        ),
      },
      {
        accessorKey: "sector",
        header: "Sector",
        size: 140,
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
      {
        accessorKey: "industry",
        header: "Industry",
        size: 160,
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
      {
        accessorKey: "mcap_type",
        header: "MCap",
        size: 80,
        enableSorting: true,
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          if (!v) return "—";
          const short = v === "Large Cap" ? "L" : v === "Mid Cap" ? "M" : v === "Small Cap" ? "S" : v;
          const clr =
            v === "Large Cap"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              : v === "Mid Cap"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
          return (
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${clr}`}>{short}</span>
          );
        },
      },
    ];

    for (const yr of yearCols) {
      cols.push({
        accessorKey: yr,
        header: yr,
        size: 80,
        enableSorting: true,
        sortingFn: "basic",
        cell: ({ getValue }) => <ReturnCell value={getValue() as number | null} />,
      });
    }

    return cols;
  }, [yearCols]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th
                  key={h.id}
                  className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 dark:hover:bg-gray-700"
                  style={{ width: h.getSize() }}
                  onClick={h.column.getToggleSortingHandler()}
                >
                  {flexRender(h.column.columnDef.header, h.getContext())}
                  <SortIcon col={h.column} />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-1.5 whitespace-nowrap">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================
   Group Table — Sector / Industry with expand/collapse
   ================================================================ */

function GroupTable({
  groups,
  yearCols,
  nameLabel,
}: {
  groups: AggGroup[];
  yearCols: string[];
  nameLabel: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleExpand = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const expandAll = () => {
    setExpanded(new Set(groups.map((g) => g.name)));
  };

  const collapseAll = () => {
    setExpanded(new Set());
  };

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const sortedGroups = useMemo(() => {
    if (!sortCol) return groups;
    return [...groups].sort((a, b) => {
      const va = sortCol === "name" ? a.name : sortCol === "count" ? a.count : a[sortCol];
      const vb = sortCol === "name" ? b.name : sortCol === "count" ? b.count : b[sortCol];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [groups, sortCol, sortDir]);

  const SortBtn = ({ col }: { col: string }) => {
    if (sortCol === col) {
      return sortDir === "asc" ? (
        <ArrowUp className="inline ml-1 h-3 w-3" />
      ) : (
        <ArrowDown className="inline ml-1 h-3 w-3" />
      );
    }
    return <ArrowUpDown className="inline ml-1 h-3 w-3 opacity-30" />;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Expand/Collapse all bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-xs shrink-0">
        <button
          onClick={expandAll}
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Expand All
        </button>
        <span className="text-gray-400">|</span>
        <button
          onClick={collapseAll}
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Collapse All
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th
                className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 dark:hover:bg-gray-700"
                style={{ minWidth: 200 }}
                onClick={() => handleSort("name")}
              >
                {nameLabel}
                <SortBtn col="name" />
              </th>
              <th
                className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 dark:hover:bg-gray-700"
                style={{ width: 50 }}
                onClick={() => handleSort("count")}
              >
                #
                <SortBtn col="count" />
              </th>
              {yearCols.map((yr) => (
                <th
                  key={yr}
                  className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 dark:hover:bg-gray-700"
                  style={{ width: 80 }}
                  onClick={() => handleSort(yr)}
                >
                  {yr}
                  <SortBtn col={yr} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedGroups.map((group) => {
              const isExpanded = expanded.has(group.name);
              return (
                <GroupRows
                  key={group.name}
                  group={group}
                  yearCols={yearCols}
                  isExpanded={isExpanded}
                  onToggle={() => toggleExpand(group.name)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Individual group: header + expanded child rows ── */

function GroupRows({
  group,
  yearCols,
  isExpanded,
  onToggle,
}: {
  group: AggGroup;
  yearCols: string[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      {/* Group header row */}
      <tr
        className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
        onClick={onToggle}
      >
        <td className="px-3 py-2 whitespace-nowrap">
          <span className="inline-flex items-center gap-1.5 font-semibold dark:text-white">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
            {group.name}
          </span>
        </td>
        <td className="px-3 py-2 whitespace-nowrap text-gray-500 dark:text-gray-400">
          {group.count}
        </td>
        {yearCols.map((yr) => (
          <td key={yr} className="px-3 py-2 whitespace-nowrap font-medium">
            <ReturnCell value={group[yr] as number | null} />
          </td>
        ))}
      </tr>

      {/* Expanded child stock rows */}
      {isExpanded &&
        group.stocks.map((stock) => (
          <tr
            key={stock.symbol}
            className="border-b border-gray-100 dark:border-gray-800 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors"
          >
            <td className="pl-10 pr-3 py-1 whitespace-nowrap">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {stock.symbol}
              </span>
            </td>
            <td className="px-3 py-1 whitespace-nowrap">
              <McapBadge type={stock.mcap_type} />
            </td>
            {yearCols.map((yr) => (
              <td key={yr} className="px-3 py-1 whitespace-nowrap text-xs">
                <ReturnCell value={stock[yr] as number | null} />
              </td>
            ))}
          </tr>
        ))}
    </>
  );
}

/* ── MCap Badge ── */

function McapBadge({ type }: { type: string | null }) {
  if (!type) return <span className="text-gray-400 text-xs">—</span>;
  const short = type === "Large Cap" ? "L" : type === "Mid Cap" ? "M" : type === "Small Cap" ? "S" : type;
  const clr =
    type === "Large Cap"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
      : type === "Mid Cap"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
  return <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${clr}`}>{short}</span>;
}

