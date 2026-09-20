import { ApiProperty } from '@nestjs/swagger'

/// Représentation JSON d'une publication archivée. Les enums sont exposés en
/// MAJUSCULES (alignés sur la base), les dates en ISO 8601.
export class SocialPostResponseDto {
  @ApiProperty({ format: 'uuid', example: 'b3f1c2d4-0000-0000-0000-000000000abc' })
  id!: string

  @ApiProperty({ format: 'uuid', example: '00000000-0000-0000-0000-000000000001' })
  userId!: string

  @ApiProperty({
    enum: ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'LINKEDIN', 'YOUTUBE'],
    example: 'INSTAGRAM',
  })
  platform!: 'FACEBOOK' | 'INSTAGRAM' | 'TIKTOK' | 'LINKEDIN' | 'YOUTUBE'

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Id interne du SocialAccount source',
    example: 'a1b2c3d4-0000-0000-0000-000000000def',
  })
  accountId!: string | null

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Id du post côté réseau (présent si PUBLISHED)',
    example: '18166604386450576',
  })
  externalPostId!: string | null

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      "Identifiant de tâche de publication ASYNCHRONE côté fournisseur : `videoId` YouTube, `publish_id` TikTok. Présent dès l'acceptation du média, donc typiquement sur une ligne PENDING dont le traitement n'est pas terminé. Contrat GÉNÉRIQUE (pas spécifique à YouTube). Ce n'est ni un identifiant de post public, ni une URL : ne pas l'afficher tel quel, ni construire un lien à partir de lui — la vidéo peut n'être pas encore visible, voire échouer.",
    example: 'dQw4w9WgXcQ',
  })
  publishId!: string | null

  @ApiProperty({ nullable: true, type: String, example: 'Ma légende Zernio 🚀' })
  caption!: string | null

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'https://picsum.photos/1080',
  })
  mediaUrl!: string | null

  @ApiProperty({ enum: ['PENDING', 'PUBLISHED', 'FAILED'], example: 'PUBLISHED' })
  status!: 'PENDING' | 'PUBLISHED' | 'FAILED'

  @ApiProperty({
    nullable: true,
    type: String,
    description: "Message d'erreur (présent si FAILED)",
    example: null,
  })
  errorMessage!: string | null

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Code d’erreur Graph API Meta (présent si FAILED)',
    example: null,
  })
  metaCode!: number | null

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Sous-code d’erreur Graph API Meta (si présent)',
    example: null,
  })
  metaSubcode!: number | null

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Raison métier normalisée (présent si FAILED)',
    example: null,
  })
  metaReason!: string | null

  @ApiProperty({
    nullable: true,
    type: Boolean,
    description: 'Réessai potentiellement utile (présent si FAILED)',
    example: null,
  })
  retryable!: boolean | null

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    example: '2026-06-23T10:05:00.000Z',
  })
  publishedAt!: string | null

  @ApiProperty({ format: 'date-time', example: '2026-06-23T10:04:59.000Z' })
  createdAt!: string

  @ApiProperty({ format: 'date-time', example: '2026-06-23T10:05:00.000Z' })
  updatedAt!: string
}
