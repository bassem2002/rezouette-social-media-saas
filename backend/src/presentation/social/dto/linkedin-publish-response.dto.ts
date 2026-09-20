import { ApiProperty } from '@nestjs/swagger'
import { LinkedInErrorReason } from '../../../domain/social/errors/linkedin-error-reason.enum.js'

/// Réponse de POST /social/linkedin/publish. Forme unique succès/échec :
/// `externalPostId` (URN du post) en cas de succès ; sinon diagnostic normalisé
/// (reason/retryable/action) produit par LinkedInExceptionMapper.
export class LinkedInPublishResponseDto {
  @ApiProperty({ description: 'true si la publication a réussi', example: false })
  success!: boolean

  @ApiProperty({ description: 'Plateforme', example: 'linkedin' })
  platform!: 'linkedin'

  @ApiProperty({
    description: 'URN du post créé côté LinkedIn (présent si success=true)',
    example: 'urn:li:share:7211234567890123456',
    required: false,
    nullable: true,
  })
  externalPostId?: string

  @ApiProperty({
    description: "Message d'erreur lisible (présent si success=false)",
    required: false,
    nullable: true,
  })
  error?: string

  @ApiProperty({
    description: 'Raison métier normalisée (présent si success=false)',
    enum: LinkedInErrorReason,
    required: false,
    example: LinkedInErrorReason.PUBLISHING_NOT_CONFIGURED,
  })
  reason?: string

  @ApiProperty({
    description: 'Le réessai a-t-il une chance d’aboutir ?',
    required: false,
    example: false,
  })
  retryable?: boolean

  @ApiProperty({
    description: 'Action recommandée au client',
    required: false,
    example: 'CONFIGURE_PUBLISHING',
  })
  action?: string
}
