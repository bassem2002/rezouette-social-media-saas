import { ApiProperty } from '@nestjs/swagger'

/// Réponses documentées pour Swagger. Ces classes ne portent aucune logique :
/// elles décrivent la forme JSON renvoyée par le SocialController.

export class FacebookTestPostResponseDto {
  @ApiProperty({
    description: 'ID du post créé côté Facebook (format {pageId}_{postId})',
    example: '123456789_987654321',
  })
  id!: string
}

export class InstagramTestPostResponseDto {
  @ApiProperty({
    description: 'ID du média Instagram publié',
    example: '17900000000000000',
  })
  id!: string
}

export class FacebookPageDto {
  @ApiProperty({ example: '123456789012345' })
  id!: string

  @ApiProperty({ example: 'Ma Page Zernio' })
  name!: string
}

export class InstagramAccountDto {
  @ApiProperty({ example: '17841400000000000' })
  id!: string

  @ApiProperty({ example: 'zernio.app' })
  username!: string
}

export class ConnectedAccountDto {
  @ApiProperty({ format: 'uuid', example: 'b3f1c2d4-0000-0000-0000-000000000abc' })
  id!: string

  @ApiProperty({ enum: ['facebook', 'instagram'], example: 'facebook' })
  platform!: string

  @ApiProperty({ example: '123456789012345' })
  externalAccountId!: string

  @ApiProperty({ example: 'Ma Page Zernio' })
  accountName!: string

  @ApiProperty({ enum: ['active', 'expired', 'revoked', 'error'], example: 'active' })
  status!: string

  @ApiProperty({ nullable: true, type: String, example: null })
  tokenExpiresAt!: string | null

  @ApiProperty({ type: [String], example: ['pages_show_list', 'pages_manage_posts'] })
  scopes!: string[]

  @ApiProperty({
    nullable: true,
    type: 'object',
    additionalProperties: true,
    example: { category: 'Software' },
  })
  metadata!: Record<string, unknown> | null

  @ApiProperty({ example: '2026-06-23T10:00:00.000Z' })
  createdAt!: string

  @ApiProperty({ example: '2026-06-23T10:00:00.000Z' })
  updatedAt!: string
}

export class TokenDebugResponseDto {
  @ApiProperty({ example: 'meta' })
  provider!: string

  @ApiProperty({ nullable: true, type: String, example: '123456789012345' })
  pageId!: string | null

  @ApiProperty({ nullable: true, type: String, example: '17841400000000000' })
  instagramId!: string | null

  @ApiProperty({ nullable: true, type: String, example: null })
  tokenExpiration!: string | null

  @ApiProperty({ example: 'page_long_lived' })
  tokenType!: string

  @ApiProperty({
    description: 'Aperçu masqué du token (jamais le secret complet)',
    example: 'EAAB1c...x9Yz',
  })
  tokenPreview!: string
}

export class FacebookProfileResponseDto {
  @ApiProperty({ example: '123456789012345' })
  pageId!: string

  @ApiProperty({ example: 'Ma Page Zernio' })
  pageName!: string
}
