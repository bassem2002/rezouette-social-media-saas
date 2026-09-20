import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import {
  type AccountHealthCounts,
  type AccountNameRow,
  type AnalyticsRepository,
  type DailyCount,
  type DailyStatusCounts,
  type ErrorReasonCount,
  type PlatformCount,
  type PlatformStatusCounts,
  type RecentPostRow,
  type ScheduledStateCounts,
  type SocialStatusCounts,
  type StatusBuckets,
  type UpcomingScheduledRow,
} from '../../../application/analytics/ports/analytics.repository.js'
import { toDateKey } from '../../../application/analytics/analytics.util.js'
import type { SocialPostPlatform } from '../../../domain/social-post/entities/social-post.entity.js'

/// Plateformes publiables exposées dans la répartition, dans un ordre stable.
/// Chaque plateforme apparaît même à 0 (série homogène côté frontend).
///
/// ⚠️ Cette liste doit couvrir TOUTES les valeurs de `SocialPostPlatform` :
/// une plateforme oubliée disparaît silencieusement de la répartition, alors que
/// ses publications restent comptées dans les KPI globaux — c'est précisément le
/// défaut qu'avaient LINKEDIN puis YOUTUBE. La vérification exhaustive
/// ci-dessous rend désormais cet oubli impossible.
const REPORTED_PLATFORMS = [
  'FACEBOOK',
  'INSTAGRAM',
  'TIKTOK',
  'LINKEDIN',
  'YOUTUBE',
] as const satisfies readonly ReportedPlatform[]

/// Valeur DB de `SocialPostPlatform`, dérivée du type domaine : ajouter un
/// réseau au domaine sans l'ajouter ici casse la compilation.
type ReportedPlatform = Uppercase<SocialPostPlatform>

/// Garde-fou de compilation : si une valeur du domaine manque à la liste,
/// `AssertNever` échoue. Complément du `satisfies`, qui ne détecte que l'excès.
type AssertNever<T extends never> = T
type _AllPlatformsReported = AssertNever<
  Exclude<ReportedPlatform, (typeof REPORTED_PLATFORMS)[number]>
>

/// Implémentation Prisma du modèle de lecture analytique. Utilise les agrégations
/// natives (groupBy/count) ; seul endroit qui connaît le schéma Prisma pour ces
/// statistiques. Ne réécrit aucune logique métier.
@Injectable()
export class PrismaAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async socialStatusCounts(userId?: string): Promise<SocialStatusCounts> {
    const groups = await this.prisma.socialPost.groupBy({
      by: ['status'],
      where: userId ? { userId } : {},
      _count: { _all: true },
    })

