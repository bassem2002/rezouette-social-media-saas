/// Raisons métier standardisées d'un échec de publication YouTube. Indépendantes
/// du transport (codes HTTP / motifs Google) : la traduction code → raison est
/// centralisée dans YouTubeExceptionMapper (couche application).
/// Pendant de Meta, TikTok et LinkedIn.
export enum YouTubeErrorReason {
  /// Access token invalide/expiré (Google : ~1 h, la durée la plus courte).
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  /// Reconnexion OAuth requise (refresh révoqué : `invalid_grant`).
  RECONNECT_REQUIRED = 'RECONNECT_REQUIRED',
  /// Aucun refresh token stocké : le token d'une heure ne peut pas être renouvelé.
  REFRESH_TOKEN_MISSING = 'REFRESH_TOKEN_MISSING',
  /// Permission insuffisante côté Google pour l'opération demandée.
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  /// Le scope `youtube.upload` n'a pas été accordé — publication impossible.
  UPLOAD_SCOPE_MISSING = 'UPLOAD_SCOPE_MISSING',
  /// Aucune chaîne YouTube ne correspond à la cible demandée.
  CHANNEL_NOT_FOUND = 'CHANNEL_NOT_FOUND',
  /// La VIDÉO est introuvable côté YouTube — distinct d'une chaîne absente :
  /// la destination existe, c'est le contenu envoyé qui a disparu.
  VIDEO_NOT_FOUND = 'VIDEO_NOT_FOUND',
  /// Fichier vidéo absent, illisible ou refusé (format/taille).
  INVALID_VIDEO = 'INVALID_VIDEO',
  /// Titre manquant, vide ou trop long (100 caractères max).
  INVALID_TITLE = 'INVALID_TITLE',
  /// Catégorie inconnue ou indisponible dans la région de la chaîne.
  INVALID_CATEGORY = 'INVALID_CATEGORY',
  /// Paramètre de requête invalide (payload mal formé).
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  /// Échec du transfert de la vidéo vers Google.
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  /// Session d'upload résumable expirée : le transfert doit être relancé.
  UPLOAD_SESSION_EXPIRED = 'UPLOAD_SESSION_EXPIRED',
  /// Vidéo reçue mais échec du traitement côté YouTube.
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  /// Vidéo rejetée (droits d'auteur, conditions d'utilisation…).
  VIDEO_REJECTED = 'VIDEO_REJECTED',
  /// Quota d'unités de l'API dépassé (10 000/jour par défaut).
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  /// Limite quotidienne d'envois de vidéos atteinte pour la chaîne.
  DAILY_UPLOAD_LIMIT = 'DAILY_UPLOAD_LIMIT',
  /// Débit trop élevé (transitoire).
  RATE_LIMITED = 'RATE_LIMITED',
  /// Publication YouTube non configurée ou désactivée par feature flag.
  PUBLISHING_NOT_CONFIGURED = 'PUBLISHING_NOT_CONFIGURED',
  /// Délai dépassé / erreur transitoire réseau.
  TIMEOUT = 'TIMEOUT',
  /// Toute autre erreur YouTube non classifiée.
  UNKNOWN_YOUTUBE_ERROR = 'UNKNOWN_YOUTUBE_ERROR',
}
