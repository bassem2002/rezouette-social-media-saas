/// Formes brutes des réponses Google/YouTube réellement consommées. Volontairement
/// partielles et permissives (`?`) : on ne modélise que ce qui est lu, et chaque
/// champ est revalidé avant usage. Ces types ne franchissent JAMAIS la frontière
/// de l'infrastructure.

/// Réponse de POST {oauthTokenUrl} (grant_type=authorization_code).
export interface GoogleTokenResponse {
  access_token?: string
  /// Absent d'une reconnexion si Google ne réémet pas de refresh token.
  refresh_token?: string
  expires_in?: number
  token_type?: string
  /// Scopes réellement accordés, séparés par des espaces.
  scope?: string
  error?: string
  error_description?: string
}

interface YouTubeThumbnail {
  url?: string
  width?: number
  height?: number
}

interface YouTubeChannelSnippet {
  title?: string
  description?: string
  customUrl?: string
  thumbnails?: {
    default?: YouTubeThumbnail
    medium?: YouTubeThumbnail
    high?: YouTubeThumbnail
  }
}

interface YouTubeChannelContentDetails {
  relatedPlaylists?: {
    uploads?: string
    likes?: string
  }
}

interface YouTubeChannelStatistics {
  subscriberCount?: string
  videoCount?: string
  viewCount?: string
  hiddenSubscriberCount?: boolean
}

export interface YouTubeChannelItem {
  id?: string
  snippet?: YouTubeChannelSnippet
  contentDetails?: YouTubeChannelContentDetails
  statistics?: YouTubeChannelStatistics
}

/// Réponse de GET {apiBaseUrl}/channels?mine=true.
export interface YouTubeChannelListResponse {
  items?: YouTubeChannelItem[]
  pageInfo?: { totalResults?: number; resultsPerPage?: number }
  error?: { code?: number; message?: string }
}

/// Sous-ensemble de la ressource vidéo lu par la réconciliation
/// (`part=status,processingDetails`). Volontairement permissif : chaque champ
/// est revalidé contre une nomenclature avant usage.
export interface YouTubeVideoStatusItem {
  id?: string
  status?: {
    uploadStatus?: string
    failureReason?: string
    rejectionReason?: string
    privacyStatus?: string
  }
  processingDetails?: {
    processingStatus?: string
    processingFailureReason?: string
    processingProgress?: {
      partsTotal?: string
      partsProcessed?: string
      timeLeftMs?: string
    }
  }
}

/// Réponse de GET {apiBaseUrl}/videos?id=…&part=status,processingDetails.
export interface YouTubeVideoStatusResponse {
  items?: YouTubeVideoStatusItem[]
  error?: { code?: number; message?: string }
}
