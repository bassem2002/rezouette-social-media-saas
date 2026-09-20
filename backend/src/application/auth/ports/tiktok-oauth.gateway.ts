import { SocialPlatform } from '../../../domain/shared/ports/social-provider.port.js'

/// Compte TikTok normalisé renvoyé par la passerelle OAuth, prêt à être
/// persisté. Découple le use case du format brut de l'API TikTok.
export interface ConnectedTikTokAccount {
  platform: Extract<SocialPlatform, 'tiktok'>
  /// `open_id` TikTok : identifiant stable du compte pour cette app.
  externalAccountId: string
  accountName: string
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: Date | null
  scopes: string[]
  metadata: Record<string, unknown> | null
}

/// Jeux de tokens rafraîchis. TikTok fait tourner le refresh_token à chaque
/// rafraîchissement (rotation) — on persiste donc les deux + la nouvelle
/// expiration de l'access token (~24 h).
export interface RefreshedTikTokTokens {
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: Date | null
}

/// Port (DIP) : le use case dépend de cette abstraction, jamais de TikTok/axios.
/// TikTok impose OAuth 2.0 + PKCE : l'URL d'autorisation porte un `code_challenge`
/// et l'échange du code exige le `code_verifier` correspondant.
export interface TikTokOAuthGateway {
  /// Construit l'URL du dialogue OAuth TikTok (avec state CSRF + PKCE challenge).
  buildAuthorizationUrl(state: string, codeChallenge: string): string

  /// Échange le code contre les tokens (avec le code_verifier PKCE), récupère
  /// l'identité du compte et renvoie le compte normalisé prêt à persister.
  fetchConnectedAccount(
    code: string,
    codeVerifier: string,
  ): Promise<ConnectedTikTokAccount>

  /// Rafraîchit l'access token (~24 h) à partir du refresh token (~365 j).
  /// Lève une erreur si le refresh token est invalide/expiré (reconnexion requise).
  refreshAccessToken(refreshToken: string): Promise<RefreshedTikTokTokens>
}

export const TIKTOK_OAUTH_GATEWAY = Symbol('TikTokOAuthGateway')
