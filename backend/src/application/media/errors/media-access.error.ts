/// Codes d'échec d'accès à un média local. Erreur APPLICATIVE pure : aucune
/// dépendance framework. Les messages sont volontairement génériques et ne
/// contiennent JAMAIS de chemin absolu — les exposer renseignerait un attaquant
/// sur l'arborescence du serveur.
export const MediaAccessErrorCode = {
  /// L'URL ne désigne pas un média géré par Zernio (externe, mauvais schéma,
  /// mauvaise origine, hors /uploads, traversée de répertoire…).
  MEDIA_NOT_MANAGED_BY_ZERNIO: 'media_not_managed_by_zernio',
  /// L'URL est bien une URL Zernio, mais le fichier n'existe pas (ou plus).
  MEDIA_NOT_FOUND: 'media_not_found',
  /// Fichier de taille nulle.
  EMPTY_MEDIA: 'empty_media',
  /// Extension/MIME non reconnu ou incompatible avec l'usage demandé.
  INVALID_MEDIA_TYPE: 'invalid_media_type',
  /// Plage d'octets incohérente (négative, inversée, hors fichier).
  INVALID_MEDIA_RANGE: 'invalid_media_range',
} as const

export type MediaAccessErrorCode =
  (typeof MediaAccessErrorCode)[keyof typeof MediaAccessErrorCode]

export class MediaAccessError extends Error {
  constructor(
    readonly code: MediaAccessErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'MediaAccessError'
  }
}
