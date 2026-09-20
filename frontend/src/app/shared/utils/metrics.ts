import type { SocialPost, ChartPoint } from '@core/models';
import { formatShortDay, toDayKey } from './format';

/// Indicateurs agrégés d'un ensemble de publications.
export interface PublicationMetrics {
  total: number;
  published: number;
  failed: number;
  pending: number;
  facebook: number;
  instagram: number;
  successRate: number;
}

/// Couleurs sémantiques partagées (cohérence charts ↔ badges).
export const chartColors = {
  primary: '#2563eb',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  facebook: '#2563eb',
  instagram: '#f59e0b',
  tiktok: '#0f172a',
  linkedin: '#0a66c2',
  youtube: '#ff0000',
} as const;

export function computeMetrics(posts: SocialPost[]): PublicationMetrics {
  const published = posts.filter((p) => p.status === 'PUBLISHED').length;
  const failed = posts.filter((p) => p.status === 'FAILED').length;
  const pending = posts.filter((p) => p.status === 'PENDING').length;
  const facebook = posts.filter((p) => p.platform === 'FACEBOOK').length;
  const instagram = posts.filter((p) => p.platform === 'INSTAGRAM').length;
  const decided = published + failed;

  return {
    total: posts.length,
    published,
    failed,
    pending,
    facebook,
    instagram,
    successRate: decided === 0 ? 0 : (published / decided) * 100,
  };
}

/// Série "publications par jour" sur les `days` derniers jours (séries continues,
/// y compris les jours à 0 → axe lisible).
export function publicationsPerDay(
  posts: SocialPost[],
  days = 7,
): ChartPoint[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    const key = toDayKey(post.createdAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const series: ChartPoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString();
    series.push({
      label: formatShortDay(iso),
      value: counts.get(toDayKey(iso)) ?? 0,
    });
  }
  return series;
}

/// Répartition par plateforme (donut).
export function platformBreakdown(posts: SocialPost[]): ChartPoint[] {
  const metrics = computeMetrics(posts);
  return [
    { label: 'Facebook', value: metrics.facebook, color: chartColors.facebook },
    {
      label: 'Instagram',
      value: metrics.instagram,
      color: chartColors.instagram,
    },
  ];
}

/// Répartition succès / échecs (donut).
export function outcomeBreakdown(posts: SocialPost[]): ChartPoint[] {
  const metrics = computeMetrics(posts);
  return [
    { label: 'Succès', value: metrics.published, color: chartColors.success },
    { label: 'Échecs', value: metrics.failed, color: chartColors.error },
  ];
}
