import { ApiProperty } from '@nestjs/swagger'

/// Réponse de POST /media/upload.
export class UploadMediaResponseDto {
  @ApiProperty({
    description: 'URL publique absolue du média (utilisable par Meta/TikTok).',
    example: 'https://api.zernio.com/uploads/social/2026/06/uuid.mp4',
  })
  url!: string

  @ApiProperty({
    description: 'Nom de fichier généré (uuid + extension).',
    example: 'uuid.mp4',
  })
  filename!: string

  @ApiProperty({
    description: 'Taille du fichier en octets.',
    example: 245678,
  })
  size!: number

  @ApiProperty({
    description: 'Nature du média détectée à partir du type MIME.',
    enum: ['image', 'video'],
    example: 'video',
  })
  mediaType!: 'image' | 'video'
}
