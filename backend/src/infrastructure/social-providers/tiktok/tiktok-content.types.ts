/// Formes brutes des réponses TikTok Content Posting API v2 (Direct Post).

export interface TikTokApiError {
  code?: string
  message?: string
  log_id?: string
}

/// POST /v2/post/publish/creator_info/query/
export interface TikTokCreatorInfoResponse {
  data?: {
    privacy_level_options?: string[]
    comment_disabled?: boolean
    duet_disabled?: boolean
    stitch_disabled?: boolean
    max_video_post_duration_sec?: number
  }
  error?: TikTokApiError
}

/// POST /v2/post/publish/video/init/
export interface TikTokPublishInitResponse {
  data?: {
    publish_id?: string
    /// Présent uniquement en source FILE_UPLOAD : URL de dépôt PRÉ-SIGNÉE des
    /// octets. Secret de fait — jamais journalisée ni renvoyée au client.
    upload_url?: string
  }
  error?: TikTokApiError
}

/// POST /v2/post/publish/status/fetch/
export interface TikTokPublishStatusResponse {
  data?: {
    status?: string
    fail_reason?: string
    /// Orthographe TikTok d'origine ("publicaly").
    publicaly_available_post_id?: number[]
    publicly_available_post_id?: number[]
  }
  error?: TikTokApiError
}
