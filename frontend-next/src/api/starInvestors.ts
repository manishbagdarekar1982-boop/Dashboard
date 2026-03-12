import { useQuery } from '@tanstack/react-query';
import client from './client';
import type {
  TopInvestorItem,
  InvestorSearchResult,
  InvestorDetailResponse,
  InvestorKeyChangesResponse,
  InvestorGainersLosersResponse,
} from '@/types/starInvestor';

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  errors: string | null;
}

const STALE_6H = 6 * 60 * 60 * 1000;
const STALE_5M = 5 * 60 * 1000;

// ── Top investors ──

export async function fetchTopInvestors(limit = 50): Promise<TopInvestorItem[]> {
  const res = await client.get<ApiResponse<TopInvestorItem[]>>(
    '/api/v1/star-investors/top',
    { params: { limit } },
  );
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to fetch top investors');
  }
  return res.data.data;
}

export function useTopInvestors(limit = 50) {
  return useQuery({
    queryKey: ['star-investors-top', limit],
    queryFn: () => fetchTopInvestors(limit),
    staleTime: STALE_6H,
    gcTime: STALE_6H,
    retry: 2,
  });
}

// ── Search ──

export async function fetchInvestorSearch(
  query: string,
  limit = 20,
): Promise<InvestorSearchResult[]> {
  const res = await client.get<ApiResponse<InvestorSearchResult[]>>(
    '/api/v1/star-investors/search',
    { params: { q: query, limit } },
  );
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to search investors');
  }
  return res.data.data;
}

export function useInvestorSearch(query: string, limit = 20) {
  return useQuery({
    queryKey: ['star-investors-search', query, limit],
    queryFn: () => fetchInvestorSearch(query, limit),
    staleTime: STALE_5M,
    enabled: query.length >= 2,
    retry: 1,
  });
}

// ── Holdings ──

export async function fetchInvestorHoldings(
  name: string,
  period: string,
): Promise<InvestorDetailResponse> {
  const res = await client.get<ApiResponse<InvestorDetailResponse>>(
    `/api/v1/star-investors/${encodeURIComponent(name)}/holdings`,
    { params: { period } },
  );
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to fetch investor holdings');
  }
  return res.data.data;
}

export function useInvestorHoldings(name: string | null, period: string) {
  return useQuery({
    queryKey: ['star-investors-holdings', name, period],
    queryFn: () => fetchInvestorHoldings(name!, period),
    staleTime: STALE_5M,
    enabled: !!name,
    retry: 2,
  });
}

// ── Key changes ──

export async function fetchInvestorKeyChanges(
  name: string,
  period: string,
): Promise<InvestorKeyChangesResponse> {
  const res = await client.get<ApiResponse<InvestorKeyChangesResponse>>(
    `/api/v1/star-investors/${encodeURIComponent(name)}/key-changes`,
    { params: { period } },
  );
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to fetch key changes');
  }
  return res.data.data;
}

export function useInvestorKeyChanges(name: string | null, period: string) {
  return useQuery({
    queryKey: ['star-investors-key-changes', name, period],
    queryFn: () => fetchInvestorKeyChanges(name!, period),
    staleTime: STALE_5M,
    enabled: !!name,
    retry: 2,
  });
}

// ── Gainers / Losers ──

export async function fetchInvestorGainersLosers(
  name: string,
  period: string,
): Promise<InvestorGainersLosersResponse> {
  const res = await client.get<ApiResponse<InvestorGainersLosersResponse>>(
    `/api/v1/star-investors/${encodeURIComponent(name)}/gainers-losers`,
    { params: { period } },
  );
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to fetch gainers/losers');
  }
  return res.data.data;
}

export function useInvestorGainersLosers(name: string | null, period: string) {
  return useQuery({
    queryKey: ['star-investors-gainers-losers', name, period],
    queryFn: () => fetchInvestorGainersLosers(name!, period),
    staleTime: STALE_5M,
    enabled: !!name,
    retry: 2,
  });
}
