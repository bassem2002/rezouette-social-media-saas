/// Formes brutes des réponses TikTok API v2 utilisées par l'OAuth.
/// Endpoints : https://open.tiktokapis.com/v2/oauth/token/ et /v2/user/info/.

/// Réponse du endpoint token (échange du code ou refresh). En cas de succès,
/// les champs sont au niveau racine ; en cas d'erreur, `error`/`error_description`.
export interface TikTokTokenResponse {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  refresh_expires_in?: number
  open_id?: string
  scope?: string
  token_type?: string
  /// Présents uniquement en cas d'échec.
  error?: string
  error_description?: string
  log_id?: string
}

export interface TikTokUser {
  open_id: string
  union_id?: string
  display_name?: string
  avatar_url?: string
}

/// Réponse de /v2/user/info/. `error.code === 'ok'` signale le succès.
export interface TikTokUserInfoResponse {
  data?: {
    user?: TikTokUser
  }
  error?: {
    code?: string
    message?: string
    log_id?: string
  }
}
