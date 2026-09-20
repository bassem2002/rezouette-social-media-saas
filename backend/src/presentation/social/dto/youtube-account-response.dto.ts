import { ApiProperty } from '@nestjs/swagger'

/// Métadonnées publiques d'une chaîne YouTube. L'identifiant de groupe de
/// credentials (`youtubeCredentialGroupId`) est volontairement ABSENT : détail
/// interne de synchronisation, jamais exposé.
export class YouTubeChannelMetadataDto {
  @ApiProperty({ required: false, example: 'https://yt3.ggpht.com/abc' })
  thumbnailUrl?: string

  @ApiProperty({ required: false, example: '@zernio' })
  customUrl?: string

  @ApiProperty({
    required: false,
    description: 'Playlist « uploads » de la chaîne',
    example: 'UU_xxxxxxxxxxxx',
  })
  uploadsPlaylistId?: string

  @ApiProperty({ required: false, example: '1234' })
  subscriberCount?: string

  @ApiProperty({ required: false, example: '42' })
  videoCount?: string

  @ApiProperty({ required: false, example: false })
  hiddenSubscriberCount?: boolean
}

/// Chaîne YouTube connectée, telle qu'exposée par l'API. AUCUN token.
export class YouTubeAccountResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Id interne du compte social' })
  id!: string

  @ApiProperty({
    description: 'Identifiant de la chaîne côté YouTube',
    example: 'UC_xxxxxxxxxxxx',
  })
  externalAccountId!: string

  @ApiProperty({ example: 'Zernio Channel' })
  accountName!: string

  @ApiProperty({ enum: ['youtube'], example: 'youtube' })
  platform!: 'youtube'

  @ApiProperty({
    enum: ['ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR'],
    example: 'ACTIVE',
  })
  status!: string

  @ApiProperty({ example: false })
  needsReconnect!: boolean

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description: "Expiration de l'access token (~1 h côté Google)",
  })
  tokenExpiresAt!: string | null

  @ApiProperty({
    type: [String],
    description: 'Scopes réellement accordés par Google',
    example: ['https://www.googleapis.com/auth/youtube.upload'],
  })
  scopes!: string[]

  @ApiProperty({
    type: YouTubeChannelMetadataDto,
    nullable: true,
    description: 'Métadonnées de chaîne (sans donnée sensible)',
  })
  metadata!: Record<string, unknown> | null
}
