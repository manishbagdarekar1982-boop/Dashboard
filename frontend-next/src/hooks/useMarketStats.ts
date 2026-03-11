import { useQuery } from '@tanstack/react-query';
import { fetchMarketStats } from '@/api/companies';

export function useMarketStats() {
  return useQuery({
    queryKey: ['market-stats'],
    queryFn: fetchMarketStats,
    staleTime: 60 * 60 * 1000, // 1 hour — market stats don't change often
  });
}
