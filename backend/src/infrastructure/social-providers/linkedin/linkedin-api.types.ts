/// Réponse de l'échange code → tokens (POST /oauth/v2/accessToken).
export interface LinkedInTokenResponse {
  access_token?: string
  expires_in?: number
  /// Jeton OIDC (JWT RS256) présent car le scope `openid` est demandé.
  id_token?: string
  scope?: string
  token_type?: string
  /// LinkedIn peut renvoyer un refresh_token uniquement pour les partenaires approuvés.
  refresh_token?: string
  refresh_token_expires_in?: number
  error?: string
  error_description?: string
}

/// Claims utiles de l'id_token OIDC LinkedIn (après validation cryptographique).
export interface LinkedInIdTokenClaims {
  /// Identifiant stable du membre → `urn:li:person:{sub}`.
  sub: string
  name?: string
  email?: string
  picture?: string
  nonce?: string
}

/// Réponse de GET /v2/userinfo (confirmation/fallback d'identité OIDC).
export interface LinkedInUserInfoResponse {
  sub: string
  name?: string
  email?: string
  picture?: string
}
