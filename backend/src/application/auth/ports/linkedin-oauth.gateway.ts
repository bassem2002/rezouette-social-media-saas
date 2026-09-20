import { SocialPlatform } from '../../../domain/shared/ports/social-provider.port.js'

/// Compte membre LinkedIn normalisé renvoyé par la passerelle OAuth, prêt à être
/// persisté. Découple le use case du format brut de LinkedIn (OIDC + userinfo).
export interface ConnectedLinkedInMember {
  platform: Extract<SocialPlatform, 'linkedin'>
  /// URN du membre : `urn:li:person:{sub}` (claim `sub` de l'id_token OIDC).
  externalAccountId: string
  accountName: string
  accessToken: string
  /// LinkedIn n'émet PAS de refresh token pour les apps standard → toujours null.
  refreshToken: null
  /// Expiration de l'access token (~60 j).
  tokenExpiresAt: Date | null
  scopes: string[]
  metadata: Record<string, unknown> | null
}

/// Port (DIP) : le use case dépend de cette abstraction, jamais de LinkedIn/axios/jose.
/// LinkedIn impose OAuth 2.0 Authorization Code (client confidentiel) + OIDC pour
/// l'identité. Pas de PKCE (le `state` signé + nonce à usage unique suffisent).
export interface LinkedInOAuthGateway {
  /// Garde de configuration : lève une 503 explicite si LinkedIn n'est pas configuré.
  /// Appelée en tête des handlers OAuth pour un échec propre plutôt qu'obscur.
  assertConfigured(): void

  /// Construit l'URL du dialogue OAuth LinkedIn (avec `state` CSRF signé + `nonce` OIDC).
  buildAuthorizationUrl(state: string, nonce: string): string

  /// Échange le code contre les tokens, VALIDE cryptographiquement l'id_token OIDC
  /// (RS256/JWKS + iss/aud/exp/iat + nonce attendu), en tire l'identité du membre et
  /// renvoie le compte normalisé prêt à persister. Lève une erreur si la validation
  /// échoue (jamais de contournement d'une signature invalide).
  fetchConnectedMember(
    code: string,
    expectedNonce: string,
  ): Promise<ConnectedLinkedInMember>
}

export const LINKEDIN_OAUTH_GATEWAY = Symbol('LinkedInOAuthGateway')
