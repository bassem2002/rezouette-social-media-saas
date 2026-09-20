import { ApiProperty } from '@nestjs/swagger'
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'

/// Forme UUID (8-4-4-4-12 hex) SANS contrainte de version/variant : accepte les
/// UUID de test "nil-like" (ex. ...001) que @IsUUID() rejette.
const UUID_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/// Corps de POST /social/facebook/publish (endpoint de production).
export class PublishFacebookDto {
  @ApiProperty({
    description: "Identifiant de l'utilisateur Zernio propriétaire de la Page",
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @IsString()
  @Matches(UUID_SHAPE, { message: 'userId doit être au format UUID' })
  userId!: string

  @ApiProperty({
    description: 'Message texte à publier sur le fil de la Page Facebook',
    example: 'Nouvelle publication Zernio 🚀',
    minLength: 1,
    maxLength: 5000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string

  @ApiProperty({
    description:
      "URL publique de l'image. Si fournie, la publication utilise POST /{pageId}/photos ; sinon POST /{pageId}/feed.",
    example: 'https://picsum.photos/1080',
    required: false,
  })
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  imageUrl?: string
}
