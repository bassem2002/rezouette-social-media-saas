import type { MediaKind } from '../../../config/media.config.js'

/// Port (DIP) de stockage média (image ou vidéo). Le use case dépend de cette
/// abstraction, jamais du système de fichiers ni d'un SDK cloud directement.

export interface StoredMedia {
  /// URL publique absolue du fichier servi (consommable par Meta/TikTok + frontend).
  url: string
  /// Nom de fichier généré (uuid + extension).
  filename: string
  /// Taille réelle écrite, en octets.
  size: number
  /// Nature du média stocké.
  mediaType: MediaKind
}

export interface SaveMediaInput {
  /// Chemin du fichier temporaire écrit par le pipeline multipart. Le média
  /// n'est JAMAIS transporté en mémoire : le stockage déplace le fichier
  /// (`rename`) ou le recopie en flux si les volumes diffèrent.
  temporaryPath: string
  mimeType: string
  /// Nom d'origine côté client — utilisé UNIQUEMENT pour choisir une extension,
  /// jamais pour composer le chemin de destination.
  originalName: string
  mediaType: MediaKind
}

export interface MediaStorageGateway {
  /// Persiste un média et renvoie son URL publique + métadonnées.
  save(input: SaveMediaInput): Promise<StoredMedia>

  /// Supprime un fichier temporaire d'upload (validation refusée, erreur de
  /// stockage…). Ne lève jamais, et refuse toute cible hors du répertoire
  /// temporaire — ce nettoyage ne doit pas devenir une suppression arbitraire.
  discardTemporary(temporaryPath: string): Promise<void>
}

export const MEDIA_STORAGE = Symbol('MediaStorage')
