import { ApiProperty } from '@nestjs/swagger'
import { TokenStatus } from '../../../domain/social/token-status.enum.js'

/// Statut du token d'une chaîne YouTube. Aucun token n'est exposé : seul un
/// booléen indique la présence d'un refresh token.
export class YouTubeTokenStatusDto {
  @ApiProperty({ format: 'uuid', description: 'Id interne du compte social' })
  accountId!: string

  @ApiProperty({ example: 'UC_xxxxxxxxxxxx' })
  channelId!: string

  @ApiProperty({ example: 'Zernio Channel' })
  accountName!: string

  @ApiProperty({ enum: TokenStatus, example: TokenStatus.VALID })
  status!: TokenStatus

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  expiresAt!: string | null

  @ApiProperty({ example: false })
  needsReconnect!: boolean

  @ApiProperty({
    description:
      "Vrai si un refresh token est stocké. Sans lui, l'access token (~1 h) ne peut pas être renouvelé : une reconnexion sera nécessaire.",
    example: true,
  })
  hasRefreshToken!: boolean
}
