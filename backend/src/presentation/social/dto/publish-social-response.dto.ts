import { ApiProperty } from '@nestjs/swagger'
import { SUPPORTED_PUBLISH_PLATFORMS } from './publish-social.dto.js'

/// Résultat de publication pour une seule plateforme au sein de l'orchestrateur.
/// `externalPostId` est présent en cas de succès, `error` en cas d'échec.
export class PublishSocialResultDto {
  @ApiProperty({
    description: 'Plateforme concernée par ce résultat',
    enum: SUPPORTED_PUBLISH_PLATFORMS,
    example: 'facebook',
  })
  platform!: string

  @ApiProperty({
    description: 'Indique si la publication sur cette plateforme a réussi',
    example: true,
  })
  success!: boolean

  @ApiProperty({
    description: 'Identifiant du post créé côté Meta (présent si success=true)',
    example: '1248337431686438_122095334337377130',
    required: false,
    nullable: true,
  })
  externalPostId?: string

  @ApiProperty({
    description: "Message d'erreur lisible (présent si success=false)",
    example: 'Le téléchargement du contenu prend trop de temps',
    required: false,
    nullable: true,
  })
  error?: string

  @ApiProperty({
    description: 'Code d’erreur Graph API Meta (échec Meta uniquement)',
    example: -2,
    required: false,
  })
  code?: number

  @ApiProperty({
    description: 'Sous-code d’erreur Graph API Meta (si présent)',
    example: 2207003,
    required: false,
  })
  subcode?: number

  @ApiProperty({
    description:
      'Raison métier normalisée (échec). Valeurs Meta, TikTok ou LinkedIn selon la plateforme.',
    enum: [
      'TOKEN_EXPIRED',
      'RECONNECT_REQUIRED',
      'USER_ACCESS_RESTRICTED',
      'PERMISSION_DENIED',
      'INVALID_PARAMETER',
      'TIMEOUT',
      'MEDIA_UNREACHABLE',
      'MEDIA_NOT_READY',
      'UNKNOWN_META_ERROR',
      'RATE_LIMITED',
      'INVALID_MEDIA',
      'PUBLISH_FAILED',
      'UNKNOWN_TIKTOK_ERROR',
      'PRODUCT_NOT_APPROVED',
      'INVALID_AUTHOR',
      'MEDIA_UPLOAD_FAILED',
      'PUBLISHING_NOT_CONFIGURED',
      'UNKNOWN_LINKEDIN_ERROR',
    ],
    example: 'TIMEOUT',
    required: false,
  })
  reason?: string

  @ApiProperty({
    description: 'Le réessai a-t-il une chance d’aboutir ?',
    example: true,
    required: false,
  })
  retryable?: boolean

  @ApiProperty({
    description: 'Action recommandée au client',
    example: 'RETRY_LATER',
    required: false,
  })
  action?: string
}

/// Réponse globale de POST /social/publish.
export class PublishSocialResponseDto {
  @ApiProperty({
    description:
      'true si toutes les plateformes ont réussi, false si au moins une a échoué',
    example: true,
  })
  success!: boolean

  @ApiProperty({
    description: 'Résultat détaillé par plateforme (ordre de la requête)',
    type: [PublishSocialResultDto],
  })
  results!: PublishSocialResultDto[]
}
