/// Port (DIP) de LECTURE d'un média déjà stocké par Zernio, pendant du port
/// d'écriture `MediaStorageGateway`. Permet de transférer une vidéo vers un
/// réseau social PAR TRANCHES, sans jamais la charger entièrement en mémoire.
///
/// Aucune importation de NestJS, Prisma, Axios — ni de `fs`/`path` : la couche
/// Application ne doit jamais manipuler de chemin de fichier.

/// Description d'un média résolu, prête pour un upload par plages.
export interface MediaReadDescriptor {
  /// Référence OPAQUE du média côté stockage. La couche Application la
  /// transporte sans jamais l'interpréter : ce n'est pas un chemin absolu, et
  /// elle ne doit apparaître ni dans une réponse HTTP ni dans un log.
  ref: string
  /// Taille totale en octets (> 0).
  size: number
  /// Type MIME fiable, déduit du stockage (jamais fourni par le client).
  mimeType: string
  /// Nom de fichier généré au stockage (jamais le nom d'origine du client).
  filename: string
}

export interface MediaReaderGateway {
  /// Résout une URL publique Zernio vers un média local.
  ///
  /// SÉCURITÉ : seules les URL produites par le stockage Zernio sont acceptées.
  /// Toute URL externe, tout schéma non http(s), toute tentative de traversée de
  /// répertoire et tout lien symbolique sortant sont refusés — ce port ne
  /// télécharge JAMAIS une ressource distante fournie par l'utilisateur (SSRF).
  resolvePublicUrl(publicUrl: string): Promise<MediaReadDescriptor>

  /// Ouvre un flux borné sur `[start, endInclusive]`. Bornes exprimées en
  /// octets, inclusives, obligatoirement dans les limites du fichier.
  openRange(
    ref: string,
    start: number,
    endInclusive: number,
  ): Promise<NodeJS.ReadableStream>
}

export const MEDIA_READER_GATEWAY = Symbol('MediaReaderGateway')
