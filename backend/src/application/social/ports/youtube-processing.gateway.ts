/// Port (DIP) de LECTURE de l'état de traitement d'une vidéo YouTube.
///
/// Volontairement SÉPARÉ de `YouTubeContentGateway` : publier et suivre sont
/// deux préoccupations distinctes, et surtout la réconciliation ne doit PAS
/// dépendre du feature flag d'upload — une vidéo déjà envoyée doit pouvoir
/// terminer son cycle même si les nouveaux uploads ont été désactivés.
///
/// Aucune importation de NestJS, Axios, Prisma, ConfigService ou DTO.

/// État de traitement normalisé, dérivé de `uploadStatus` et `processingStatus`.
export type YouTubeProcessingStatus =
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'rejected'
  | 'deleted'
  | 'terminated'

export interface YouTubeProcessingProgress {
  partsProcessed?: string
  partsTotal?: string
  timeLeftMs?: string
}

export interface YouTubeVideoProcessingResult {
  videoId: string
  status: YouTubeProcessingStatus
  /// Valeurs brutes conservées pour le diagnostic, strictement filtrées : seules
  /// les valeurs documentées par Google traversent la frontière.
  uploadStatus?: string
  processingStatus?: string
  failureReason?: string
  rejectionReason?: string
  progress?: YouTubeProcessingProgress
}

export interface YouTubeProcessingGateway {
  /// Garde de configuration : lève une erreur 503 si l'intégration YouTube n'est
  /// pas configurée. Aucun appel réseau tant qu'elle échoue.
  assertConfigured(): void

  getVideoProcessingStatus(input: {
    accessToken: string
    videoId: string
  }): Promise<YouTubeVideoProcessingResult>
}

export const YOUTUBE_PROCESSING_GATEWAY = Symbol('YouTubeProcessingGateway')
