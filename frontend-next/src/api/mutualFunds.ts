import client from './client';
import type {
  MFHoldingsResponse,
  MFBuySellResponse,
  MFInsightsResponse,
  MFAssetAllocationResponse,
  MFFiltersResponse,
} from '@/types/mutualFund';

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

export async function fetchMFMonths(): Promise<string[]> {
  const res = await client.get<StandardResponse<string[]>>('/api/v1/mutual-funds/months');
  return unwrap(res);
}

export async function fetchMFHoldings(month: string): Promise<MFHoldingsResponse> {
  const res = await client.get<StandardResponse<MFHoldingsResponse>>(
    '/api/v1/mutual-funds/holdings',
    { params: { month } },
  );
  return unwrap(res);
}

export async function fetchMFBuySell(
  startDate?: string,
  endDate?: string,
): Promise<MFBuySellResponse> {
  const res = await client.get<StandardResponse<MFBuySellResponse>>(
    '/api/v1/mutual-funds/buy-sell',
    { params: { start_date: startDate, end_date: endDate } },
  );
  return unwrap(res);
}

export async function fetchMFInsights(month: string): Promise<MFInsightsResponse> {
  const res = await client.get<StandardResponse<MFInsightsResponse>>(
    '/api/v1/mutual-funds/insights',
    { params: { month } },
  );
  return unwrap(res);
}

export async function fetchMFAssetAllocation(month: string): Promise<MFAssetAllocationResponse> {
  const res = await client.get<StandardResponse<MFAssetAllocationResponse>>(
    '/api/v1/mutual-funds/asset-allocation',
    { params: { month } },
  );
  return unwrap(res);
}

export async function fetchMFFilters(month: string): Promise<MFFiltersResponse> {
  const res = await client.get<StandardResponse<MFFiltersResponse>>(
    '/api/v1/mutual-funds/filters',
    { params: { month } },
  );
  return unwrap(res);
}
