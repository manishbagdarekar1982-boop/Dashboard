import { useQuery } from '@tanstack/react-query';
import client from './client';
import type { ShareholdingResponse, IndustryTrendResponse, AllSectorsSummaryResponse, SectorAnalyticsResponse } from '@/types/shareholding';

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  errors: string | null;
}

export async function fetchShareholding(symbol: string): Promise<ShareholdingResponse> {
  const res = await client.get<ApiResponse<ShareholdingResponse>>(`/api/v1/shareholding/${encodeURIComponent(symbol)}`);
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to fetch shareholding data');
  }
  return res.data.data;
}

export function useShareholding(symbol: string | null) {
  return useQuery({
    queryKey: ['shareholding', symbol],
    queryFn: () => fetchShareholding(symbol!),
    enabled: !!symbol,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

// --- Sectors list ---

export async function fetchSectors(): Promise<string[]> {
  const res = await client.get<ApiResponse<{ sectors: string[] }>>('/api/v1/shareholding/sectors');
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to fetch sectors');
  }
  return res.data.data.sectors;
}

export function useSectors() {
  return useQuery({
    queryKey: ['sectors'],
    queryFn: fetchSectors,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
  });
}

// --- Industry trend ---

export async function fetchIndustryTrend(sector: string): Promise<IndustryTrendResponse> {
  const res = await client.get<ApiResponse<IndustryTrendResponse>>('/api/v1/shareholding/industry-trend', {
    params: { sector },
  });
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to fetch industry trend');
  }
  return res.data.data;
}

export function useIndustryTrend(sector: string | null) {
  return useQuery({
    queryKey: ['industry-trend', sector],
    queryFn: () => fetchIndustryTrend(sector!),
    enabled: !!sector,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

// --- All-sectors summary ---

export async function fetchAllSectorsSummary(): Promise<AllSectorsSummaryResponse> {
  const res = await client.get<ApiResponse<AllSectorsSummaryResponse>>('/api/v1/shareholding/all-sectors-summary');
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to fetch all sectors summary');
  }
  return res.data.data;
}

export function useAllSectorsSummary() {
  return useQuery({
    queryKey: ['all-sectors-summary'],
    queryFn: fetchAllSectorsSummary,
    staleTime: 6 * 60 * 60 * 1000, // 6 hours
  });
}

// --- Sector analytics (cross-database decomposition) ---

export async function fetchSectorAnalytics(sector: string, quarters: number = 8): Promise<SectorAnalyticsResponse> {
  const res = await client.get<ApiResponse<SectorAnalyticsResponse>>('/api/v1/shareholding/sector-analytics', {
    params: { sector, quarters },
  });
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to fetch sector analytics');
  }
  return res.data.data;
}

export function useSectorAnalytics(sector: string | null, quarters: number = 8) {
  return useQuery({
    queryKey: ['sector-analytics', sector, quarters],
    queryFn: () => fetchSectorAnalytics(sector!, quarters),
    enabled: !!sector,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
