import { Inject, Injectable } from '@nestjs/common'
import {
  ANALYTICS_REPOSITORY,
  type AnalyticsRepository,
} from '../ports/analytics.repository.js'
import {
  DEFAULT_DASHBOARD_RANGE,
  dashboardRangeDays,
  startOfRange,
  successRate,
  toDateKey,
  toExcerpt,
  type DashboardRange,
} from '../analytics.util.js'

/// Nombre de lignes d'historique remontées dans « Activité récente ».
const RECENT_ACTIVITY_LIMIT = 10
/// Nombre de planifications remontées dans « Programmées à venir ».
const UPCOMING_SCHEDULED_LIMIT = 5

/// KPI de tête du tableau de bord.
export interface DashboardSummaryView {
  totalPosts: number
  published: number
  failed: number
  pending: number
  scheduled: number
  connectedAccounts: number
  reconnectRequired: number
  successRate: number
}

export interface DashboardDailyView {
  date: string
  total: number
  published: number
  failed: number
  pending: number
}

export interface DashboardPlatformView {
  platform: string
  total: number
  published: number
  failed: number
  pending: number
  successRate: number
}

export interface DashboardStatusView {
  status: string
  count: number
}

export interface DashboardAccountHealthView {
  platform: string
  total: number
  connected: number
  reconnectRequired: number
  expired: number
  error: number
  revoked: number
}

export interface DashboardActivityView {
  id: string
  platform: string
  status: string
  accountName: string | null
  excerpt: string | null
  createdAt: string
  publishedAt: string | null
}

export interface DashboardUpcomingView {
  id: string
  platforms: string[]
  status: string
  scheduledAt: string
  excerpt: string | null
}

export interface DashboardView {
  range: DashboardRange
  since: string
  until: string
  summary: DashboardSummaryView
  daily: DashboardDailyView[]
  byPlatform: DashboardPlatformView[]
  byStatus: DashboardStatusView[]
  accountHealth: DashboardAccountHealthView[]
  recentActivity: DashboardActivityView[]
  upcomingScheduled: DashboardUpcomingView[]
}

/// Vue d'ensemble du tableau de bord, calculée EXCLUSIVEMENT à partir des
/// tables locales (social_posts, scheduled_posts, social_accounts) via le port
/// de lecture. Aucun appel distant vers Facebook, Instagram, TikTok, LinkedIn
/// ou YouTube : afficher des statistiques ne doit ni consommer de quota, ni
/// déclencher un rafraîchissement de token. Lecture strictement passive.
@Injectable()
export class GetDashboardAnalyticsUseCase {
  constructor(
    @Inject(ANALYTICS_REPOSITORY)
    private readonly repo: AnalyticsRepository,
  ) {}

  async execute(
    userId: string,
    range: DashboardRange = DEFAULT_DASHBOARD_RANGE,
  ): Promise<DashboardView> {
    const now = new Date()
    const since = startOfRange(range)

    // Requêtes INDÉPENDANTES lancées en parallèle : le temps de réponse est
    // celui de la plus lente, pas leur somme.
    const [
      status,
      platformStatus,
      dailyStatus,
      scheduled,
      health,
      recent,
      upcoming,
    ] = await Promise.all([
      this.repo.statusCountsSince(since, userId),
      this.repo.platformStatusCountsSince(since, userId),
      this.repo.dailyStatusCountsSince(since, userId),
      this.repo.pendingScheduledCount(userId),
      this.repo.accountHealthCounts(userId),
      this.repo.recentPosts(userId, RECENT_ACTIVITY_LIMIT),
      this.repo.upcomingScheduledPosts(userId, now, UPCOMING_SCHEDULED_LIMIT),
    ])

    const connectedAccounts = health.reduce((sum, h) => sum + h.connected, 0)
    const reconnectRequired = health.reduce(
      (sum, h) => sum + h.reconnectRequired + h.expired,
      0,
    )

    return {
      range,
      since: since.toISOString(),
      until: now.toISOString(),
      summary: {
        totalPosts: status.total,
        published: status.published,
        failed: status.failed,
        pending: status.pending,
        scheduled,
        connectedAccounts,
        reconnectRequired,
        successRate: successRate(status.published, status.failed),
      },
      daily: this.buildDailySeries(since, range, dailyStatus),
      byPlatform: platformStatus.map((p) => ({
        platform: p.platform,
        total: p.published + p.failed + p.pending,
        published: p.published,
        failed: p.failed,
        pending: p.pending,
        successRate: successRate(p.published, p.failed),
      })),
      byStatus: [
        { status: 'PUBLISHED', count: status.published },
        { status: 'FAILED', count: status.failed },
        { status: 'PENDING', count: status.pending },
      ],
      accountHealth: health,
      recentActivity: await this.buildRecentActivity(userId, recent),
      upcomingScheduled: upcoming.map((u) => ({
        id: u.id,
        platforms: u.platforms,
        status: u.status,
        scheduledAt: u.scheduledAt.toISOString(),
        excerpt: toExcerpt(u.message ?? u.caption),
      })),
    }
  }

  /// Série CONTINUE et chronologique : chaque jour de la fenêtre est présent,
  /// à zéro si aucune publication — sans quoi un graphique en barres écraserait
  /// les jours creux et laisserait croire à une activité continue.
  private buildDailySeries(
    since: Date,
    range: DashboardRange,
    rows: { date: string; published: number; failed: number; pending: number }[],
  ): DashboardDailyView[] {
    const byDate = new Map(rows.map((r) => [r.date, r]))
    const series: DashboardDailyView[] = []
    const cursor = new Date(since)

    for (let i = 0; i < dashboardRangeDays(range); i += 1) {
      const date = toDateKey(cursor)
      const row = byDate.get(date)
      series.push({
        date,
        total: row ? row.published + row.failed + row.pending : 0,
        published: row?.published ?? 0,
        failed: row?.failed ?? 0,
        pending: row?.pending ?? 0,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    return series
  }

  /// Résout le nom des comptes cités par l'historique en UNE requête pour
  /// l'ensemble des lignes (jamais une par ligne). Un compte non résolu reste
  /// `null` : on n'invente pas de nom d'affichage.
  private async buildRecentActivity(
    userId: string,
    rows: {
      id: string
      platform: string
      status: string
      accountId: string | null
      caption: string | null
      createdAt: Date
      publishedAt: Date | null
    }[],
  ): Promise<DashboardActivityView[]> {
    const ids = [
      ...new Set(
        rows.map((r) => r.accountId).filter((id): id is string => id !== null),
      ),
    ]
    const names = new Map(
      (await this.repo.accountNames(userId, ids)).map((a) => [
        a.id,
        a.accountName,
      ]),
    )

    return rows.map((r) => ({
      id: r.id,
      platform: r.platform,
      status: r.status,
      accountName: r.accountId ? (names.get(r.accountId) ?? null) : null,
      excerpt: toExcerpt(r.caption),
      createdAt: r.createdAt.toISOString(),
      publishedAt: r.publishedAt?.toISOString() ?? null,
    }))
  }
}
