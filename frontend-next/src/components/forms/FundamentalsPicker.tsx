"use client";

import { useState, useMemo, useCallback, useEffect } from 'react';
import { BarChart3, Search, X, Check } from 'lucide-react';
import { useFundamentalStore } from '@/store/fundamentalStore';
import { useFundamentalCatalog } from '@/hooks/useFundamentals';

const TAB_LABELS: Record<string, string> = {
  income_statement: 'Income Statement',
  balance_sheet: 'Balance Sheet',
  cash_flow: 'Cash Flow',
  statistics: 'Statistics',
};

export function FundamentalsPickerButton() {
  const selectedMetrics = useFundamentalStore((s) => s.selectedMetrics);
  const setPickerOpen = useFundamentalStore((s) => s.setPickerOpen);

  return (
    <button
      onClick={() => setPickerOpen(true)}
      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-white"
    >
      <BarChart3 className="h-3.5 w-3.5" />
      Fundamentals
      {selectedMetrics.length > 0 && (
        <span className="ml-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white">
          {selectedMetrics.length}
        </span>
      )}
    </button>
  );
}

export function FundamentalsPickerModal() {
  const pickerOpen = useFundamentalStore((s) => s.pickerOpen);
  const setPickerOpen = useFundamentalStore((s) => s.setPickerOpen);
  const selectedMetrics = useFundamentalStore((s) => s.selectedMetrics);
  const toggleMetric = useFundamentalStore((s) => s.toggleMetric);
  const period = useFundamentalStore((s) => s.period);
  const setPeriod = useFundamentalStore((s) => s.setPeriod);
  const clearAll = useFundamentalStore((s) => s.clearAll);
  const { data: catalog } = useFundamentalCatalog();

  const [activeTab, setActiveTab] = useState('income_statement');
  const [search, setSearch] = useState('');

  // Close on Escape
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pickerOpen, setPickerOpen]);

  const tabs = catalog?.tabs ?? [];

  const filteredMetrics = useMemo(() => {
    if (!catalog) return [];
    const q = search.toLowerCase().trim();
    return catalog.metrics.filter((m) => {
      if (q && !m.label.toLowerCase().includes(q) && !m.key.includes(q)) return false;
      if (!q && m.tab !== activeTab) return false;
      return true;
    });
  }, [catalog, search, activeTab]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) setPickerOpen(false);
    },
    [setPickerOpen],
  );

  if (!pickerOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="flex h-[520px] w-[580px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Indicators, Metrics & Fundamentals
          </h2>
          <button
            onClick={() => setPickerOpen(false)}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 border-b border-gray-200 px-5 py-2 dark:border-slate-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search metrics..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-gray-500"
              autoFocus
            />
          </div>
        </div>

        {/* Tabs */}
        {!search && (
          <div className="flex shrink-0 gap-1 border-b border-gray-200 px-5 py-2 dark:border-slate-700">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                {TAB_LABELS[tab] ?? tab}
              </button>
            ))}
          </div>
        )}

        {/* Metric list header */}
        <div className="shrink-0 px-5 pt-2 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {search ? 'Search Results' : 'Metric Name'}
          </span>
        </div>

        {/* Metric list */}
        <div className="flex-1 overflow-y-auto px-3">
          {filteredMetrics.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400">No metrics found</div>
          ) : (
            filteredMetrics.map((metric) => {
              const isSelected = selectedMetrics.includes(metric.key);
              return (
                <button
                  key={metric.key}
                  onClick={() => toggleMetric(metric.key)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500 text-white'
                        : 'border-gray-300 dark:border-slate-600'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                  <div className="flex-1">
                    <span className="text-sm text-gray-800 dark:text-gray-200">
                      {metric.label}
                    </span>
                    {search && (
                      <span className="ml-2 text-[10px] text-gray-400">
                        {TAB_LABELS[metric.tab]}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {metric.unit === 'cr' ? '₹ Cr' : metric.unit === 'pct' ? '%' : metric.unit}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-gray-200 px-5 py-3 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Period:</span>
            <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
              {(['quarterly', 'annual'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    period === p
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-600 dark:text-white'
                      : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                  }`}
                >
                  {p === 'quarterly' ? 'Quarterly' : 'Annual'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {selectedMetrics.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-red-500 hover:text-red-600 dark:text-red-400"
              >
                Clear all ({selectedMetrics.length})
              </button>
            )}
            <button
              onClick={() => setPickerOpen(false)}
              className="rounded-lg bg-blue-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-600 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
