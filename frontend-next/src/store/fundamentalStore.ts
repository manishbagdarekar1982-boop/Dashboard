'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FundamentalState {
  selectedMetrics: string[];
  period: 'quarterly' | 'annual';
  pickerOpen: boolean;
  addMetric: (key: string) => void;
  removeMetric: (key: string) => void;
  toggleMetric: (key: string) => void;
  setPeriod: (p: 'quarterly' | 'annual') => void;
  setPickerOpen: (open: boolean) => void;
  clearAll: () => void;
}

export const useFundamentalStore = create<FundamentalState>()(
  persist(
    (set) => ({
      selectedMetrics: [],
      period: 'quarterly',
      pickerOpen: false,
      addMetric: (key) =>
        set((s) => ({
          selectedMetrics: s.selectedMetrics.includes(key)
            ? s.selectedMetrics
            : [...s.selectedMetrics, key],
        })),
      removeMetric: (key) =>
        set((s) => ({
          selectedMetrics: s.selectedMetrics.filter((m) => m !== key),
        })),
      toggleMetric: (key) =>
        set((s) => ({
          selectedMetrics: s.selectedMetrics.includes(key)
            ? s.selectedMetrics.filter((m) => m !== key)
            : [...s.selectedMetrics, key],
        })),
      setPeriod: (period) => set({ period }),
      setPickerOpen: (pickerOpen) => set({ pickerOpen }),
      clearAll: () => set({ selectedMetrics: [] }),
    }),
    {
      name: 'stockask-fundamental-metrics',
      partialize: (s) => ({
        selectedMetrics: s.selectedMetrics,
        period: s.period,
      }),
    },
  ),
);
