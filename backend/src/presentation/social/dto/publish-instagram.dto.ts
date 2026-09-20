import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator'

/// Forme UUID (8-4-4-4-12 hex) sans contrainte de version : accepte les UUID
/// de test "nil-like" que @IsUUID() rejette.
const UUID_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/// Corps de POST /social/instagram/publish (endpoint de production).
export class PublishInstagramDto {
  @ApiProperty({
    description: "Identifiant de l'utilisateur Zernio propriétaire du compte IG",
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @IsString()
  @Matches(UUID_SHAPE, { message: 'userId doit être au format UUID' })
  userId!: string

  @ApiProperty({
    description:
      "URL publique de l'image à publier (doit être accessible par Meta).",
    example: 'https://picsum.photos/1080',
  })
  @IsUrl({ require_tld: false, require_protocol: true })
  imageUrl!: string

  @ApiProperty({
    description: 'Légende du post Instagram',
    example: 'Nouvelle publication Instagram depuis Zernio 🚀',
    required: false,
    default: '',
    maxLength: 2200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string
}
