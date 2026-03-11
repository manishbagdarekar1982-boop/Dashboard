export interface UniverseCompany {
  co_code: number | null;
  company_short_name: string | null;
  company_name: string | null;
  bse_code: number | null;
  isin: string | null;
  bse_group: string | null;
  mcaptype: string | null;
  bse_listed_flag: string | null;
  nse_listed_flag: string | null;
  mcap: number | null;
  sector_code: number | null;
  sector_name: string | null;
  industry_code: number | null;
  industry_name: string | null;
  nse_symbol: string | null;
  bse_symbol: string | null;
  bse_status: string | null;
  nse_status: string | null;
  ace_sector: string | null;
  ace_industry: string | null;
}

export interface UniverseMeta {
  total: number;
  columns: string[];
  sectors: string[];
  industries: string[];
  mcap_counts: Record<string, number>;
}

export interface UniverseResponse {
  companies: UniverseCompany[];
  meta: UniverseMeta;
}
