import { ApiProperty } from '@nestjs/swagger'

/// Réponse standardisée des endpoints de production /publish.
/// Forme unique succès/échec : `externalPostId` en cas de succès ; en cas
/// d'échec Meta, le diagnostic normalisé (code/subcode/reason/retryable/action)
/// produit par MetaExceptionMapper.
export class PublishResponseDto {
  @ApiProperty({
    description: 'true si la publication a réussi, false sinon',
    example: false,
  })
  success!: boolean

  @ApiProperty({
    description: 'Plateforme cible de la publication',
    enum: ['facebook', 'instagram', 'tiktok'],
    example: 'instagram',
  })
  platform!: 'facebook' | 'instagram' | 'tiktok'

  @ApiProperty({
    description: 'Identifiant du post créé côté Meta (présent si success=true)',
    example: '1248337431686438_122095334337377130',
    required: false,
    nullable: true,
  })
  externalPostId?: string

  @ApiProperty({
    description: 'Code d’erreur Graph API Meta (présent si success=false)',
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
      'Raison métier normalisée (présent si success=false). Valeurs Meta ou TikTok selon la plateforme.',
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
      'SPAM_RISK',
      'INVALID_MEDIA',
      'PUBLISH_FAILED',
      'UNKNOWN_TIKTOK_ERROR',
    ],
    example: 'TIMEOUT',
    required: false,
  })
  reason?: string

  @ApiProperty({
    description: 'Le réessai a-t-il une chance d’aboutir ? (présent si success=false)',
    example: true,
    required: false,
  })
  retryable?: boolean

  @ApiProperty({
    description: 'Action recommandée au client (présent si success=false)',
    example: 'RETRY_LATER',
    required: false,
  })
  action?: string
}
