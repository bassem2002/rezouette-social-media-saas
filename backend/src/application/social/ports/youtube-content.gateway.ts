import type { YouTubePrivacyStatus } from '../../../domain/social/value-objects/youtube-video-options.js'

/// Port (DIP) pour la publication d'une vidéo YouTube, distinct des passerelles
/// OAuth et de refresh. Le use case dépend de cette abstraction et NE SAIT JAMAIS
/// comment la vidéo est transférée (upload résumable, adaptateur désactivé…) :
/// la sélection est faite par la factory d'infrastructure.

/// État de traitement rapporté par YouTube juste après réception de la vidéo.
/// YouTube encode en arrière-plan : une vidéo acceptée n'est PAS encore publiée.
export type YouTubeProcessingState = 'processing' | 'succeeded'

export interface PublishYouTubeVideoInput {
  /// Access token frais (garanti par YouTubeTokenService.ensureFresh).
  accessToken: string
  /// Chaîne cible côté YouTube.
  channelId: string
  /// URL publique de la vidéo à transférer.
  videoUrl: string
  title: string
  description?: string
  tags?: string[]
  categoryId?: string
  privacyStatus: YouTubePrivacyStatus
  madeForKids: boolean
  containsSyntheticMedia?: boolean
  notifySubscribers?: boolean
}

export interface PublishYouTubeVideoResult {
  /// Identifiant de la vidéo côté YouTube, connu dès l'acceptation.
  videoId: string
  /// `processing` : reçue mais encore en traitement (l'historique reste PENDING).
  /// `succeeded` : traitement terminé, la vidéo est réellement publiée.
  processingState: YouTubeProcessingState
}

/// Une seule opération à ce stade. La consultation du statut de traitement
/// (`videos.list`) sera ajoutée avec la réconciliation, pas avant : l'ajouter
/// ici maintenant créerait un contrat qu'aucun appelant n'utilise.
export interface YouTubeContentGateway {
  publishVideo(
    input: PublishYouTubeVideoInput,
  ): Promise<PublishYouTubeVideoResult>
}

export const YOUTUBE_CONTENT_GATEWAY = Symbol('YouTubeContentGateway')
