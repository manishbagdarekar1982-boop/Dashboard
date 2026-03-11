import { useQuery } from '@tanstack/react-query';
import {
  fetchMBCharts,
  fetchMBTables,
  fetchMBScreeners,
  fetchMBIndex,
  fetchMBShareholding,
} from '@/api/marketBreadth';

const STALE = 6 * 60 * 60 * 1000; // 6 hours

export function useMBCharts() {
  return useQuery({
    queryKey: ['mb-charts'],
    queryFn: fetchMBCharts,
    staleTime: STALE,
  });
}

export function useMBTables() {
  return useQuery({
    queryKey: ['mb-tables'],
    queryFn: fetchMBTables,
    staleTime: STALE,
  });
}

export function useMBScreeners() {
  return useQuery({
    queryKey: ['mb-screeners'],
    queryFn: fetchMBScreeners,
    staleTime: STALE,
  });
}

export function useMBIndex() {
  return useQuery({
    queryKey: ['mb-index'],
    queryFn: fetchMBIndex,
    staleTime: STALE,
  });
}

export function useMBShareholding() {
  return useQuery({
    queryKey: ['mb-shareholding'],
    queryFn: fetchMBShareholding,
    staleTime: STALE,
  });
}
