import { useQuery } from '@tanstack/react-query';
import { fetchMarketCapTrend } from '@/api/companies';

export function useMarketCapTrend(options: {
  startDate?: string;
  endDate?: string;
  interval?: 'daily' | 'weekly' | 'monthly';
} = {}) {
  return useQuery({
    queryKey: ['market-cap-trend', options.startDate, options.endDate, options.interval],
    queryFn: () => fetchMarketCapTrend({
      start_date: options.startDate,
      end_date: options.endDate,
      interval: options.interval ?? 'weekly',
    }),
    staleTime: 60 * 60 * 1000,
  });
}
