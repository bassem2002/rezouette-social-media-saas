import { ApiProperty } from '@nestjs/swagger'
import { YOUTUBE_PRIVACY_STATUSES } from '../../../domain/scheduled-post/value-objects/youtube-schedule-options.js'
import type { YouTubePrivacyStatus } from '../../../domain/scheduled-post/value-objects/youtube-schedule-options.js'

/// Options YouTube mémorisées avec une planification (lecture seule).
export class YouTubeScheduledOptionsResponseDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Titre de la vidéo. `null` uniquement pour une planification héritée créée avant que le titre ne devienne obligatoire — une telle ligne échouera à l’échéance.',
    example: 'Ma vidéo Zernio',
  })
  title!: string | null

  @ApiProperty({ nullable: true, type: String, example: 'Description longue' })
  description!: string | null

  @ApiProperty({ type: [String], example: ['zernio', 'saas'] })
  tags!: string[]

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Identifiant de catégorie YouTube',
    example: '22',
  })
  categoryId!: string | null

  @ApiProperty({
    enum: YOUTUBE_PRIVACY_STATUSES as readonly string[],
    nullable: true,
    example: 'private',
  })
  privacyStatus!: YouTubePrivacyStatus | null

  @ApiProperty({
    nullable: true,
    type: Boolean,
    description:
      'Déclaration COPPA « contenu destiné aux enfants ». `null` signifie NON DÉCLARÉ (planification héritée) — jamais « false » : la valeur n’est pas supposée, et la publication échouera tant qu’elle n’est pas fournie.',
    example: false,
  })
  madeForKids!: boolean | null

  @ApiProperty({ nullable: true, type: Boolean, example: null })
  containsSyntheticMedia!: boolean | null

  @ApiProperty({ nullable: true, type: Boolean, example: null })
  notifySubscribers!: boolean | null

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Chaîne ciblée (id interne du compte social)',
    example: null,
  })
  accountId!: string | null
}

/// Options spécifiques par plateforme attachées à une planification.
export class ScheduledPlatformOptionsResponseDto {
  @ApiProperty({
    type: YouTubeScheduledOptionsResponseDto,
    nullable: true,
    required: false,
  })
  youtube?: YouTubeScheduledOptionsResponseDto
}

/// Réponse représentant une publication programmée (enums MAJUSCULES, dates ISO).
export class ScheduledPostResponseDto {
  @ApiProperty({ format: 'uuid', example: 'b3f1c2d4-0000-0000-0000-000000000abc' })
  id!: string

  @ApiProperty({ format: 'uuid', example: '00000000-0000-0000-0000-000000000001' })
  userId!: string

  @ApiProperty({
    description: 'Plateformes ciblées',
    example: ['FACEBOOK', 'INSTAGRAM'],
    isArray: true,
  })
  platforms!: string[]

  @ApiProperty({ nullable: true, example: 'Publication programmée Zernio 🚀' })
  message!: string | null

  @ApiProperty({ nullable: true, example: 'Légende Instagram' })
  caption!: string | null

  @ApiProperty({
    nullable: true,
    example: 'https://api.zernio.com/uploads/social/2026/07/uuid.jpg',
  })
  imageUrl!: string | null

  @ApiProperty({
    description: 'URL publique de la vidéo (planification TikTok)',
    nullable: true,
    example: 'https://api.zernio.com/uploads/social/2026/07/clip.mp4',
  })
  videoUrl!: string | null

  @ApiProperty({
    description:
      'Options spécifiques par plateforme (ex. métadonnées YouTube). null si aucune option n’a été fournie.',
    type: ScheduledPlatformOptionsResponseDto,
    nullable: true,
    example: null,
  })
  platformOptions!: ScheduledPlatformOptionsResponseDto | null

  @ApiProperty({ example: '2026-07-01T09:30:00.000Z' })
  scheduledAt!: string

  @ApiProperty({
    description: 'État courant de la planification',
    enum: ['SCHEDULED', 'PROCESSING', 'PUBLISHED', 'FAILED', 'CANCELLED'],
    example: 'SCHEDULED',
  })
  status!: string

  @ApiProperty({
    description: 'Nombre de tentatives de traitement par le scheduler',
    example: 0,
  })
  attempts!: number

  @ApiProperty({
    description: 'Dernier message d’erreur agrégé (présent si FAILED)',
    nullable: true,
    example: null,
  })
  lastError!: string | null

  @ApiProperty({
    description: 'Horodatage du traitement effectif (succès/échec/annulation)',
    nullable: true,
    example: null,
  })
  processedAt!: string | null

  @ApiProperty({ example: '2026-06-28T12:00:00.000Z' })
  createdAt!: string

  @ApiProperty({ example: '2026-06-28T12:00:00.000Z' })
  updatedAt!: string
}
