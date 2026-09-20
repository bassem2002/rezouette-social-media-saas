import { ApiProperty } from '@nestjs/swagger'
import { YouTubeErrorReason } from '../../../domain/social/errors/youtube-error-reason.enum.js'

/// Réponse de POST /social/youtube/publish.
///
/// Un échec MÉTIER (publication désactivée, token, scope, quota…) est renvoyé
/// avec `success: false` et un diagnostic normalisé — pas avec un code d'erreur
/// HTTP : la publication a bien été traitée et archivée, elle a simplement
/// échoué. Seules la configuration absente (503) et la validation du corps (400)
/// produisent une erreur HTTP.
export class YouTubePublishResponseDto {
  @ApiProperty({ example: true })
  success!: boolean

  @ApiProperty({ enum: ['youtube'], example: 'youtube' })
  platform!: 'youtube'

  @ApiProperty({
    description:
      "Vrai si YouTube a accepté la vidéo mais l'encode encore. La publication n'est PAS effective : l'historique reste PENDING jusqu'à confirmation.",
    required: false,
    example: true,
  })
  processing?: boolean

  @ApiProperty({
    description:
      'Identifiant de la vidéo côté YouTube, connu dès son acceptation.',
    required: false,
    nullable: true,
    type: String,
    example: 'dQw4w9WgXcQ',
  })
  publishId?: string | null

  @ApiProperty({
    description:
      "Identifiant public de la publication. Renseigné UNIQUEMENT lorsque le traitement est terminé.",
    required: false,
    nullable: true,
    type: String,
    example: null,
  })
  externalPostId?: string | null

  @ApiProperty({
    description: "Message d'erreur lisible (si success=false).",
    required: false,
    type: String,
  })
  error?: string

  @ApiProperty({
    description: "Raison métier normalisée de l'échec.",
    required: false,
    enum: YouTubeErrorReason,
    example: YouTubeErrorReason.PUBLISHING_NOT_CONFIGURED,
  })
  reason?: string

  @ApiProperty({
    description: 'Un réessai a-t-il une chance d’aboutir ?',
    required: false,
    example: false,
  })
  retryable?: boolean

  @ApiProperty({
    description: 'Action recommandée (reconnexion, correction, réessai…).',
    required: false,
    example: 'CONFIGURE_PUBLISHING',
  })
  action?: string
}
