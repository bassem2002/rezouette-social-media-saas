/// Port (DIP) du rafraîchissement de token YouTube, distinct du port OAuth de
/// connexion : le refresh est appelé bien plus tard, par la publication, sans
/// aucune interaction utilisateur. Aucune importation de NestJS/Axios/Prisma.

export interface RefreshedYouTubeToken {
  accessToken: string
  /// Google ne fait PAS tourner le refresh token à chaque appel : `null` signifie
  /// « inchangé », jamais « supprimé ». L'appelant conserve alors l'existant.
  refreshToken: string | null
  tokenExpiresAt: Date
  /// Scopes accordés si Google les renvoie, sinon `null` (= inchangés). On ne
  /// fabrique jamais de scope, et un scope retiré n'est jamais réputé accordé.
  scopes: string[] | null
}

export interface YouTubeTokenGateway {
  /// Garde de configuration : lève une erreur 503 explicite si l'intégration
  /// n'est pas configurée. Aucun appel réseau n'est émis tant qu'elle échoue.
  assertConfigured(): void

  /// Échange un refresh token contre un access token frais. Lève une
  /// `YouTubeTokenError` normalisée en cas d'échec (invalid_grant, configuration,
  /// incident réseau, réponse inexploitable).
  refreshAccessToken(refreshToken: string): Promise<RefreshedYouTubeToken>
}

export const YOUTUBE_TOKEN_GATEWAY = Symbol('YouTubeTokenGateway')
