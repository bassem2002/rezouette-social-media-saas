import { Inject, Injectable } from '@nestjs/common'
import {
  ANALYTICS_REPOSITORY,
  type AnalyticsRepository,
} from './ports/analytics.repository.js'
import {
  percentage,
  startOfDayDaysAgo,
  toDateKey,
} from './analytics.util.js'

/// Fenêtre de la série "publications par jour".
const DAILY_WINDOW_DAYS = 30

/// Vue d'ensemble : KPI principaux + taux de réussite.
export interface OverviewView {
  total: number
  published: number
  failed: number
  pending: number
  scheduled: number
  cancelled: number
  successRate: number
}

/// Part d'une plateforme publiable. Le libellé reste une chaîne pour couvrir
/// toutes les valeurs de `SocialPostPlatform` (FACEBOOK, INSTAGRAM, TIKTOK,
/// LINKEDIN, YOUTUBE) sans figer l'union à trois réseaux — c'est ce figement
/// qui avait rendu LinkedIn puis YouTube invisibles dans la répartition.
export interface PlatformShareView {
  platform: string
  count: number
  percentage: number
}
export interface PlatformsView {
  total: number
  platforms: PlatformShareView[]
}

export interface ErrorShareView {
  reason: string
  count: number
  percentage: number
}
export interface ErrorsView {
  total: number
  errors: ErrorShareView[]
}

export interface DailyPointView {
  date: string
  count: number
}
export interface DailyView {
  days: number
  series: DailyPointView[]
}

export interface ScheduledView {
  total: number
  scheduled: number
  processing: number
  published: number
  failed: number
  cancelled: number
}

/// Service Analytics : calcule les statistiques à partir des tables existantes
/// (social_posts, scheduled_posts) via le port de lecture. Aucune donnée mockée,
/// aucune duplication de la logique de publication.
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repo: AnalyticsRepository,
  ) {}

  /// KPI globaux + taux de réussite (published / total).
  async overview(userId?: string): Promise<OverviewView> {
    const [status, scheduled] = await Promise.all([
      this.repo.socialStatusCounts(userId),
      this.repo.scheduledStateCounts(userId),
    ])
    return {
      total: status.total,
      published: status.published,
      failed: status.failed,
      pending: status.pending,
      scheduled: scheduled.scheduled,
      cancelled: scheduled.cancelled,
      successRate: percentage(status.published, status.total),
    }
  }

  /// Répartition par plateforme (Facebook / Instagram / TikTok) : compte + pourcentage.
  async platforms(userId?: string): Promise<PlatformsView> {
    const counts = await this.repo.platformCounts(userId)
    const total = counts.reduce((sum, c) => sum + c.count, 0)
    return {
      total,
      platforms: counts.map((c) => ({
        platform: c.platform,
        count: c.count,
        percentage: percentage(c.count, total),
      })),
    }
  }

  /// Répartition des erreurs par raison normalisée (Meta ou TikTok selon la
  /// plateforme), fréquence + pourcentage, triée par fréquence décroissante.
  async errors(userId?: string): Promise<ErrorsView> {
    const counts = await this.repo.errorReasonCounts(userId)
    const total = counts.reduce((sum, c) => sum + c.count, 0)
    return {
      total,
      errors: counts.map((c) => ({
        reason: c.reason,
        count: c.count,
        percentage: percentage(c.count, total),
      })),
    }
  }

  /// Série continue des 30 derniers jours (jours sans publication = 0).
  async daily(userId?: string): Promise<DailyView> {
    const since = startOfDayDaysAgo(DAILY_WINDOW_DAYS - 1)
    const rows = await this.repo.dailyCounts(since, userId)
    const byDate = new Map(rows.map((r) => [r.date, r.count]))

    const series: DailyPointView[] = []
    const cursor = new Date(since)
    for (let i = 0; i < DAILY_WINDOW_DAYS; i += 1) {
      const key = toDateKey(cursor)
      series.push({ date: key, count: byDate.get(key) ?? 0 })
      cursor.setDate(cursor.getDate() + 1)
    }
    return { days: DAILY_WINDOW_DAYS, series }
  }

  /// État des publications programmées (par statut).
  async scheduled(userId?: string): Promise<ScheduledView> {
    const s = await this.repo.scheduledStateCounts(userId)
    return {
      total: s.total,
      scheduled: s.scheduled,
      processing: s.processing,
      published: s.published,
      failed: s.failed,
      cancelled: s.cancelled,
    }
  }
}
