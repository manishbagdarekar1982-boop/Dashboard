"use client";

import { useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { useThemeStore } from "@/store/themeStore";
import { useNews, useNewsCategories, useNewsStats, useNewspaperList, getNewspaperUrl } from "@/api/news";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import type { NewsArticle, NewspaperFile } from "@/types/news";

// ─── Constants ───────────────────────────────────────────────

const PAGE_SIZE = 30;

const CATEGORY_COLORS: Record<string, string> = {
  Default: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  Global: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  Commodities: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Fixed_income: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Block_Details: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  Commentary: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

const PAPER_COLORS: Record<string, string> = {
  BS: "bg-rose-600",
  ET: "bg-blue-600",
  FE: "bg-emerald-600",
  Mint: "bg-green-600",
};

// ─── Helpers ─────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return iso.slice(0, 16);
  }
}

function fmtDate(iso: string): string {
  // 2026-03-11 → 11 Mar 2026
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${months[parseInt(m) - 1]} ${y}`;
}

// ─── Main Page ───────────────────────────────────────────────

export default function NewsPage() {
  const isDark = useThemeStore((s) => s.isDark);
  const [activeTab, setActiveTab] = useState<"feed" | "newspapers">("feed");

  const { data: stats } = useNewsStats();

  const tabs = [
    { key: "feed" as const, label: "News Feed", count: stats?.total_articles },
    { key: "newspapers" as const, label: "Newspapers" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">News & Newspapers</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Live market news feed + daily newspaper PDFs
          </p>
        </div>
        {stats && (
          <div className="text-right text-xs text-gray-500 dark:text-gray-400">
            <p><span className="font-semibold text-gray-700 dark:text-gray-200">{stats.total_articles}</span> articles stored</p>
            {stats.latest && <p>Latest: {timeAgo(stats.latest)}</p>}
          </div>
        )}
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 px-6 pt-3 pb-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === t.key
                ? "bg-blue-600 text-white"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
            }`}
          >
            {t.label}
            {t.count != null && (
              <span className={`ml-1.5 text-xs ${activeTab === t.key ? "text-blue-200" : "text-gray-400"}`}>
                ({t.count.toLocaleString()})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {activeTab === "feed" ? <NewsFeedSection /> : <NewspaperSection />}
      </div>
    </div>
  );
}

// ─── News Feed Section ───────────────────────────────────────

