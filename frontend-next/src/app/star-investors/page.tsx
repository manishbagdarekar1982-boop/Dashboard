"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  useTopInvestors,
  useInvestorSearch,
  useInvestorHoldings,
  useInvestorKeyChanges,
  useInvestorGainersLosers,
} from "@/api/starInvestors";
import type {
  InvestorHolding,
  InvestorKeyChange,
  SparklinePoint,
} from "@/types/starInvestor";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { MiniSparkline } from "@/components/charts/MiniSparkline";
import {
  Search,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Users,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

/* ────────── Constants ────────── */

type Tab = "holding" | "key_changes" | "gainers" | "losers";
const PERIODS = ["1d", "1w", "1m", "3m", "6m", "1y", "2y", "5y"] as const;
const PERIOD_LABEL: Record<string, string> = {
  "1d": "1D", "1w": "1W", "1m": "1M", "3m": "3M",
  "6m": "6M", "1y": "1Y", "2y": "2Y", "5y": "5Y",
};

/* ────────── Helpers ────────── */

const cellClr = (v: number) => {
  if (v > 0) return "text-green-600 dark:text-green-400";
  if (v < 0) return "text-red-500 dark:text-red-400";
  return "text-gray-400";
};

const heatBg = (v: number): string => {
  const a = Math.abs(v);
  if (v > 0)
    return a > 20 ? "bg-green-500/20" : a > 10 ? "bg-green-500/15" : a > 5 ? "bg-green-400/10" : "";
  if (v < 0)
    return a > 20 ? "bg-red-500/20" : a > 10 ? "bg-red-500/15" : a > 5 ? "bg-red-400/10" : "";
  return "";
};

const fmtPct = (v: number | null) => {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
};

const fmtPrice = (v: number | null) => {
  if (v == null) return "—";
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtChange = (v: number | null) => {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
};

/* ================================================================
   Main Page
   ================================================================ */

export default function StarInvestorsPage() {
  const [selectedInvestor, setSelectedInvestor] = useState<string | null>(null);
  const [period, setPeriod] = useState("1y");
  const [tab, setTab] = useState<Tab>("holding");
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: topInvestors, isLoading: topLoading } = useTopInvestors(100);
  const { data: searchResults } = useInvestorSearch(search, 15);

  // Filter top investors by search on landing
  const filteredTop = useMemo(() => {
    if (!topInvestors) return [];
    if (!search) return topInvestors;
    const q = search.toLowerCase();
    return topInvestors.filter((i) => i.name.toLowerCase().includes(q));
  }, [topInvestors, search]);

  if (selectedInvestor) {
    return (
      <InvestorDetail
        name={selectedInvestor}
        period={period}
        setPeriod={setPeriod}
        tab={tab}
        setTab={setTab}
        onBack={() => { setSelectedInvestor(null); setTab("holding"); }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        <h1 className="text-xl font-bold dark:text-white">Star Investors</h1>

        {/* Search */}
        <div className="relative ml-auto w-80" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Search investor name..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {showDropdown && search.length >= 2 && searchResults && searchResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto">
              {searchResults.map((r) => (
                <button
                  key={r.name}
                  onClick={() => { setSelectedInvestor(r.name); setShowDropdown(false); setSearch(""); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 dark:hover:bg-gray-700 dark:text-white transition-colors"
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top Investors Grid */}
      {topLoading ? (
        <div className="flex items-center justify-center flex-1">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredTop.map((inv) => (
            <button
              key={inv.name}
              onClick={() => setSelectedInvestor(inv.name)}
              className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all text-left group"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold text-sm">
                {inv.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {inv.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {inv.holdings_count} stocks
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================
   Investor Detail View
   ================================================================ */

function InvestorDetail({
  name,
  period,
  setPeriod,
  tab,
  setTab,
  onBack,
}: {
  name: string;
  period: string;
  setPeriod: (p: string) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
  onBack: () => void;
}) {
  const { data: holdingsResp, isLoading: hLoading } = useInvestorHoldings(name, period);
  const { data: changesResp, isLoading: cLoading } = useInvestorKeyChanges(name, period);
  const { data: glResp, isLoading: glLoading } = useInvestorGainersLosers(name, period);

  const isLoading = tab === "holding" ? hLoading
    : tab === "key_changes" ? cLoading
    : glLoading;

  return (
    <div className="flex flex-col h-full p-4 gap-3 overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 dark:text-white" />
        </button>
        <h1 className="text-lg font-bold dark:text-white truncate max-w-md">{name}</h1>

        {holdingsResp && (
          <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
            {holdingsResp.total_holdings} stocks
          </span>
        )}

        {/* Period pills */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 text-sm ml-auto">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                period === p
                  ? "bg-white dark:bg-gray-700 shadow font-semibold text-blue-600 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
              }`}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 text-sm self-start">
        {([
          ["holding", "Holding"],
          ["key_changes", "Key Changes"],
          ["gainers", "Gainers"],
          ["losers", "Losers"],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              tab === t
                ? "bg-white dark:bg-gray-700 shadow font-semibold text-blue-600 dark:text-blue-400"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
            }`}
          >
            {t === "gainers" && <TrendingUp className="h-3.5 w-3.5" />}
            {t === "losers" && <TrendingDown className="h-3.5 w-3.5" />}
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <LoadingSpinner size="lg" />
          </div>
        ) : tab === "holding" ? (
          <HoldingsTable holdings={holdingsResp?.holdings ?? []} />
        ) : tab === "key_changes" ? (
          <KeyChangesTable changes={changesResp?.changes ?? []} />
        ) : tab === "gainers" ? (
          <HoldingsTable holdings={glResp?.gainers ?? []} />
        ) : (
          <HoldingsTable holdings={glResp?.losers ?? []} />
        )}
      </div>
    </div>
  );
}

/* ================================================================
   Holdings Table
   ================================================================ */

type SortKey = "company_name" | "price" | "perstake" | "pct_change" | "price_change";

function HoldingsTable({ holdings }: { holdings: InvestorHolding[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("perstake");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sorted = useMemo(() => {
    return [...holdings].sort((a, b) => {
      const va = a[sortKey] ?? -Infinity;
      const vb = b[sortKey] ?? -Infinity;
      const cmp = typeof va === "string" ? (va as string).localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [holdings, sortKey, sortDir]);

  const SortBtn = ({ col }: { col: SortKey }) => {
    if (sortKey === col)
      return sortDir === "asc" ? <ArrowUp className="inline ml-1 h-3 w-3" /> : <ArrowDown className="inline ml-1 h-3 w-3" />;
    return <ArrowUpDown className="inline ml-1 h-3 w-3 opacity-30" />;
  };

  if (holdings.length === 0) {
    return <div className="flex items-center justify-center h-full text-gray-400">No holdings found</div>;
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handleSort("company_name")}>
              Company <SortBtn col="company_name" />
            </th>
            <th className="px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
              Chart
            </th>
            <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handleSort("perstake")}>
              Stake % <SortBtn col="perstake" />
            </th>
            <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handleSort("price")}>
              Price <SortBtn col="price" />
            </th>
            <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handleSort("price_change")}>
              Change <SortBtn col="price_change" />
            </th>
            <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handleSort("pct_change")}>
              % Change <SortBtn col="pct_change" />
            </th>
            <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
              Sector
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h) => (
            <tr
              key={h.co_code}
              className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <td className="px-3 py-2 whitespace-nowrap">
                <div className="font-semibold dark:text-white text-sm">{h.company_name || h.symbol}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{h.symbol}</div>
              </td>
              <td className="px-3 py-2">
                {h.sparkline && h.sparkline.length >= 2 ? (
                  <MiniSparkline
                    data={h.sparkline}
                    color={(h.pct_change ?? 0) >= 0 ? "#22C55E" : "#EF4444"}
                    width={80}
                    height={28}
                  />
                ) : (
                  <span className="text-gray-300 text-xs">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <span className="font-medium text-blue-600 dark:text-blue-400">{h.perstake.toFixed(2)}%</span>
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap font-medium dark:text-white">
                {fmtPrice(h.price)}
              </td>
              <td className={`px-3 py-2 text-right whitespace-nowrap font-medium ${h.price_change != null ? cellClr(h.price_change) : ""}`}>
                {fmtChange(h.price_change)}
              </td>
              <td className={`px-3 py-2 text-right whitespace-nowrap font-medium ${h.pct_change != null ? `${cellClr(h.pct_change)} ${heatBg(h.pct_change)}` : ""} rounded`}>
                {fmtPct(h.pct_change)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400 max-w-[140px] truncate">
                {h.sector || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================
   Key Changes Table
   ================================================================ */

const CHANGE_BADGE: Record<string, string> = {
  "New Entry": "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "Increased": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "Decreased": "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "Exited": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "Unchanged": "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
};

function KeyChangesTable({ changes }: { changes: InvestorKeyChange[] }) {
  if (changes.length === 0) {
    return <div className="flex items-center justify-center h-full text-gray-400">No key changes found</div>;
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">Company</th>
            <th className="px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-300">Chart</th>
            <th className="px-3 py-2 text-center font-semibold text-gray-700 dark:text-gray-300">Type</th>
            <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">Current %</th>
            <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">Prev %</th>
            <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">Change</th>
            <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">Price</th>
            <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">Return</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr
              key={c.co_code}
              className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <td className="px-3 py-2 whitespace-nowrap">
                <div className="font-semibold dark:text-white text-sm">{c.company_name || c.symbol}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{c.symbol}</div>
              </td>
              <td className="px-3 py-2">
                {c.sparkline && c.sparkline.length >= 2 ? (
                  <MiniSparkline
                    data={c.sparkline}
                    color={(c.pct_change ?? 0) >= 0 ? "#22C55E" : "#EF4444"}
                    width={80}
                    height={28}
                  />
                ) : (
                  <span className="text-gray-300 text-xs">—</span>
                )}
              </td>
              <td className="px-3 py-2 text-center whitespace-nowrap">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CHANGE_BADGE[c.change_type] || CHANGE_BADGE["Unchanged"]}`}>
                  {c.change_type}
                </span>
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap font-medium text-blue-600 dark:text-blue-400">
                {c.current_stake.toFixed(2)}%
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap text-gray-500 dark:text-gray-400">
                {c.prev_stake != null ? `${c.prev_stake.toFixed(2)}%` : "—"}
              </td>
              <td className={`px-3 py-2 text-right whitespace-nowrap font-medium ${c.stake_change != null ? cellClr(c.stake_change) : ""}`}>
                {c.stake_change != null ? `${c.stake_change > 0 ? "+" : ""}${c.stake_change.toFixed(2)}%` : "—"}
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap font-medium dark:text-white">
                {fmtPrice(c.price)}
              </td>
              <td className={`px-3 py-2 text-right whitespace-nowrap font-medium ${c.pct_change != null ? `${cellClr(c.pct_change)} ${heatBg(c.pct_change)}` : ""} rounded`}>
                {fmtPct(c.pct_change)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
