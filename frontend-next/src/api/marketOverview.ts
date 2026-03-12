import { useQuery } from '@tanstack/react-query';
import client from './client';
import type { MarketOverviewResponse } from '@/types/marketOverview';
import type { MarketOverviewTrendsResponse } from '@/types/marketOverviewTrends';
import type { SplitTrendResponse } from '@/types/marketOverviewSplitTrends';
import type { ScannerResponse } from '@/types/marketOverviewScanner';

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  errors: string | null;
}

const STALE_TIME = 6 * 60 * 60 * 1000; // 6 hours

export async function fetchMarketOverview(): Promise<MarketOverviewResponse> {
  const res = await client.get<ApiResponse<MarketOverviewResponse>>('/api/v1/market-overview');
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to fetch market overview data');
  }
  return res.data.data;
}

export function useMarketOverview() {
  return useQuery({
    queryKey: ['market-overview'],
    queryFn: fetchMarketOverview,
    staleTime: STALE_TIME,
    gcTime: STALE_TIME,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}

export async function fetchMarketOverviewTrends(): Promise<MarketOverviewTrendsResponse> {
  const res = await client.get<ApiResponse<MarketOverviewTrendsResponse>>('/api/v1/market-overview/trends');
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to fetch market overview trends');
  }
  return res.data.data;
}

export function useMarketOverviewTrends() {
  return useQuery({
    queryKey: ['market-overview-trends'],
    queryFn: fetchMarketOverviewTrends,
    staleTime: STALE_TIME,
    gcTime: STALE_TIME,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}

export async function fetchSplitTrends(
  metric: string,
  splitBy: string,
): Promise<SplitTrendResponse> {
  const res = await client.get<ApiResponse<SplitTrendResponse>>(
    '/api/v1/market-overview/trends/split',
    { params: { metric, split_by: splitBy } },
  );
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to fetch split trend data');
  }
  return res.data.data;
}

export function useSplitTrends(metric: string, splitBy: string) {
  return useQuery({
    queryKey: ['market-overview-split-trends', metric, splitBy],
    queryFn: () => fetchSplitTrends(metric, splitBy),
    staleTime: STALE_TIME,
    gcTime: STALE_TIME,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}

export async function fetchScannerData(metric: string): Promise<ScannerResponse> {
  const res = await client.get<ApiResponse<ScannerResponse>>(
    '/api/v1/market-overview/scanner',
    { params: { metric } },
  );
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to fetch scanner data');
  }
  return res.data.data;
}

export function useScanner(metric: string) {
  return useQuery({
    queryKey: ['market-overview-scanner', metric],
    queryFn: () => fetchScannerData(metric),
    staleTime: STALE_TIME,
    gcTime: STALE_TIME,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}

// ── Multi-Period Returns ──

export interface SymbolReturn {
  symbol: string;
  price: number;
  mcap: number | null;
  mcap_type: string | null;
  exchange: string | null;
  isin: string | null;
  sector: string | null;
  industry: string | null;
  '1d': number;
  '1w': number;
  '1m': number;
  '3m': number;
  '6m': number;
  '1y': number;
  '2y': number;
  '3y': number;
  '5y': number;
  '10y': number;
}

export async function fetchReturns(): Promise<SymbolReturn[]> {
  const res = await client.get<ApiResponse<SymbolReturn[]>>('/api/v1/market-overview/returns');
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to fetch returns data');
  }
  return res.data.data;
}

export function useReturns() {
  return useQuery({
    queryKey: ['market-overview-returns'],
    queryFn: fetchReturns,
    staleTime: STALE_TIME,
    gcTime: STALE_TIME,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}

// ── Yearly Returns ──

export interface YearlyReturnEntry {
  symbol: string;
  sector: string | null;
  industry: string | null;
  mcap_type: string | null;
  [year: string]: number | string | null;
}

export interface YearlyReturnsResponse {
  columns: string[];
  data: YearlyReturnEntry[];
}

export async function fetchYearlyReturns(): Promise<YearlyReturnsResponse> {
  const res = await client.get<ApiResponse<YearlyReturnsResponse>>(
    '/api/v1/market-overview/yearly-returns',
  );
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to fetch yearly returns');
  }
  return res.data.data;
}

export function useYearlyReturns() {
  return useQuery({
    queryKey: ['market-overview-yearly-returns'],
    queryFn: fetchYearlyReturns,
    staleTime: STALE_TIME,
    gcTime: STALE_TIME,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });
}
