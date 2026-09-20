import { ApiProperty } from '@nestjs/swagger'
import { TokenStatus } from '../../../domain/social/token-status.enum.js'

/// Réponse de GET /social/tiktok/token-status. Statut du token du compte TikTok
/// (compte unique par plateforme), avec expiration de l'access token (~24 h) et
/// drapeau de reconnexion (levé quand le refresh a définitivement échoué).
export class TikTokTokenStatusDto {
  @ApiProperty({
    description: 'Statut du token du compte TikTok',
    enum: TokenStatus,
    example: TokenStatus.VALID,
  })
  status!: TokenStatus

  @ApiProperty({
    description: 'Nom affiché du compte TikTok connecté',
    type: String,
    nullable: true,
    example: 'zernio_official',
  })
  accountName!: string | null

  @ApiProperty({
    description:
      "Date d'expiration de l'access token TikTok (ISO 8601, ~24 h), si connue",
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-07-03T11:00:00.000Z',
  })
  expiresAt!: string | null

  @ApiProperty({
    description:
      'Vrai si le compte requiert une reconnexion OAuth (refresh token expiré/invalide)',
    example: false,
  })
  needsReconnect!: boolean
}
