export interface ScannerRow {
  company_name: string;
  industry: string | null;
  market_cap: number | null;
  q3_ago: number | null;
  q2_ago: number | null;
  q1_ago: number | null;
  current_qtr: number | null;
  change_3q: number | null;
}

export interface ScannerResponse {
  metric: string;
  metric_label: string;
  title: string;
  subtitle: string;
  periods: string[];
  period_type: string;
  rows: ScannerRow[];
}
