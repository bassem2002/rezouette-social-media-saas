import { ApiProperty } from '@nestjs/swagger'

/// GET /analytics/overview — KPI globaux.
export class OverviewResponseDto {
  @ApiProperty({ description: 'Nombre total de publications (historique).', example: 42 })
  total!: number

  @ApiProperty({ description: 'Publications réussies.', example: 35 })
  published!: number

  @ApiProperty({ description: 'Publications en échec.', example: 5 })
  failed!: number

  @ApiProperty({ description: 'Publications en attente (PENDING).', example: 2 })
  pending!: number

  @ApiProperty({ description: 'Publications programmées (SCHEDULED).', example: 4 })
  scheduled!: number

  @ApiProperty({ description: 'Publications programmées annulées.', example: 1 })
  cancelled!: number

  @ApiProperty({
    description: 'Taux de réussite en pourcentage (published / total).',
    example: 83.3,
  })
  successRate!: number
}

/// Part d'une plateforme dans la répartition.
export class PlatformShareDto {
  @ApiProperty({
    enum: ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'YOUTUBE'],
    description:
      "Toutes les plateformes publiables sont retournées, y compris à 0. Pour YouTube, une publication reste comptée PENDING tant que le traitement du fournisseur n'est pas terminé.",
    example: 'FACEBOOK',
  })
  platform!: string

  @ApiProperty({ example: 24 })
  count!: number

  @ApiProperty({ description: 'Pourcentage du total.', example: 57.1 })
  percentage!: number
}

/// GET /analytics/platforms — répartition par plateforme.
export class PlatformsResponseDto {
  @ApiProperty({ example: 42 })
  total!: number

  @ApiProperty({ type: [PlatformShareDto] })
  platforms!: PlatformShareDto[]
}

/// Fréquence d'une raison d'erreur Meta.
export class ErrorShareDto {
  @ApiProperty({
    description: 'Raison d’échec Meta normalisée.',
    example: 'TIMEOUT',
  })
  reason!: string

  @ApiProperty({ example: 3 })
  count!: number

  @ApiProperty({ description: 'Pourcentage des erreurs.', example: 60 })
  percentage!: number
}

/// GET /analytics/errors — répartition des erreurs.
export class ErrorsResponseDto {
  @ApiProperty({ description: 'Nombre total d’erreurs classifiées.', example: 5 })
  total!: number

  @ApiProperty({ type: [ErrorShareDto] })
  errors!: ErrorShareDto[]
}

/// Point quotidien (jour + nombre de publications).
export class DailyPointDto {
  @ApiProperty({ description: 'Jour (YYYY-MM-DD).', example: '2026-06-28' })
  date!: string

  @ApiProperty({ example: 12 })
  count!: number
}

/// GET /analytics/daily — publications par jour (30 derniers jours).
export class DailyResponseDto {
  @ApiProperty({ description: 'Taille de la fenêtre (jours).', example: 30 })
  days!: number

  @ApiProperty({ type: [DailyPointDto] })
  series!: DailyPointDto[]
}

/// GET /analytics/scheduled — état des publications programmées.
export class ScheduledResponseDto {
  @ApiProperty({ example: 10 })
  total!: number

  @ApiProperty({ description: 'En attente d’exécution.', example: 4 })
  scheduled!: number

  @ApiProperty({ description: 'En cours de traitement.', example: 0 })
  processing!: number

  @ApiProperty({ description: 'Déjà exécutées avec succès.', example: 5 })
  published!: number

  @ApiProperty({ description: 'En échec.', example: 0 })
  failed!: number

  @ApiProperty({ description: 'Annulées.', example: 1 })
  cancelled!: number
}
