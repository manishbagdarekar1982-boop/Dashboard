import { useQuery } from '@tanstack/react-query';
import client from './client';
import type { UniverseResponse } from '@/types/universe';

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

const STALE_TIME = 24 * 60 * 60 * 1000; // 24 hours

export async function fetchUniverse(): Promise<UniverseResponse> {
  const res = await client.get<StandardResponse<UniverseResponse>>(
    '/api/v1/universe',
  );
  return unwrap(res);
}

export function useUniverse() {
  return useQuery({
    queryKey: ['universe'],
    queryFn: fetchUniverse,
    staleTime: STALE_TIME,
    gcTime: STALE_TIME,
    retry: 3,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10000),
  });
}
