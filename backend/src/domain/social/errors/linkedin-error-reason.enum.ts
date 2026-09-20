/// Raisons métier standardisées d'un échec de publication LinkedIn. Indépendantes
/// du transport (codes HTTP / serviceErrorCode LinkedIn) : la traduction
/// code → raison est centralisée dans LinkedInExceptionMapper (couche application).
/// Pendant Meta ([[meta-error-reason-enum]]) et TikTok ([[tiktok-error-reason-enum]]).
export enum LinkedInErrorReason {
  /// Access token invalide/expiré (LinkedIn : ~60 j, non rafraîchissable).
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  /// Reconnexion OAuth requise (pas de refresh token pour une app standard).
  RECONNECT_REQUIRED = 'RECONNECT_REQUIRED',
  /// Permission/scope insuffisant (`w_member_social` absent).
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  /// Produit LinkedIn non approuvé (ex. endpoint versionné non provisionné).
  PRODUCT_NOT_APPROVED = 'PRODUCT_NOT_APPROVED',
  /// Auteur invalide (URN membre incorrect / non autorisé).
  INVALID_AUTHOR = 'INVALID_AUTHOR',
  /// Média refusé (format/taille image non conformes).
  INVALID_MEDIA = 'INVALID_MEDIA',
  /// Échec de l'upload du média (initialisation ou transfert binaire).
  MEDIA_UPLOAD_FAILED = 'MEDIA_UPLOAD_FAILED',
  /// Quota de débit dépassé (transitoire).
  RATE_LIMITED = 'RATE_LIMITED',
  /// Paramètre de requête invalide (payload mal formé).
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  /// Publication LinkedIn non configurée (LINKEDIN_PUBLISH_API=disabled).
  PUBLISHING_NOT_CONFIGURED = 'PUBLISHING_NOT_CONFIGURED',
  /// Délai dépassé / erreur transitoire réseau.
  TIMEOUT = 'TIMEOUT',
  /// Toute autre erreur LinkedIn non classifiée.
  UNKNOWN_LINKEDIN_ERROR = 'UNKNOWN_LINKEDIN_ERROR',
}
