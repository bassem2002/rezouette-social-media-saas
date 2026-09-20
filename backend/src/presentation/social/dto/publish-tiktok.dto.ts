import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator'

/// Forme UUID (8-4-4-4-12 hex) sans contrainte de version : accepte les UUID
/// de test "nil-like" que @IsUUID() rejette.
const UUID_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/// Corps de POST /social/tiktok/publish (endpoint de production Direct Post).
export class PublishTikTokDto {
  @ApiProperty({
    description: "Identifiant de l'utilisateur Zernio propriétaire du compte TikTok",
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @IsString()
  @Matches(UUID_SHAPE, { message: 'userId doit être au format UUID' })
  userId!: string

  @ApiProperty({
    description:
      "URL Zernio de la vidéo à publier, telle que renvoyée par l'upload média. " +
      'Les octets sont poussés vers TikTok par le backend (FILE_UPLOAD) : cette ' +
      "URL n'a pas à être joignable depuis Internet, mais doit désigner un média " +
      'hébergé par cette instance. Format vidéo obligatoire (MP4, MOV, WebM).',
    example: 'https://api.zernio.com/uploads/social/2026/07/clip.mp4',
  })
  @IsUrl({ require_tld: false, require_protocol: true })
  videoUrl!: string

  @ApiProperty({
    description: 'Légende / titre du post TikTok',
    example: 'Nouvelle vidéo Zernio sur TikTok 🚀',
    required: false,
    default: '',
    maxLength: 2200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string
}
