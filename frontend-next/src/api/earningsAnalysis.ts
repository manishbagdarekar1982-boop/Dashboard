import { useQuery } from '@tanstack/react-query';
import client from './client';
import type { EarningsAnalysisResponse } from '@/types/earnings';

interface StandardResponse<T> {
  success: boolean;
  data: T | null;
  errors?: string | null;
}

function unwrap<T>(res: { data: StandardResponse<T> }): T {
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Request failed');
  }
  return res.data.data;
}

const STALE_TIME = 6 * 60 * 60 * 1000;

export async function fetchEarningsAnalysis(): Promise<EarningsAnalysisResponse> {
  const res = await client.get<StandardResponse<EarningsAnalysisResponse>>(
    '/api/v1/earnings',
  );
  return unwrap(res);
}

export function useEarningsAnalysis() {
  return useQuery({
    queryKey: ['earnings-analysis'],
    queryFn: fetchEarningsAnalysis,
    staleTime: STALE_TIME,
    gcTime: STALE_TIME,
    retry: 3,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10000),
  });
}
