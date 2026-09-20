import { ApiProperty } from '@nestjs/swagger'
import { DASHBOARD_RANGES } from '../../../application/analytics/analytics.util.js'

/// Plateformes publiables exposées par le tableau de bord (valeurs DB).
const PLATFORM_ENUM = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'YOUTUBE']

/// KPI de tête.
export class DashboardSummaryDto {
  @ApiProperty({ description: 'Publications créées dans la fenêtre.', example: 68 })
  totalPosts!: number

  @ApiProperty({ description: 'Publications réussies.', example: 25 })
  published!: number

  @ApiProperty({ description: 'Publications en échec.', example: 43 })
  failed!: number

  @ApiProperty({
    description:
      'Publications encore en traitement (PENDING). Ni succès, ni échec — une vidéo YouTube en cours d’encodage reste ici.',
    example: 4,
  })
  pending!: number

  @ApiProperty({
    description:
      'Planifications encore en attente d’exécution (SCHEDULED). Métrique prospective : elle n’est PAS bornée par la fenêtre.',
    example: 7,
  })
  scheduled!: number

  @ApiProperty({
    description: 'Comptes sociaux actifs ne réclamant aucune action.',
    example: 5,
  })
  connectedAccounts!: number

  @ApiProperty({
    description: 'Comptes à reconnecter (marqués needsReconnect ou expirés).',
    example: 1,
  })
  reconnectRequired!: number

  @ApiProperty({
    description:
      'published / (published + failed) × 100, arrondi à 0,1. Les PENDING sont exclus du dénominateur ; 0 si aucune publication tranchée.',
    example: 36.8,
  })
  successRate!: number
}

/// Point de la série quotidienne.
export class DashboardDailyDto {
  @ApiProperty({ description: 'Jour local (YYYY-MM-DD).', example: '2026-08-03' })
  date!: string

  @ApiProperty({ example: 5 })
  total!: number

  @ApiProperty({ example: 3 })
  published!: number

  @ApiProperty({ example: 1 })
  failed!: number

  @ApiProperty({ example: 1 })
  pending!: number
}

/// Répartition par plateforme.
export class DashboardPlatformDto {
  @ApiProperty({ enum: PLATFORM_ENUM, example: 'FACEBOOK' })
  platform!: string

  @ApiProperty({ example: 22 })
  total!: number

  @ApiProperty({ example: 18 })
  published!: number

  @ApiProperty({ example: 4 })
  failed!: number

  @ApiProperty({ example: 0 })
  pending!: number

  @ApiProperty({ description: 'Taux de réussite de la plateforme.', example: 81.8 })
  successRate!: number
}

/// Répartition par statut.
export class DashboardStatusDto {
  @ApiProperty({ enum: ['PUBLISHED', 'FAILED', 'PENDING'], example: 'PUBLISHED' })
  status!: string

  @ApiProperty({ example: 25 })
  count!: number
}

/// Santé des connexions d'une plateforme. Chaque compte tombe dans un SEUL
/// panier : `total` est la somme exacte des paniers.
export class DashboardAccountHealthDto {
  @ApiProperty({ enum: PLATFORM_ENUM, example: 'YOUTUBE' })
  platform!: string

  @ApiProperty({ example: 2 })
  total!: number

  @ApiProperty({ description: 'Actifs, aucune action requise.', example: 1 })
  connected!: number

  @ApiProperty({ description: 'Marqués needsReconnect.', example: 1 })
  reconnectRequired!: number

  @ApiProperty({ description: 'Token expiré (statut EXPIRED).', example: 0 })
  expired!: number

  @ApiProperty({ description: 'En erreur (statut ERROR).', example: 0 })
  error!: number

  @ApiProperty({ description: 'Révoqués (conservés pour l’historique).', example: 0 })
  revoked!: number
}

/// Ligne d'activité récente. Ne contient QUE des champs sûrs : aucun token,
/// aucun secret, aucun identifiant de session, aucun chemin local.
export class DashboardActivityDto {
  @ApiProperty({ format: 'uuid' })
  id!: string

  @ApiProperty({ enum: PLATFORM_ENUM, example: 'INSTAGRAM' })
  platform!: string

  @ApiProperty({ enum: ['PUBLISHED', 'FAILED', 'PENDING'], example: 'PUBLISHED' })
  status!: string

  @ApiProperty({
    description: 'Nom du compte source, null s’il n’est plus résolvable.',
    nullable: true,
    example: 'Hbshoply test',
  })
  accountName!: string | null

  @ApiProperty({
    description: 'Extrait du contenu (120 caractères maximum), null si absent.',
    nullable: true,
    example: 'Nouvelle collection disponible…',
  })
  excerpt!: string | null

  @ApiProperty({ format: 'date-time' })
  createdAt!: string

  @ApiProperty({ format: 'date-time', nullable: true })
  publishedAt!: string | null
}

/// Planification à venir.
export class DashboardUpcomingDto {
  @ApiProperty({ format: 'uuid' })
  id!: string

  @ApiProperty({ enum: PLATFORM_ENUM, isArray: true, example: ['FACEBOOK', 'INSTAGRAM'] })
  platforms!: string[]

  @ApiProperty({ enum: ['SCHEDULED'], example: 'SCHEDULED' })
  status!: string

  @ApiProperty({ format: 'date-time' })
  scheduledAt!: string

  @ApiProperty({ nullable: true, example: 'Annonce produit du vendredi' })
  excerpt!: string | null
}

/// GET /analytics/dashboard — vue d'ensemble complète.
///
/// Toutes les valeurs proviennent des tables locales de l'application. Aucun
/// appel n'est émis vers une API de réseau social pour construire cette réponse.
export class DashboardResponseDto {
  @ApiProperty({ enum: DASHBOARD_RANGES, example: '7d' })
  range!: string

  @ApiProperty({ description: 'Début de la fenêtre (minuit local).', format: 'date-time' })
  since!: string

  @ApiProperty({ description: 'Instant du calcul.', format: 'date-time' })
  until!: string

  @ApiProperty({ type: DashboardSummaryDto })
  summary!: DashboardSummaryDto

  @ApiProperty({
    type: [DashboardDailyDto],
    description: 'Série continue et chronologique : un point par jour, zéros inclus.',
  })
  daily!: DashboardDailyDto[]

  @ApiProperty({
    type: [DashboardPlatformDto],
    description: 'Les cinq plateformes publiables, y compris celles à 0.',
  })
  byPlatform!: DashboardPlatformDto[]

  @ApiProperty({ type: [DashboardStatusDto] })
  byStatus!: DashboardStatusDto[]

  @ApiProperty({ type: [DashboardAccountHealthDto] })
  accountHealth!: DashboardAccountHealthDto[]

  @ApiProperty({ type: [DashboardActivityDto], description: '10 lignes au maximum.' })
  recentActivity!: DashboardActivityDto[]

  @ApiProperty({ type: [DashboardUpcomingDto], description: '5 lignes au maximum.' })
  upcomingScheduled!: DashboardUpcomingDto[]
}
