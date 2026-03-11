'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchFundamentalCatalog, fetchFundamentalTimeseries } from '@/api/fundamentals';
import { useStockStore } from '@/store/stockStore';
import { useFundamentalStore } from '@/store/fundamentalStore';

export function useFundamentalCatalog() {
  return useQuery({
    queryKey: ['fundamental-catalog'],
    queryFn: fetchFundamentalCatalog,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours — catalog is static
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useFundamentalTimeseries() {
  const symbol = useStockStore((s) => s.selectedSymbol);
  const selectedMetrics = useFundamentalStore((s) => s.selectedMetrics);
  const period = useFundamentalStore((s) => s.period);

  return useQuery({
    queryKey: ['fundamental-timeseries', symbol, selectedMetrics, period],
    queryFn: () => fetchFundamentalTimeseries(symbol, selectedMetrics, period),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000,
    enabled: Boolean(symbol) && selectedMetrics.length > 0,
    retry: 1,
  });
}