function NewsFeedSection() {
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [symbolFilter, setSymbolFilter] = useState("");

  const { data: categories } = useNewsCategories();
  const { data, isLoading, error } = useNews({
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE,
    category: categoryFilter || undefined,
    symbol: symbolFilter || undefined,
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  const handleSymbolClick = (symbol: string) => {
    if (symbolFilter === symbol) {
      setSymbolFilter("");
    } else {
      setSymbolFilter(symbol);
      setPage(0);
    }
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 mt-1">
        {/* Category */}
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        >
          <option value="">All Categories</option>
          {categories?.map((c) => (
            <option key={c} value={c}>{c.replace("_", " ")}</option>
          ))}
        </select>

        {/* Symbol search */}
        <input
          type="text"
          placeholder="Filter by symbol..."
          value={symbolFilter}
          onChange={(e) => { setSymbolFilter(e.target.value.toUpperCase()); setPage(0); }}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm w-44 dark:border-slate-600 dark:bg-slate-800 dark:text-white placeholder:text-gray-400"
        />

        {symbolFilter && (
          <button
            onClick={() => { setSymbolFilter(""); setPage(0); }}
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            Clear symbol filter
          </button>
        )}

        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex rounded-lg border border-gray-300 dark:border-slate-600 overflow-hidden">
          {(["cards", "table"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`px-3 py-1 text-xs font-semibold ${
                viewMode === v
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 dark:bg-slate-800 dark:text-gray-400"
              }`}
            >
              {v === "cards" ? "Cards" : "Table"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-20"><LoadingSpinner /></div>
      ) : error ? (
        <div className="text-center py-20 text-red-500">{String(error)}</div>
      ) : !data || data.articles.length === 0 ? (
        <div className="text-center py-20 text-gray-500 dark:text-gray-400">No articles found</div>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.articles.map((a) => (
            <NewsCard key={a.guid} article={a} onSymbolClick={handleSymbolClick} activeSymbol={symbolFilter} />
          ))}
        </div>
      ) : (
        <NewsTable articles={data.articles} onSymbolClick={handleSymbolClick} />
      )}

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200 dark:border-slate-700">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)} of {data.total.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-slate-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300"
            >
              Previous
            </button>
            <span className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
              Page {page + 1} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 text-xs rounded border border-gray-300 dark:border-slate-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── News Card ───────────────────────────────────────────────

function NewsCard({
  article,
  onSymbolClick,
  activeSymbol,
}: {
  article: NewsArticle;
  onSymbolClick: (s: string) => void;
  activeSymbol: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow dark:border-slate-700 dark:bg-slate-800 flex flex-col">
      {/* Categories */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {article.categories.map((cat) => (
          <span
            key={cat}
            className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.Default}`}
          >
            {cat.replace("_", " ")}
          </span>
        ))}
        {article.notification && (
          <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
            Alert
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 mb-1.5">
        {article.title}
      </h3>

      {/* Description */}
      {article.description && article.description !== article.title && (
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 mb-3">
          {article.description}
        </p>
      )}

      <div className="mt-auto" />

      {/* Footer */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex flex-wrap gap-1">
          {article.companies
            .filter((c) => c.nse_symbol)
            .slice(0, 4)
            .map((c) => (
              <button
                key={c.nse_symbol}
                onClick={() => onSymbolClick(c.nse_symbol)}
                className={`text-[10px] font-medium rounded px-1.5 py-0.5 cursor-pointer transition-colors ${
                  activeSymbol === c.nse_symbol
                    ? "bg-blue-600 text-white"
                    : "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                }`}
              >
                {c.nse_symbol}
              </button>
            ))}
          {article.companies.filter((c) => c.nse_symbol).length > 4 && (
            <span className="text-[10px] text-gray-400">+{article.companies.filter((c) => c.nse_symbol).length - 4}</span>
          )}
        </div>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap ml-2">
          {timeAgo(article.published_at)}
        </span>
      </div>
    </div>
  );
}

// ─── News Table ──────────────────────────────────────────────

function NewsTable({
  articles,
  onSymbolClick,
}: {
  articles: NewsArticle[];
  onSymbolClick: (s: string) => void;
}) {
  const thCls = "px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800/80 sticky top-0 z-10";
  const tdCls = "px-3 py-2 text-sm";

  return (
    <div className="overflow-auto rounded-lg border border-gray-200 dark:border-slate-700" style={{ maxHeight: 600 }}>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className={thCls} style={{ width: 120 }}>Time</th>
            <th className={thCls}>Title</th>
            <th className={thCls} style={{ width: 140 }}>Category</th>
            <th className={thCls} style={{ width: 200 }}>Companies</th>
            <th className={thCls} style={{ width: 100 }}>Source</th>
          </tr>
        </thead>
        <tbody>
          {articles.map((a) => (
            <tr key={a.guid} className="border-t border-gray-100 dark:border-slate-700/50 hover:bg-gray-50 dark:hover:bg-slate-800/50">
              <td className={`${tdCls} text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap`}>
                {timeAgo(a.published_at)}
              </td>
              <td className={`${tdCls} text-gray-900 dark:text-white`}>
                <p className="line-clamp-2 text-sm">{a.title}</p>
              </td>
              <td className={tdCls}>
                <div className="flex flex-wrap gap-1">
                  {a.categories.map((c) => (
                    <span key={c} className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${CATEGORY_COLORS[c] ?? CATEGORY_COLORS.Default}`}>
                      {c.replace("_", " ")}
                    </span>
                  ))}
                </div>
              </td>
              <td className={tdCls}>
                <div className="flex flex-wrap gap-1">
                  {a.companies
                    .filter((c) => c.nse_symbol)
                    .slice(0, 3)
                    .map((c) => (
                      <button
                        key={c.nse_symbol}
                        onClick={() => onSymbolClick(c.nse_symbol)}
                        className="text-[10px] font-medium bg-blue-50 text-blue-600 rounded px-1.5 py-0.5 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400"
                      >
                        {c.nse_symbol}
                      </button>
                    ))}
                </div>
              </td>
              <td className={`${tdCls} text-xs text-gray-500 dark:text-gray-400`}>
                {a.custom_name || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Newspaper Section ───────────────────────────────────────

function NewspaperSection() {
  const { data, isLoading, error } = useNewspaperList();
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedPaper, setSelectedPaper] = useState<string>("BS");

  // Set default date when data loads
  const dates = data?.dates ?? [];
  const effectiveDate = selectedDate || dates[0] || "";
  const papersForDate = data?.papers?.[effectiveDate] ?? [];

  // Find selected paper file
  const selectedFile: NewspaperFile | undefined = papersForDate.find((p) => p.code === selectedPaper) ?? papersForDate[0];

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;
  if (error) return <div className="text-center py-20 text-red-500">{String(error)}</div>;
  if (!data || dates.length === 0) {
    return <div className="text-center py-20 text-gray-500 dark:text-gray-400">No newspaper PDFs found in News_paper folder</div>;
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-4 mt-1">
        {/* Date picker */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Date:</label>
          <select
            value={effectiveDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          >
            {dates.map((d) => (
              <option key={d} value={d}>{fmtDate(d)}</option>
            ))}
          </select>
        </div>

        {/* Paper tabs */}
        <div className="flex gap-1">
          {papersForDate.map((p) => (
            <button
              key={p.code}
              onClick={() => setSelectedPaper(p.code)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                (selectedFile?.code === p.code)
                  ? `${PAPER_COLORS[p.code] ?? "bg-blue-600"} text-white`
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
              }`}
            >
              {p.code}
            </button>
          ))}
        </div>

        {selectedFile && (
          <div className="ml-auto text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium text-gray-700 dark:text-gray-300">{selectedFile.name}</span>
            {" "}&middot; {selectedFile.size_mb} MB
            {" "}&middot;{" "}
            <a
              href={getNewspaperUrl(selectedFile.filename)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              Open in new tab
            </a>
          </div>
        )}
      </div>

      {/* PDF Viewer */}
      {selectedFile ? (
        <div className="rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden bg-gray-100 dark:bg-slate-900">
          <iframe
            key={selectedFile.filename}
            src={getNewspaperUrl(selectedFile.filename)}
            className="w-full border-0"
            style={{ minHeight: "80vh" }}
            title={`${selectedFile.name} - ${fmtDate(effectiveDate)}`}
          />
        </div>
      ) : (
        <div className="text-center py-20 text-gray-500 dark:text-gray-400">
          No PDF available for this selection
        </div>
      )}
    </div>
  );
}
