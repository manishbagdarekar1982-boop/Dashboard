import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChartType, Interval, QuickRange } from '@/types/ohlc';
import { format, subMonths, subYears, startOfYear } from 'date-fns';

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd');
}

function rangeStart(range: QuickRange): string {
  const today = new Date();
  switch (range) {
    case '1M':  return format(subMonths(today, 1), 'yyyy-MM-dd');
    case '3M':  return format(subMonths(today, 3), 'yyyy-MM-dd');
    case '6M':  return format(subMonths(today, 6), 'yyyy-MM-dd');
    case 'YTD': return format(startOfYear(today), 'yyyy-MM-dd');
    case '1Y':  return format(subYears(today, 1), 'yyyy-MM-dd');
    case '2Y':  return format(subYears(today, 2), 'yyyy-MM-dd');
    case '5Y':  return format(subYears(today, 5), 'yyyy-MM-dd');
    case 'MAX': return '1988-01-01';
    default:    return format(subMonths(today, 6), 'yyyy-MM-dd');
  }
}

interface StockState {
  selectedSymbol: string;
  interval: Interval;
  quickRange: QuickRange;
  startDate: string;
  endDate: string;
  recentSymbols: string[];
  chartType: ChartType;

  setSymbol: (symbol: string) => void;
  setInterval: (interval: Interval) => void;
  setQuickRange: (range: QuickRange) => void;
  setCustomDateRange: (start: string, end: string) => void;
  setChartType: (chartType: ChartType) => void;
}

export const useStockStore = create<StockState>()(
  persist(
    (set) => ({
      selectedSymbol: 'NIFTY 50',
      interval: 'daily',
      quickRange: '6M',
      startDate: rangeStart('6M'),
      endDate: todayStr(),
      recentSymbols: [],
      chartType: 'candlestick',

      setSymbol: (symbol) =>
        set((s) => ({
          selectedSymbol: symbol,
          recentSymbols: [symbol, ...s.recentSymbols.filter((x) => x !== symbol)].slice(0, 8),
        })),

      setInterval: (interval) => set({ interval }),

      setQuickRange: (range) =>
        set({ quickRange: range, startDate: rangeStart(range), endDate: todayStr() }),

      setCustomDateRange: (start, end) =>
        set({ quickRange: '6M', startDate: start, endDate: end }),

      setChartType: (chartType) => set({ chartType }),
    }),
    { name: 'stockask-stock-state' },
  ),
);
