import { ApiProperty } from '@nestjs/swagger'
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator'
import {
  YOUTUBE_DESCRIPTION_MAX_LENGTH,
  YOUTUBE_PRIVACY_STATUSES,
  YOUTUBE_TITLE_MAX_LENGTH,
} from '../../../domain/social/value-objects/youtube-video-options.js'
import type { YouTubePrivacyStatus } from '../../../domain/social/value-objects/youtube-video-options.js'
import { IsStrictBoolean } from '../validators/is-strict-boolean.validator.js'

/// Forme UUID (8-4-4-4-12 hex) sans contrainte de version — alignée sur les
/// autres DTO du projet.
export const UUID_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/// Options d'une vidéo YouTube, communes au endpoint dédié et au DTO
/// multi-réseaux. Les trois booléens utilisent la validation STRICTE.
export class YouTubePublishOptionsDto {
  @ApiProperty({
    description: 'Chaîne YouTube cible (id interne du compte social).',
    format: 'uuid',
  })
  @IsString()
  @Matches(UUID_SHAPE, { message: 'accountId doit être au format UUID' })
  accountId!: string

  @ApiProperty({
    description: 'Titre de la vidéo.',
    maxLength: YOUTUBE_TITLE_MAX_LENGTH,
    example: 'Zernio — démonstration produit',
  })
  @IsString()
  @MaxLength(YOUTUBE_TITLE_MAX_LENGTH)
  title!: string

  @ApiProperty({
    required: false,
    maxLength: YOUTUBE_DESCRIPTION_MAX_LENGTH,
    example: 'Présentation des nouveautés.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(YOUTUBE_DESCRIPTION_MAX_LENGTH)
  description?: string

  @ApiProperty({ required: false, type: [String], example: ['zernio', 'saas'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags?: string[]

  @ApiProperty({
    required: false,
    description: 'Catégorie YouTube (identifiant numérique sous forme de chaîne).',
    example: '22',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  categoryId?: string

  @ApiProperty({
    required: false,
    enum: YOUTUBE_PRIVACY_STATUSES as readonly string[],
    description: 'Visibilité de la vidéo. Défaut sûr : private.',
    example: 'private',
  })
  @IsOptional()
  @IsIn(YOUTUBE_PRIVACY_STATUSES as readonly string[])
  privacyStatus?: YouTubePrivacyStatus

  @ApiProperty({
    description:
      'Déclaration COPPA « contenu destiné aux enfants ». Booléen STRICT : une chaîne ou un nombre est refusé.',
    example: false,
  })
  @IsStrictBoolean()
  madeForKids!: boolean

  @ApiProperty({
    required: false,
    description: 'Déclaration de contenu synthétique/altéré. Booléen STRICT.',
  })
  @IsOptional()
  @IsStrictBoolean()
  containsSyntheticMedia?: boolean

  @ApiProperty({
    required: false,
    description: 'Notifier les abonnés de la chaîne. Booléen STRICT.',
  })
  @IsOptional()
  @IsStrictBoolean()
  notifySubscribers?: boolean
}

/// Corps de POST /social/youtube/publish — publication d'une vidéo sur une
/// chaîne YouTube. Reprend les options ci-dessus à plat, avec l'utilisateur et
/// la vidéo. Les champs YouTube du DTO multi-réseaux, eux, sont IMBRIQUÉS.
export class PublishYouTubeDto extends YouTubePublishOptionsDto {
  @ApiProperty({
    description: "Identifiant de l'utilisateur Zernio propriétaire des comptes",
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @IsString()
  @Matches(UUID_SHAPE, { message: 'userId doit être au format UUID' })
  userId!: string

  @ApiProperty({
    description:
      "URL publique de la vidéo à publier. Doit être accessible par le backend.",
    example: 'https://api.zernio.com/uploads/social/2026/08/clip.mp4',
  })
  @IsUrl({ require_tld: false, require_protocol: true })
  videoUrl!: string
}
