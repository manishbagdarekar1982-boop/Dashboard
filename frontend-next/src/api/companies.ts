import client from './client';
import type { CompanyListResponse, CompanySymbol, MarketStatsResponse, MarketCapTrendResponse } from '@/types/company';
import type { StandardResponse } from '@/types/ohlc';

export async function fetchCompanies(page = 1, page_size = 100): Promise<CompanyListResponse> {
  const res = await client.get<StandardResponse<CompanyListResponse>>('/api/v1/companies', {
    params: { page, page_size },
  });
  return res.data.data!;
}

export async function searchCompanies(q: string, limit = 10): Promise<CompanySymbol[]> {
  if (!q.trim()) return [];
  const res = await client.get<StandardResponse<CompanyListResponse>>('/api/v1/companies/search', {
    params: { q, limit },
  });
  return res.data.data?.companies ?? [];
}

export async function fetchAllSymbols(): Promise<string[]> {
  const res = await client.get<{ symbols: string[]; total: number }>('/api/v1/companies/symbols');
  return res.data.symbols;
}

export async function fetchMarketStats(): Promise<MarketStatsResponse> {
  const res = await client.get<MarketStatsResponse>('/api/v1/companies/market-stats');
  return res.data;
}

export async function fetchMarketCapTrend(params?: {
  start_date?: string;
  end_date?: string;
  interval?: 'daily' | 'weekly' | 'monthly';
}): Promise<MarketCapTrendResponse> {
  const res = await client.get<MarketCapTrendResponse>('/api/v1/companies/market-cap-trend', {
    params,
  });
  return res.data;
}
