/// Port (DIP) du modèle de lecture analytique. La couche application dépend de
/// cette abstraction ; l'agrégation SQL (count/groupBy) vit dans l'infrastructure.
/// Lecture seule : ne modifie jamais les données.

/// Comptes par statut de l'historique des publications (social_posts).
export interface SocialStatusCounts {
  total: number
  published: number
  failed: number
  pending: number
}

/// Compte par plateforme publiable. Couvre l'ensemble de `SocialPostPlatform` :
/// FACEBOOK, INSTAGRAM, TIKTOK, LINKEDIN, YOUTUBE.
export interface PlatformCount {
  platform: string
  count: number
}

/// Compte par raison d'échec normalisée (metaReason) — Meta ou TikTok.
export interface ErrorReasonCount {
  reason: string
  count: number
}

/// Nombre de publications pour un jour donné (clé YYYY-MM-DD locale).
export interface DailyCount {
  date: string
  count: number
}

/// Comptes par état des publications programmées (scheduled_posts).
export interface ScheduledStateCounts {
  total: number
  scheduled: number
  processing: number
  published: number
  failed: number
  cancelled: number
}

/// Ventilation d'un ensemble de publications par statut terminal ou non.
/// PENDING reste une catégorie à part entière : ni succès, ni échec.
export interface StatusBuckets {
  published: number
  failed: number
  pending: number
}

/// Ventilation par statut pour une plateforme donnée (valeur DB majuscule).
export interface PlatformStatusCounts extends StatusBuckets {
  platform: string
}

/// Ventilation par statut pour un jour donné (clé YYYY-MM-DD locale).
export interface DailyStatusCounts extends StatusBuckets {
  date: string
}

/// Santé des connexions d'une plateforme. Chaque compte tombe dans UN SEUL
/// panier (voir la règle de priorité dans l'implémentation) : `total` est donc
/// la somme exacte des paniers, sans double comptabilisation.
export interface AccountHealthCounts {
  platform: string
  total: number
  connected: number
  reconnectRequired: number
  expired: number
  error: number
  revoked: number
}

/// Ligne d'historique récente, restreinte aux champs non sensibles.
/// Aucun token, aucun secret, aucun identifiant de session n'y figure.
export interface RecentPostRow {
  id: string
  platform: string
  status: string
  accountId: string | null
  caption: string | null
  createdAt: Date
  publishedAt: Date | null
}

/// Nom d'affichage d'un compte social (résolution des lignes d'historique).
export interface AccountNameRow {
  id: string
  accountName: string
}

/// Planification à venir, restreinte aux champs non sensibles.
export interface UpcomingScheduledRow {
  id: string
  platforms: string[]
  status: string
  scheduledAt: Date
  message: string | null
  caption: string | null
}

export interface AnalyticsRepository {
  /// Comptes par statut de social_posts (optionnellement filtré par user).
  socialStatusCounts(userId?: string): Promise<SocialStatusCounts>
  /// Comptes par plateforme de social_posts.
  platformCounts(userId?: string): Promise<PlatformCount[]>
  /// Comptes par raison d'échec (social_posts FAILED avec metaReason).
  errorReasonCounts(userId?: string): Promise<ErrorReasonCount[]>
  /// Comptes journaliers de social_posts depuis `since` (jours bucketés).
  dailyCounts(since: Date, userId?: string): Promise<DailyCount[]>
  /// Comptes par état des publications programmées.
  scheduledStateCounts(userId?: string): Promise<ScheduledStateCounts>

  // ── Modèle de lecture du tableau de bord (fenêtre glissante) ─────────────
  // Toutes ces lectures sont BORNÉES : soit par la fenêtre `since`, soit par
  // une limite explicite. Aucune ne charge l'intégralité d'une table.

  /// Comptes par statut de social_posts créés depuis `since`.
  statusCountsSince(since: Date, userId: string): Promise<SocialStatusCounts>
  /// Comptes par (plateforme, statut) depuis `since` — toutes les plateformes
  /// publiables sont retournées, y compris à 0.
  platformStatusCountsSince(
    since: Date,
    userId: string,
  ): Promise<PlatformStatusCounts[]>
  /// Comptes par (jour, statut) depuis `since` — jours effectivement présents
  /// uniquement ; la série continue est reconstituée par la couche application.
  dailyStatusCountsSince(
    since: Date,
    userId: string,
  ): Promise<DailyStatusCounts[]>
  /// Nombre de planifications encore en attente d'exécution (SCHEDULED).
  pendingScheduledCount(userId: string): Promise<number>
  /// Santé des connexions, ventilée par plateforme.
  accountHealthCounts(userId: string): Promise<AccountHealthCounts[]>
  /// `limit` dernières publications (les plus récentes d'abord).
  recentPosts(userId: string, limit: number): Promise<RecentPostRow[]>
  /// Noms d'affichage des comptes cités par l'historique (une seule requête,
  /// jamais une par ligne).
  accountNames(userId: string, ids: string[]): Promise<AccountNameRow[]>
  /// `limit` prochaines planifications à partir de `from` (ordre croissant).
  upcomingScheduledPosts(
    userId: string,
    from: Date,
    limit: number,
  ): Promise<UpcomingScheduledRow[]>
}

export const ANALYTICS_REPOSITORY = Symbol('AnalyticsRepository')
