import { useQuery } from '@tanstack/react-query';
import { fetchAllSymbols } from '@/api/companies';

/** Fetches all ~6,811 symbol names once and caches them for 24 hours. */
export function useAllSymbols() {
  return useQuery({
    queryKey: ['all-symbols'],
    queryFn: fetchAllSymbols,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    gcTime:    24 * 60 * 60 * 1000,
  });
}
