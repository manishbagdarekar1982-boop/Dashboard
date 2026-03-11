import { useQuery } from '@tanstack/react-query';
import { fetchOHLC } from '@/api/ohlc';
import { useStockStore } from '@/store/stockStore';

export function useOHLC() {
  const selectedSymbol = useStockStore((s) => s.selectedSymbol);
  const interval = useStockStore((s) => s.interval);
  const startDate = useStockStore((s) => s.startDate);
  const endDate = useStockStore((s) => s.endDate);

  return useQuery({
    queryKey: ['ohlc', selectedSymbol, interval, startDate, endDate],
    queryFn: () =>
      fetchOHLC({ symbol: selectedSymbol, interval, start_date: startDate, end_date: endDate }),
    staleTime: 5 * 60 * 1000,   // 5 minutes
    retry: 1,
    enabled: Boolean(selectedSymbol),
  });
}
