export interface NewsCompany {
  company_name: string;
  nse_symbol: string;
  bse_code: string;
}

export interface NewsArticle {
  guid: string;
  title: string;
  description: string;
  categories: string[];
  published_at: string;
  has_enclosure: boolean;
  custom_name: string;
  notification: boolean;
  companies: NewsCompany[];
  fetched_at: string;
}

export interface NewsResponse {
  total: number;
  skip: number;
  limit: number;
  articles: NewsArticle[];
}

export interface NewsCategoriesResponse {
  categories: string[];
}

export interface NewsStatsResponse {
  total_articles: number;
  latest: string | null;
  oldest: string | null;
  categories: string[];
}

export interface NewspaperFile {
  code: string;
  name: string;
  filename: string;
  size_mb: number;
}

export interface NewspaperListResponse {
  dates: string[];
  papers: Record<string, NewspaperFile[]>;
}
