import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import { YouTubePublishOptionsDto } from './publish-youtube.dto.js'

/// Forme UUID (8-4-4-4-12 hex) sans contrainte de version : accepte les UUID
/// de test "nil-like" que @IsUUID() rejette.
const UUID_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/// Plateformes prises en charge par l'orchestrateur multi-réseaux.
export const SUPPORTED_PUBLISH_PLATFORMS = [
  'facebook',
  'instagram',
  'tiktok',
  'linkedin',
  'youtube',
] as const
export type PublishPlatform = (typeof SUPPORTED_PUBLISH_PLATFORMS)[number]

/// Corps de POST /social/publish — diffusion d'un même post sur plusieurs réseaux.
export class PublishSocialDto {
  @ApiProperty({
    description: "Identifiant de l'utilisateur Zernio propriétaire des comptes",
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @IsString()
  @Matches(UUID_SHAPE, { message: 'userId doit être au format UUID' })
  userId!: string

  @ApiProperty({
    description: 'Liste des plateformes ciblées par la publication',
    enum: SUPPORTED_PUBLISH_PLATFORMS,
    isArray: true,
    example: ['facebook', 'instagram'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(SUPPORTED_PUBLISH_PLATFORMS, { each: true })
  platforms!: PublishPlatform[]

  @ApiProperty({
    description: 'Texte du post Facebook (fil de la Page)',
    example: 'Nouvelle publication Zernio sur Facebook 🚀',
    required: false,
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string

  @ApiProperty({
    description: 'Légende du post Instagram',
    example: 'Nouvelle publication Zernio sur Instagram 🚀',
    required: false,
    maxLength: 2200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string

  @ApiProperty({
    description:
      "URL publique de l'image (obligatoire pour Instagram, optionnelle pour Facebook).",
    example: 'https://picsum.photos/1080',
    required: false,
  })
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  imageUrl?: string

  @ApiProperty({
    description:
      "URL publique de la vidéo (obligatoire pour TikTok). Doit être accessible par TikTok (mode PULL_FROM_URL).",
    example: 'https://api.zernio.com/uploads/social/2026/07/clip.mp4',
    required: false,
  })
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  videoUrl?: string

  @ApiProperty({
    description:
      "URL d'un lien/article — consommé UNIQUEMENT par LinkedIn (LinkedIn ne scrape pas : fournir titre/description).",
    example: 'https://zernio.com/blog/launch',
    required: false,
  })
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  linkUrl?: string

  @ApiProperty({ description: "Titre de l'aperçu du lien (LinkedIn)", required: false, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  linkTitle?: string

  @ApiProperty({ description: "Description de l'aperçu du lien (LinkedIn)", required: false, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  linkDescription?: string

  @ApiProperty({
    description:
      "Options propres à YouTube (chaîne cible, titre, visibilité, déclarations). REQUISES si `youtube` figure dans `platforms` — l'exigence conditionnelle est vérifiée par l'orchestrateur, qui isole l'échec sur la seule plateforme YouTube. Ignorées par Meta, TikTok et LinkedIn.",
    required: false,
    type: YouTubePublishOptionsDto,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => YouTubePublishOptionsDto)
  youtubeOptions?: YouTubePublishOptionsDto
}