    let published = 0
    let failed = 0
    let pending = 0
    for (const g of groups) {
      if (g.status === 'PUBLISHED') published = g._count._all
      else if (g.status === 'FAILED') failed = g._count._all
      else if (g.status === 'PENDING') pending = g._count._all
    }
    return { total: published + failed + pending, published, failed, pending }
  }

  async platformCounts(userId?: string): Promise<PlatformCount[]> {
    const groups = await this.prisma.socialPost.groupBy({
      by: ['platform'],
      where: userId ? { userId } : {},
      _count: { _all: true },
    })
    const byPlatform = new Map(groups.map((g) => [g.platform, g._count._all]))
    return REPORTED_PLATFORMS.map((platform) => ({
      platform,
      count: byPlatform.get(platform) ?? 0,
    }))
  }

  async errorReasonCounts(userId?: string): Promise<ErrorReasonCount[]> {
    const groups = await this.prisma.socialPost.groupBy({
      by: ['metaReason'],
      where: {
        status: 'FAILED',
        metaReason: { not: null },
        ...(userId ? { userId } : {}),
      },
      _count: { _all: true },
    })
    return groups
      .filter((g): g is typeof g & { metaReason: string } => g.metaReason !== null)
      .map((g) => ({ reason: g.metaReason, count: g._count._all }))
      .sort((a, b) => b.count - a.count)
  }

  async dailyCounts(since: Date, userId?: string): Promise<DailyCount[]> {
    // Fenêtre bornée (≈30 jours) → bucketing en mémoire, typé, sans SQL brut.
    const rows = await this.prisma.socialPost.findMany({
      where: { createdAt: { gte: since }, ...(userId ? { userId } : {}) },
      select: { createdAt: true },
    })
    const counts = new Map<string, number>()
    for (const row of rows) {
      const key = toDateKey(row.createdAt)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()].map(([date, count]) => ({ date, count }))
  }

  async scheduledStateCounts(userId?: string): Promise<ScheduledStateCounts> {
    const groups = await this.prisma.scheduledPost.groupBy({
      by: ['status'],
      where: userId ? { userId } : {},
      _count: { _all: true },
    })
    const byStatus = new Map(groups.map((g) => [g.status, g._count._all]))
    const scheduled = byStatus.get('SCHEDULED') ?? 0
    const processing = byStatus.get('PROCESSING') ?? 0
    const published = byStatus.get('PUBLISHED') ?? 0
    const failed = byStatus.get('FAILED') ?? 0
    const cancelled = byStatus.get('CANCELLED') ?? 0
    return {
      total: scheduled + processing + published + failed + cancelled,
      scheduled,
      processing,
      published,
      failed,
      cancelled,
    }
  }

  // ── Modèle de lecture du tableau de bord ──────────────────────────────────

  async statusCountsSince(
    since: Date,
    userId: string,
  ): Promise<SocialStatusCounts> {
    const groups = await this.prisma.socialPost.groupBy({
      by: ['status'],
      where: { userId, createdAt: { gte: since } },
      _count: { _all: true },
    })
    const buckets = emptyBuckets()
    for (const g of groups) addToBuckets(buckets, g.status, g._count._all)
    return { total: totalOf(buckets), ...buckets }
  }

  async platformStatusCountsSince(
    since: Date,
    userId: string,
  ): Promise<PlatformStatusCounts[]> {
    // Agrégation côté base sur DEUX dimensions : une seule requête couvre les
    // cinq plateformes et les trois statuts (jamais une requête par plateforme).
    const groups = await this.prisma.socialPost.groupBy({
      by: ['platform', 'status'],
      where: { userId, createdAt: { gte: since } },
      _count: { _all: true },
    })

    const byPlatform = new Map<string, StatusBuckets>(
      REPORTED_PLATFORMS.map((platform) => [platform, emptyBuckets()]),
    )
    for (const g of groups) {
      const buckets = byPlatform.get(g.platform)
      // Une plateforme inconnue de la liste ne peut pas exister (garde-fou de
      // compilation ci-dessus) ; on ignore par sécurité plutôt que de crasher.
      if (buckets) addToBuckets(buckets, g.status, g._count._all)
    }

    return REPORTED_PLATFORMS.map((platform) => ({
      platform,
      ...(byPlatform.get(platform) ?? emptyBuckets()),
    }))
  }

  async dailyStatusCountsSince(
    since: Date,
    userId: string,
  ): Promise<DailyStatusCounts[]> {
    // Fenêtre BORNÉE (90 jours au maximum) et projection à deux colonnes
    // scalaires : le bucketing par jour local se fait en mémoire, comme
    // `dailyCounts`, pour éviter du SQL brut et un décalage de fuseau entre la
    // base (UTC) et la série affichée.
    const rows = await this.prisma.socialPost.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { createdAt: true, status: true },
    })

    const byDate = new Map<string, StatusBuckets>()
    for (const row of rows) {
      const key = toDateKey(row.createdAt)
      let buckets = byDate.get(key)
      if (!buckets) {
        buckets = emptyBuckets()
        byDate.set(key, buckets)
      }
      addToBuckets(buckets, row.status, 1)
    }
    return [...byDate.entries()].map(([date, buckets]) => ({ date, ...buckets }))
  }

  pendingScheduledCount(userId: string): Promise<number> {
    return this.prisma.scheduledPost.count({
      where: { userId, status: 'SCHEDULED' },
    })
  }

  async accountHealthCounts(userId: string): Promise<AccountHealthCounts[]> {
    const groups = await this.prisma.socialAccount.groupBy({
      by: ['platform', 'status', 'needsReconnect'],
      where: { userId },
      _count: { _all: true },
    })

    // Les cinq réseaux publiables apparaissent toujours (série homogène côté
    // frontend) ; un réseau connecté hors de cette liste est ajouté à la volée
    // plutôt qu'ignoré — on n'invente rien, on ne masque rien.
    const byPlatform = new Map<string, AccountHealthCounts>(
      REPORTED_PLATFORMS.map((platform) => [platform, emptyHealth(platform)]),
    )
    for (const g of groups) {
      let health = byPlatform.get(g.platform)
      if (!health) {
        health = emptyHealth(g.platform)
        byPlatform.set(g.platform, health)
      }
      const count = g._count._all
      health.total += count
      health[healthBucket(g.status, g.needsReconnect)] += count
    }
    return [...byPlatform.values()]
  }

  recentPosts(userId: string, limit: number): Promise<RecentPostRow[]> {
    // Projection explicite : aucun token n'existe sur social_posts, mais la
    // sélection nominative garantit qu'aucune colonne ajoutée plus tard ne
    // fuirait automatiquement dans la réponse HTTP.
    return this.prisma.socialPost.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        platform: true,
        status: true,
        accountId: true,
        caption: true,
        createdAt: true,
        publishedAt: true,
      },
    })
  }

  async accountNames(userId: string, ids: string[]): Promise<AccountNameRow[]> {
    // Une seule requête pour l'ensemble des identifiants (pas de N+1), et rien
    // si la liste est vide. `userId` borne la lecture au propriétaire.
    if (ids.length === 0) return []
    return this.prisma.socialAccount.findMany({
      where: { userId, id: { in: ids } },
      select: { id: true, accountName: true },
    })
  }

  upcomingScheduledPosts(
    userId: string,
    from: Date,
    limit: number,
  ): Promise<UpcomingScheduledRow[]> {
    return this.prisma.scheduledPost.findMany({
      where: { userId, status: 'SCHEDULED', scheduledAt: { gte: from } },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
      select: {
        id: true,
        platforms: true,
        status: true,
        scheduledAt: true,
        message: true,
        caption: true,
      },
    })
  }
}

