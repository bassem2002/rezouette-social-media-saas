/// État du token d'un compte social, dérivé de son expiration et du drapeau de
/// reconnexion. Indépendant du transport : la dérivation vit dans MetaTokenService.
export enum TokenStatus {
  /// Token valide et loin de l'expiration.
  VALID = 'VALID',
  /// Token encore valide mais proche de l'expiration (fenêtre de pré-alerte).
  EXPIRING_SOON = 'EXPIRING_SOON',
  /// Token expiré (date d'expiration dépassée).
  EXPIRED = 'EXPIRED',
  /// Reconnexion OAuth requise (drapeau `needsReconnect` levé par Meta).
  RECONNECT_REQUIRED = 'RECONNECT_REQUIRED',
}
