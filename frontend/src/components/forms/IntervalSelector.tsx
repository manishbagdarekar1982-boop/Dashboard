import type { Interval, QuickRange } from '../../types/ohlc';
import { useStockStore } from '../../store/stockStore';

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
      {/* Interval buttons */}
      <div className="flex rounded-lg border border-slate-700 bg-slate-800 p-0.5">
        {INTERVALS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setInterval(opt.value)}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              interval === opt.value
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Quick range buttons */}
      <div className="flex flex-wrap gap-1">
        {QUICK_RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setQuickRange(r)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              quickRange === r
                ? 'bg-slate-600 text-white'
                : 'text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}
