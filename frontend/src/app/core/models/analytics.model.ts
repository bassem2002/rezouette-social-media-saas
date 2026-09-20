/// Réponses de l'API Analytics (GET /analytics/*).
export interface AnalyticsOverview {
  total: number;
  published: number;
  failed: number;
  pending: number;
  scheduled: number;
  cancelled: number;
  successRate: number;
}

export interface PlatformShare {
  platform: 'FACEBOOK' | 'INSTAGRAM';
  count: number;
  percentage: number;
}
export interface AnalyticsPlatforms {
  total: number;
  platforms: PlatformShare[];
}

export interface ErrorShare {
  reason: string;
  count: number;
  percentage: number;
}
export interface AnalyticsErrors {
  total: number;
  errors: ErrorShare[];
}

export interface DailyPoint {
  date: string;
  count: number;
}
export interface AnalyticsDaily {
  days: number;
  series: DailyPoint[];
}

export interface AnalyticsScheduled {
  total: number;
  scheduled: number;
  processing: number;
  published: number;
  failed: number;
  cancelled: number;
}
