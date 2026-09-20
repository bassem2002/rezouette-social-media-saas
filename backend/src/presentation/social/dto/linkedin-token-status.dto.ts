import { ApiProperty } from '@nestjs/swagger'
import { TokenStatus } from '../../../domain/social/token-status.enum.js'

/// Réponse de GET /social/linkedin/token-status. Statut du token du compte membre
/// LinkedIn (compte unique par plateforme). L'access token vit ~60 j et n'est PAS
/// rafraîchissable (app standard) : `RECONNECT_REQUIRED` = nouveau flux OAuth requis.
export class LinkedInTokenStatusDto {
  @ApiProperty({
    description: 'Statut du token du compte LinkedIn (membre)',
    enum: TokenStatus,
    example: TokenStatus.VALID,
  })
  status!: TokenStatus

  @ApiProperty({
    description: 'Nom affiché du membre LinkedIn connecté',
    type: String,
    nullable: true,
    example: 'Jane Doe',
  })
  accountName!: string | null

  @ApiProperty({
    description:
      "Date d'expiration de l'access token LinkedIn (ISO 8601, ~60 j), si connue",
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-09-22T12:00:00.000Z',
  })
  expiresAt!: string | null

  @ApiProperty({
    description:
      'Vrai si le compte requiert une reconnexion OAuth (token expiré/refusé — pas de refresh)',
    example: false,
  })
  needsReconnect!: boolean
}
