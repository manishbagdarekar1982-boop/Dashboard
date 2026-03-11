import client from './client';
import type { StandardResponse } from '@/types/ohlc';
import type {
  FundamentalCatalogResponse,
  FundamentalTimeseriesResponse,
} from '@/types/fundamentals';

export async function fetchFundamentalCatalog(): Promise<FundamentalCatalogResponse> {
  const { data } = await client.get<StandardResponse<FundamentalCatalogResponse>>(
    '/api/v1/fundamentals/catalog',
  );
  if (!data.success || !data.data) throw new Error(data.errors ?? 'Failed to load catalog');
  return data.data;
}

export async function fetchFundamentalTimeseries(
  symbol: string,
  metrics: string[],
  period: string = 'quarterly',
): Promise<FundamentalTimeseriesResponse> {
  const { data } = await client.get<StandardResponse<FundamentalTimeseriesResponse>>(
    `/api/v1/fundamentals/${encodeURIComponent(symbol)}/timeseries`,
    { params: { metrics: metrics.join(','), period } },
  );
  if (!data.success || !data.data) throw new Error(data.errors ?? 'Failed to load timeseries');
  return data.data;
}
