import { ApiProperty } from '@nestjs/swagger'
import { TokenStatus } from '../../../domain/social/token-status.enum.js'

/// Réponse de GET /social/meta/token-status. Statut par plateforme + expiration
/// de référence + drapeau global de reconnexion.
export class TokenStatusDto {
  @ApiProperty({
    description: 'Statut du token de la Page Facebook (null si non connectée)',
    enum: TokenStatus,
    nullable: true,
    example: TokenStatus.VALID,
  })
  facebook!: TokenStatus | null

  @ApiProperty({
    description: 'Statut du token du compte Instagram (null si non connecté)',
    enum: TokenStatus,
    nullable: true,
    example: TokenStatus.VALID,
  })
  instagram!: TokenStatus | null

  @ApiProperty({
    description: "Date d'expiration du token de référence (ISO 8601), si connue",
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-09-20T12:00:00.000Z',
  })
  expiresAt!: string | null

  @ApiProperty({
    description:
      'Vrai si au moins un compte requiert une reconnexion OAuth (ex. erreur Meta 190+460)',
    example: false,
  })
  needsReconnect!: boolean
}
