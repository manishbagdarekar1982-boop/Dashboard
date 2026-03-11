import client from './client';
import type { StandardResponse } from '@/types/ohlc';
import type {
  ChartsResponse,
  TablesResponse,
  ScreenersResponse,
  IndexReturnsResponse,
  ShareholdingMoversResponse,
} from '@/types/marketBreadth';

export async function fetchMBCharts(): Promise<ChartsResponse> {
  const { data } = await client.get<StandardResponse<ChartsResponse>>('/api/v1/market-breadth/charts');
  return data.data!;
}

export async function fetchMBTables(): Promise<TablesResponse> {
  const { data } = await client.get<StandardResponse<TablesResponse>>('/api/v1/market-breadth/tables');
  return data.data!;
}

export async function fetchMBScreeners(): Promise<ScreenersResponse> {
  const { data } = await client.get<StandardResponse<ScreenersResponse>>('/api/v1/market-breadth/screeners');
  return data.data!;
}

export async function fetchMBIndex(): Promise<IndexReturnsResponse> {
  const { data } = await client.get<StandardResponse<IndexReturnsResponse>>('/api/v1/market-breadth/index-analysis');
  return data.data!;
}

export async function fetchMBShareholding(): Promise<ShareholdingMoversResponse> {
  const { data } = await client.get<StandardResponse<ShareholdingMoversResponse>>('/api/v1/market-breadth/shareholding');
  return data.data!;
}