/// Paniers de statuts vides (helper local — aucune logique métier).
function emptyBuckets(): StatusBuckets {
  return { published: 0, failed: 0, pending: 0 }
}

function totalOf(buckets: StatusBuckets): number {
  return buckets.published + buckets.failed + buckets.pending
}

/// Ajoute `count` au panier correspondant au statut DB. Un statut inconnu est
/// ignoré plutôt que rattaché arbitrairement à un panier existant : mieux vaut
/// une somme inférieure au réel qu'un succès inventé.
function addToBuckets(
  buckets: StatusBuckets,
  status: string,
  count: number,
): void {
  if (status === 'PUBLISHED') buckets.published += count
  else if (status === 'FAILED') buckets.failed += count
  else if (status === 'PENDING') buckets.pending += count
}

function emptyHealth(platform: string): AccountHealthCounts {
  return {
    platform,
    total: 0,
    connected: 0,
    reconnectRequired: 0,
    expired: 0,
    error: 0,
    revoked: 0,
  }
}

/// Panier UNIQUE d'un compte, par ordre de priorité décroissante. Un compte
/// expiré ET marqué `needsReconnect` ne doit être compté qu'une fois : sans
/// cette règle, la somme des paniers dépasserait le total réel.
function healthBucket(
  status: string,
  needsReconnect: boolean,
): 'connected' | 'reconnectRequired' | 'expired' | 'error' | 'revoked' {
  if (status === 'REVOKED') return 'revoked'
  if (status === 'EXPIRED') return 'expired'
  if (needsReconnect) return 'reconnectRequired'
  if (status === 'ERROR') return 'error'
  return 'connected'
}
