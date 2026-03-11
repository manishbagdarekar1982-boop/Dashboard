import { useQuery } from '@tanstack/react-query';
import {
  fetchMFMonths,
  fetchMFHoldings,
  fetchMFBuySell,
  fetchMFInsights,
  fetchMFAssetAllocation,
  fetchMFFilters,
} from '@/api/mutualFunds';

export function useMFMonths() {
  return useQuery({
    queryKey: ['mf-months'],
    queryFn: fetchMFMonths,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

export function useMFHoldings(month: string) {
  return useQuery({
    queryKey: ['mf-holdings', month],
    queryFn: () => fetchMFHoldings(month),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(month),
  });
}

export function useMFBuySell(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['mf-buy-sell', startDate, endDate],
    queryFn: () => fetchMFBuySell(startDate, endDate),
    staleTime: 10 * 60 * 1000,
  });
}

export function useMFInsights(month: string) {
  return useQuery({
    queryKey: ['mf-insights', month],
    queryFn: () => fetchMFInsights(month),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(month),
  });
}

export function useMFAssetAllocation(month: string) {
  return useQuery({
    queryKey: ['mf-asset-allocation', month],
    queryFn: () => fetchMFAssetAllocation(month),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(month),
  });
}

export function useMFFilters(month: string) {
  return useQuery({
    queryKey: ['mf-filters', month],
    queryFn: () => fetchMFFilters(month),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(month),
  });
}
