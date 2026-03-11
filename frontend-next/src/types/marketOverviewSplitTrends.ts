export interface SplitTrendPoint {
  period: string;
  value: number | null;
}

export interface SplitTrendSeries {
  label: string;
  data: SplitTrendPoint[];
}

export interface SplitTrendResponse {
  metric: string;
  metric_label: string;
  split_by: string;
  split_by_label: string;
  title: string;
  subtitle: string;
  splits: SplitTrendSeries[];
}

export interface SplitTrendOption {
  value: string;
  label: string;
}

export interface SplitTrendOptionsResponse {
  metrics: SplitTrendOption[];
  split_by: SplitTrendOption[];
}
