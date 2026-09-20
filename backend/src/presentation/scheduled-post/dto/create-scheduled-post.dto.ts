import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsStrictBoolean } from '../../../common/validators/is-strict-boolean.validator.js'
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import { YOUTUBE_PRIVACY_STATUSES } from '../../../domain/scheduled-post/value-objects/youtube-schedule-options.js'
import type { YouTubePrivacyStatus } from '../../../domain/scheduled-post/value-objects/youtube-schedule-options.js'
/// Forme UUID (8-4-4-4-12 hex) sans contrainte de version — alignée sur les
/// autres DTO (accepte les UUID "nil-like" de test).
const UUID_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/// Plateformes planifiables. Chacune apporte ses exigences, validées par le use
/// case : `imageUrl` pour Instagram, `videoUrl` pour TikTok et YouTube, et pour
/// YouTube un bloc `platformOptions.youtube` complet (chaîne cible, titre,
/// déclaration COPPA).
const SUPPORTED_SCHEDULE_PLATFORMS = [
  'facebook',
  'instagram',
  'tiktok',
  'linkedin',
  'youtube',
] as const
type SchedulePlatform = (typeof SUPPORTED_SCHEDULE_PLATFORMS)[number]

/// Options YouTube d'une planification. Tous les champs sont OPTIONNELS à ce
/// stade : seule la structure est validée. Les invariants métier (titre requis,
/// vidéo requise…) seront appliqués au checkpoint de planification YouTube.
export class YouTubeScheduleOptionsDto {
  @ApiProperty({ required: false, maxLength: 100, example: 'Ma vidéo Zernio' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string

  @ApiProperty({ required: false, maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string

  @ApiProperty({ required: false, type: [String], example: ['zernio', 'saas'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags?: string[]

  @ApiProperty({
    required: false,
    description: 'Identifiant de catégorie YouTube (chaîne numérique).',
    example: '22',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  categoryId?: string

  @ApiProperty({
    required: false,
    enum: YOUTUBE_PRIVACY_STATUSES as readonly string[],
    example: 'private',
  })
  @IsOptional()
  @IsIn(YOUTUBE_PRIVACY_STATUSES as readonly string[])
  privacyStatus?: YouTubePrivacyStatus

  @ApiProperty({
    required: false,
    description: 'Contenu destiné aux enfants (déclaration COPPA).',
    example: false,
  })
  @IsOptional()
  @IsStrictBoolean()
  madeForKids?: boolean

  @ApiProperty({ required: false, description: 'Contenu synthétique/altéré.' })
  @IsOptional()
  @IsStrictBoolean()
  containsSyntheticMedia?: boolean

  @ApiProperty({ required: false, description: 'Notifier les abonnés.' })
  @IsOptional()
  @IsStrictBoolean()
  notifySubscribers?: boolean

  @ApiProperty({
    required: false,
    format: 'uuid',
    description: 'Chaîne ciblée (id interne du compte social).',
  })
  @IsOptional()
  @IsString()
  @Matches(UUID_SHAPE, { message: 'accountId doit être au format UUID' })
  accountId?: string
}

/// Conteneur des options par plateforme. Un champ inconnu (plateforme non
/// déclarée) est rejeté par le ValidationPipe global (forbidNonWhitelisted).
export class ScheduledPlatformOptionsDto {
  @ApiProperty({ required: false, type: YouTubeScheduleOptionsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => YouTubeScheduleOptionsDto)
  youtube?: YouTubeScheduleOptionsDto
}

/// Corps de POST /social/scheduled-posts — planifie une diffusion différée.
/// Réutilise la liste de plateformes de l'orchestrateur (aucune duplication).
export class CreateScheduledPostDto {
  @ApiProperty({
    description: "Identifiant de l'utilisateur Zernio propriétaire des comptes",
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @IsString()
  @Matches(UUID_SHAPE, { message: 'userId doit être au format UUID' })
  userId!: string

  @ApiProperty({
    description: 'Plateformes ciblées par la publication programmée (Facebook, Instagram, TikTok)',
    enum: SUPPORTED_SCHEDULE_PLATFORMS,
    isArray: true,
    example: ['facebook', 'instagram'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(SUPPORTED_SCHEDULE_PLATFORMS, { each: true })
  platforms!: SchedulePlatform[]

  @ApiProperty({
    description: 'Texte du post Facebook (fil de la Page)',
    example: 'Publication programmée Zernio 🚀',
    required: false,
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string

  @ApiProperty({
    description: 'Légende du post Instagram',
    example: 'Publication programmée Zernio 🚀',
    required: false,
    maxLength: 2200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string

  @ApiProperty({
    description:
      "URL publique de l'image (obligatoire si Instagram est ciblé, optionnelle pour Facebook).",
    example: 'https://picsum.photos/1080',
    required: false,
  })
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  imageUrl?: string

  @ApiProperty({
    description:
      "URL publique de la vidéo (obligatoire si TikTok est ciblé). Doit être accessible par TikTok (mode PULL_FROM_URL).",
    example: 'https://api.zernio.com/uploads/social/2026/07/clip.mp4',
    required: false,
  })
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  videoUrl?: string

  @ApiProperty({
    description:
      "Options spécifiques par plateforme (ex. métadonnées YouTube). Mémorisées avec la planification ; ne déclenchent aucune publication à ce stade.",
    required: false,
    type: ScheduledPlatformOptionsDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ScheduledPlatformOptionsDto)
  platformOptions?: ScheduledPlatformOptionsDto

  @ApiProperty({
    description:
      "Date/heure de publication au format ISO 8601 (UTC). Doit être dans le futur.",
    example: '2026-07-01T09:30:00.000Z',
  })
  @IsDateString()
  scheduledAt!: string
}
