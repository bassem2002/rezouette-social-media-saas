/// Raisons métier standardisées d'un échec de publication TikTok. Indépendantes
/// du transport (codes d'erreur TikTok, chaînes) : la traduction code → raison est
/// centralisée dans TikTokExceptionMapper (couche application). Pendant Meta pour
/// Meta ([[meta-error-reason-enum]]).
export enum TikTokErrorReason {
  /// Access token invalide/expiré (rafraîchissement à tenter).
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  /// Reconnexion OAuth requise (refresh token expiré/invalide).
  RECONNECT_REQUIRED = 'RECONNECT_REQUIRED',
  /// Scope de publication non accordé (`video.publish` absent / app non auditée).
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  /// Quota de débit dépassé (transitoire).
  RATE_LIMITED = 'RATE_LIMITED',
  /// Anti-spam TikTok : trop de publications / compte restreint.
  SPAM_RISK = 'SPAM_RISK',
  /// Média refusé (format/durée/résolution invalides, URL non vérifiée…).
  INVALID_MEDIA = 'INVALID_MEDIA',
  /// La publication a échoué côté TikTok pendant le traitement asynchrone.
  PUBLISH_FAILED = 'PUBLISH_FAILED',
  /// Délai dépassé / erreur transitoire réseau.
  TIMEOUT = 'TIMEOUT',
  /// Toute autre erreur TikTok non classifiée.
  UNKNOWN_TIKTOK_ERROR = 'UNKNOWN_TIKTOK_ERROR',
}
