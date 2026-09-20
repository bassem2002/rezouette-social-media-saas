import { SocialPlatform } from '../../../domain/shared/ports/social-provider.port.js'

/// Compte social normalisé renvoyé par la passerelle OAuth, prêt à être
/// persisté. Découple le use case du format brut de l'API Meta.
export interface ConnectedSocialAccount {
  platform: Extract<SocialPlatform, 'facebook' | 'instagram'>
  externalAccountId: string
  accountName: string
  accessToken: string
  tokenExpiresAt: Date | null
  metadata: Record<string, unknown> | null
}

/// Port (DIP) : le use case dépend de cette abstraction, jamais de Meta/axios.
export interface MetaOAuthGateway {
  /// Construit l'URL du dialogue OAuth Meta (avec state CSRF).
  buildAuthorizationUrl(state: string): string

  /// Échange le code, récupère Pages + comptes IG liés, renvoie les comptes.
  fetchConnectedAccounts(code: string): Promise<ConnectedSocialAccount[]>
}

export const META_OAUTH_GATEWAY = Symbol('MetaOAuthGateway')
