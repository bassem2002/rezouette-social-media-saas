import { ApiProperty } from '@nestjs/swagger'
import { YouTubeTokenStatusDto } from './youtube-token-status.dto.js'

/// Réponse de GET /social/youtube/token-status. Un user peut posséder plusieurs
/// chaînes : le statut est une LISTE. Une liste vide signifie « aucune chaîne
/// connectée » — un état normal, distinct de « intégration non configurée » (503).
export class YouTubeTokenStatusResponseDto {
  @ApiProperty({ type: [YouTubeTokenStatusDto] })
  accounts!: YouTubeTokenStatusDto[]
}
