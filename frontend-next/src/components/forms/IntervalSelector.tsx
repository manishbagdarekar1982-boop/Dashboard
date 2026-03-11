"use client";

import type { Interval, QuickRange } from '@/types/ohlc';
import { useStockStore } from '@/store/stockStore';

const INTERVALS: { value: Interval; label: string }[] = [
  { value: 'daily',   label: '1D' },
  { value: 'weekly',  label: '1W' },
  { value: 'monthly', label: '1M' },
];

const QUICK_RANGES: QuickRange[] = ['1M', '3M', '6M', 'YTD', '1Y', '2Y', '5Y', 'MAX'];

export function IntervalSelector() {
  const { interval, quickRange, setInterval, setQuickRange } = useStockStore();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
        {INTERVALS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setInterval(opt.value)}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              interval === opt.value
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {QUICK_RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setQuickRange(r)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              quickRange === r
                ? 'bg-gray-200 text-gray-900 dark:bg-slate-600 dark:text-white'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-white'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
