import client from './client';
import type { OHLCResponse, StandardResponse, Interval } from '@/types/ohlc';

export interface OHLCParams {
  symbol: string;
  start_date?: string;
  end_date?: string;
  interval?: Interval;
}

export async function fetchOHLC(params: OHLCParams): Promise<OHLCResponse> {
  const { symbol, ...query } = params;
  const res = await client.get<StandardResponse<OHLCResponse>>(
    `/api/v1/ohlc/${encodeURIComponent(symbol)}`,
    { params: query },
  );
  if (!res.data.success || !res.data.data) {
    throw new Error(res.data.errors ?? 'Failed to fetch OHLC data');
  }
  return res.data.data;
}

export async function fetchLatest(symbol: string) {
  const res = await client.get(`/api/v1/ohlc/${encodeURIComponent(symbol)}/latest`);
  return res.data.data;
}
