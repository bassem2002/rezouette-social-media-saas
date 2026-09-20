/// Port (DIP) du flux OAuth YouTube. Le use case dépend de cette abstraction,
/// jamais de Google/axios/NestJS. Aucune importation de framework ici.

/// Métadonnées de chaîne conservées dans `SocialAccount.metadata` (JSON) — ni
/// colonne dédiée, ni couplage du schéma à YouTube.
export interface YouTubeChannelMetadata {
  thumbnailUrl?: string
  customUrl?: string
  /// Playlist « uploads » de la chaîne — point d'entrée des vidéos publiées.
  uploadsPlaylistId?: string
  subscriberCount?: string
  videoCount?: string
  hiddenSubscriberCount?: boolean
}

/// Chaîne YouTube autorisée, normalisée et prête à être persistée.
export interface ConnectedYouTubeChannel {
  /// Identifiant de la chaîne côté Google — sert d'`externalAccountId`.
  channelId: string
  channelTitle: string
  accessToken: string
  /// Google n'émet un refresh token qu'au premier consentement (ou avec
  /// `prompt=consent`) : il peut légitimement être absent d'une reconnexion.
  /// Le use case NE DOIT JAMAIS écraser un refresh token existant par null.
  refreshToken: string | null
  /// Expiration de l'access token (~1 h) — la plus courte de tous les réseaux.
  tokenExpiresAt: Date
  /// Scopes RÉELLEMENT accordés (réponse du token endpoint), à défaut ceux
  /// demandés. Ne présume jamais qu'un scope demandé a été accordé.
  scopes: string[]
  metadata: YouTubeChannelMetadata
}

export interface YouTubeOAuthGateway {
  /// Garde de configuration : lève une 503 explicite si l'intégration YouTube
  /// ou la sécurité OAuth partagée ne sont pas configurées. Appelée en tête de
  /// chaque handler — aucun appel réseau n'est émis tant qu'elle échoue.
  assertConfigured(): void

  /// Construit l'URL du dialogue de consentement Google (state signé + PKCE).
  buildAuthorizationUrl(input: { state: string; codeChallenge: string }): string

  /// Échange le code contre des tokens (PKCE), puis liste les chaînes du compte
  /// autorisé. Lève une erreur normalisée si l'échange échoue, si la réponse est
  /// inexploitable, ou si le compte ne possède aucune chaîne.
  exchangeCodeAndFetchChannels(input: {
    code: string
    codeVerifier: string
  }): Promise<ConnectedYouTubeChannel[]>
}

export const YOUTUBE_OAUTH_GATEWAY = Symbol('YouTubeOAuthGateway')
