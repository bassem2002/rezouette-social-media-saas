/// Réponse de GET /analytics/dashboard — miroir EXACT de `DashboardResponseDto`
/// côté NestJS. Toutes ces valeurs sont calculées à partir des données locales
/// de l'application (historique, planifications, comptes connectés) : aucune ne
/// provient d'un appel aux API des réseaux sociaux.

/// Fenêtres acceptées par le backend (liste fermée, validée côté serveur).
export type DashboardRange = '7d' | '30d' | '90d';

export const DASHBOARD_RANGES: readonly DashboardRange[] = ['7d', '30d', '90d'];

/// Plateformes publiables. Valeurs DB en majuscules, telles que renvoyées par
/// l'API — la conversion en libellé lisible vit dans la couche présentation.
export type DashboardPlatform =
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'TIKTOK'
  | 'LINKEDIN'
  | 'YOUTUBE';

export type DashboardPostStatus = 'PUBLISHED' | 'FAILED' | 'PENDING';

export interface DashboardSummary {
  totalPosts: number;
  published: number;
  failed: number;
  pending: number;
  scheduled: number;
  connectedAccounts: number;
  reconnectRequired: number;
  successRate: number;
}

export interface DashboardDailyMetric {
  /// Jour local, format YYYY-MM-DD.
  date: string;
  total: number;
  published: number;
  failed: number;
  pending: number;
}

export interface DashboardPlatformMetric {
  platform: string;
  total: number;
  published: number;
  failed: number;
  pending: number;
  successRate: number;
}

export interface DashboardStatusMetric {
  status: string;
  count: number;
}

export interface DashboardAccountHealth {
  platform: string;
  total: number;
  connected: number;
  reconnectRequired: number;
  expired: number;
  error: number;
  revoked: number;
}

/// Ligne d'activité récente. `accountName` et `excerpt` sont NULLABLES : le
/// compte peut ne plus être résolvable et une publication peut n'avoir aucun
/// texte. Les rendre obligatoires obligerait à inventer une valeur.
export interface DashboardRecentActivity {
  id: string;
  platform: string;
  status: string;
  accountName: string | null;
  excerpt: string | null;
  createdAt: string;
  publishedAt: string | null;
}

export interface DashboardUpcomingScheduled {
  id: string;
  platforms: string[];
  status: string;
  scheduledAt: string;
  excerpt: string | null;
}

export interface DashboardAnalyticsResponse {
  range: DashboardRange;
  since: string;
  until: string;
  summary: DashboardSummary;
  daily: DashboardDailyMetric[];
  byPlatform: DashboardPlatformMetric[];
  byStatus: DashboardStatusMetric[];
  accountHealth: DashboardAccountHealth[];
  recentActivity: DashboardRecentActivity[];
  upcomingScheduled: DashboardUpcomingScheduled[];
}
