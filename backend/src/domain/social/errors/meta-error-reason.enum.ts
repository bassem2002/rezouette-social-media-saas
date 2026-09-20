/// Raisons métier standardisées d'un échec Meta Graph API. Indépendantes du
/// transport (codes Graph) : la traduction code/subcode → raison est centralisée
/// dans MetaExceptionMapper (couche application).
export enum MetaErrorReason {
  /// Token invalide/expiré (code 190).
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  /// Reconnexion OAuth requise (code 190 + subcode 460).
  RECONNECT_REQUIRED = 'RECONNECT_REQUIRED',
  /// Accès utilisateur restreint/temporairement bloqué (code 25).
  USER_ACCESS_RESTRICTED = 'USER_ACCESS_RESTRICTED',
  /// Permission manquante (code 10).
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  /// Paramètre de requête invalide (code 100).
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  /// Délai dépassé / erreur transitoire (code -2).
  TIMEOUT = 'TIMEOUT',
  /// Meta n'a pas pu TÉLÉCHARGER le média depuis l'URL fournie (Instagram 9004,
  /// Facebook 324). Ce n'est PAS un incident Meta : l'URL du média n'est pas
  /// joignable depuis leurs serveurs (typiquement `localhost` en développement,
  /// PUBLIC_BASE_URL mal configurée en production).
  MEDIA_UNREACHABLE = 'MEDIA_UNREACHABLE',
  /// Instagram n'a pas fini de préparer le média (code 9007). Le conteneur
  /// existe, son traitement est asynchrone : réessayer aboutit.
  MEDIA_NOT_READY = 'MEDIA_NOT_READY',
  /// Toute autre erreur Meta non classifiée (code 1 ou inconnu).
  UNKNOWN_META_ERROR = 'UNKNOWN_META_ERROR',
}
