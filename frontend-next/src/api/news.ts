import { useQuery } from '@tanstack/react-query';
import client from './client';
import type {
  NewsResponse,
  NewsCategoriesResponse,
  NewsStatsResponse,
  NewspaperListResponse,
} from '@/types/news';

const STALE_2MIN = 2 * 60 * 1000;
const STALE_1HR = 60 * 60 * 1000;

// --- News Articles ---

interface NewsParams {
  skip?: number;
  limit?: number;
  category?: string;
  symbol?: string;
}

async function fetchNews(params: NewsParams = {}): Promise<NewsResponse> {
  const res = await client.get<NewsResponse>('/api/v1/news', { params });
  return res.data;
}

export function useNews(params: NewsParams = {}) {
  return useQuery({
    queryKey: ['news', params.skip, params.limit, params.category, params.symbol],
    queryFn: () => fetchNews(params),
    staleTime: STALE_2MIN,
    gcTime: STALE_2MIN * 2,
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10000),
  });
}

// --- Categories ---

async function fetchCategories(): Promise<string[]> {
  const res = await client.get<NewsCategoriesResponse>('/api/v1/news/categories');
  return res.data.categories;
}

export function useNewsCategories() {
  return useQuery({
    queryKey: ['news-categories'],
    queryFn: fetchCategories,
    staleTime: STALE_1HR,
    gcTime: STALE_1HR * 2,
  });
}

// --- Stats ---

async function fetchNewsStats(): Promise<NewsStatsResponse> {
  const res = await client.get<NewsStatsResponse>('/api/v1/news/stats');
  return res.data;
}

export function useNewsStats() {
  return useQuery({
    queryKey: ['news-stats'],
    queryFn: fetchNewsStats,
    staleTime: STALE_2MIN,
  });
}

// --- Newspaper PDFs ---

async function fetchNewspaperList(): Promise<NewspaperListResponse> {
  const res = await client.get<NewspaperListResponse>('/api/v1/news/newspapers');
  return res.data;
}

export function useNewspaperList() {
  return useQuery({
    queryKey: ['newspaper-list'],
    queryFn: fetchNewspaperList,
    staleTime: STALE_1HR,
    gcTime: STALE_1HR * 2,
  });
}

export function getNewspaperUrl(filename: string): string {
  // Serve PDFs directly from backend to avoid Next.js proxy size/timeout limits for large files (up to 80MB)
  return `http://localhost:8000/api/v1/news/newspapers/file?filename=${encodeURIComponent(filename)}`;
}
