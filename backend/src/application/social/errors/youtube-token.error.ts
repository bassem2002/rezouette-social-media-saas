/// Erreurs du cycle de vie du token YouTube. Erreur APPLICATIVE pure : aucune
/// dépendance à NestJS, Axios ou Prisma — l'infrastructure la lève, la couche
/// présentation décidera plus tard de sa traduction HTTP.

export const YouTubeTokenErrorCode = {
  /// Aucun compte YouTube ne correspond au couple (userId, accountId).
  YOUTUBE_ACCOUNT_NOT_FOUND: 'YOUTUBE_ACCOUNT_NOT_FOUND',
  /// Le refresh est définitivement impossible : l'utilisateur doit réautoriser.
  YOUTUBE_RECONNECT_REQUIRED: 'YOUTUBE_RECONNECT_REQUIRED',
  /// Le compte n'a jamais reçu de refresh token (consentement sans offline).
  YOUTUBE_REFRESH_TOKEN_MISSING: 'YOUTUBE_REFRESH_TOKEN_MISSING',
  /// Échec transitoire (réseau, 5xx) : les credentials restent valides.
  YOUTUBE_TOKEN_REFRESH_FAILED: 'YOUTUBE_TOKEN_REFRESH_FAILED',
  /// Réponse 200 mais inexploitable : on ne touche pas aux tokens existants.
  YOUTUBE_INVALID_REFRESH_RESPONSE: 'YOUTUBE_INVALID_REFRESH_RESPONSE',
  /// Deux groupes de credentials distincts pour un même consentement.
  YOUTUBE_CREDENTIAL_GROUP_CONFLICT: 'YOUTUBE_CREDENTIAL_GROUP_CONFLICT',
  /// Credentials d'application absents ou refusés par Google (erreur d'exploitation).
  YOUTUBE_NOT_CONFIGURED: 'YOUTUBE_NOT_CONFIGURED',
} as const

export type YouTubeTokenErrorCode =
  (typeof YouTubeTokenErrorCode)[keyof typeof YouTubeTokenErrorCode]

/// Erreur normalisée du cycle de vie du token. `retryable` distingue un incident
/// transitoire (réessayer plus tard a du sens) d'un état terminal (reconnexion
/// utilisateur ou correction de configuration requise).
///
/// ⚠️ Le message ne doit JAMAIS contenir de token, de secret ni de corps brut.
export class YouTubeTokenError extends Error {
  constructor(
    readonly code: YouTubeTokenErrorCode,
    message: string,
    readonly retryable: boolean = false,
  ) {
    super(message)
    this.name = 'YouTubeTokenError'
  }

  /// Vrai si l'utilisateur doit relancer un flux OAuth (aucun refresh ne peut
  /// plus aboutir). Sert au marquage `needsReconnect` du groupe de chaînes.
  get requiresReconnect(): boolean {
    return (
      this.code === YouTubeTokenErrorCode.YOUTUBE_RECONNECT_REQUIRED ||
      this.code === YouTubeTokenErrorCode.YOUTUBE_REFRESH_TOKEN_MISSING
    )
  }
}
