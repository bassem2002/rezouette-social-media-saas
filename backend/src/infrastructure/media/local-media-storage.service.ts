import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, stat, realpath, unlink } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  type MediaStorageGateway,
  type SaveMediaInput,
  type StoredMedia,
} from '../../application/media/ports/media-storage.gateway.js'
import {
  type MediaReadDescriptor,
  type MediaReaderGateway,
} from '../../application/media/ports/media-reader.gateway.js'
import {
  MediaAccessError,
  MediaAccessErrorCode,
} from '../../application/media/errors/media-access.error.js'
import {
  MediaConfig,
  PUBLIC_UPLOADS_PREFIX,
  TEMP_UPLOAD_SUBDIR,
  mimeTypeFromExtension,
  resolveTempUploadDir,
} from '../../config/media.config.js'

/// Mapping MIME → extension (déterministe, indépendant du nom d'origine).
const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
}

const ALLOWED_ORIGINAL_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.mp4',
  '.mov',
  '.webm',
])

/// Préfixe URL des médias — importé de la config, jamais redéclaré : `main.ts`
/// et ce service doivent partager exactement la même convention.

/// Stockage disque local sous uploads/social/AAAA/MM/uuid.ext, servi en statique
/// via /uploads. Seul endroit qui connaît le système de fichiers.
///
/// Implémente DEUX ports :
/// - `MediaStorageGateway` : écriture, par DÉPLACEMENT du fichier temporaire
///   (aucun octet ne transite en mémoire) ;
/// - `MediaReaderGateway` : lecture par plages, pour l'upload résumable YouTube.
///
/// Les deux partagent la même racine `uploadsRoot` : une seule arborescence,
/// une seule règle de sécurité.
@Injectable()
export class LocalMediaStorageService
  implements MediaStorageGateway, MediaReaderGateway
{
  private readonly logger = new Logger(LocalMediaStorageService.name)

  constructor(private readonly config: ConfigService) {}

  private get cfg(): MediaConfig {
    return this.config.getOrThrow<MediaConfig>('media')
  }

  // ── Écriture ──────────────────────────────────────────────────────────────

  async save({
    temporaryPath,
    mimeType,
    originalName,
    mediaType,
  }: SaveMediaInput): Promise<StoredMedia> {
    const cfg = this.cfg

    const now = new Date()
    const year = String(now.getFullYear())
    const month = String(now.getMonth() + 1).padStart(2, '0')

    // Nom de destination entièrement généré : le nom client ne sert qu'à choisir
    // une extension, et n'entre jamais dans le chemin.
    const filename = `${randomUUID()}${this.resolveExtension(originalName, mimeType)}`

    const absoluteDir = join(cfg.uploadsRoot, cfg.socialSubdir, year, month)
    await mkdir(absoluteDir, { recursive: true })
    const destination = join(absoluteDir, filename)

    await this.moveFile(temporaryPath, destination)
    const { size } = await stat(destination)

    // Chemin disque (séparateurs OS) vs chemin URL (toujours en "/").
    const urlPath = [cfg.socialSubdir, year, month, filename].join('/')
    const url = `${cfg.publicBaseUrl}${PUBLIC_UPLOADS_PREFIX}${urlPath}`

    return { url, filename, size, mediaType }
  }

  /// Déplace le fichier temporaire vers sa destination. `rename` est atomique et
  /// ne recopie aucun octet quand les deux chemins sont sur le même volume (cas
  /// normal : le dossier temporaire vit sous `uploadsRoot`). Sur EXDEV (volumes
  /// distincts), repli sur une COPIE EN FLUX — jamais un chargement mémoire —
  /// suivie de la suppression de la source, uniquement si la copie a réussi.
  private async moveFile(source: string, destination: string): Promise<void> {
    try {
      await rename(source, destination)
      return
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    }

    await pipeline(createReadStream(source), createWriteStream(destination))
    await unlink(source)
  }

  /// Conserve l'extension d'origine si valide (jpeg normalisé en jpg), sinon
  /// déduit l'extension du type MIME.
  private resolveExtension(originalName: string, mimeType: string): string {
    const original = extname(originalName).toLowerCase()
    if (ALLOWED_ORIGINAL_EXT.has(original)) {
      return original === '.jpeg' ? '.jpg' : original
    }
    return MIME_EXTENSION[mimeType] ?? '.bin'
  }

  // ── Lecture ───────────────────────────────────────────────────────────────

  /// Résout une URL publique Zernio vers un média local, ou refuse.
  ///
  /// Défense en profondeur, dans cet ordre : schéma → origine → préfixe
  /// /uploads/ → décodage → caractères interdits → confinement sous la racine →
  /// résolution des liens symboliques → fichier régulier → taille → MIME.
  async resolvePublicUrl(publicUrl: string): Promise<MediaReadDescriptor> {
    const cfg = this.cfg
    const pathname = this.extractUploadsPathname(publicUrl, cfg.publicBaseUrl)
    const uploadsRoot = await this.realUploadsRoot(cfg.uploadsRoot)
    const absolutePath = await this.resolveWithinRoot(uploadsRoot, pathname)

    let stats: Awaited<ReturnType<typeof stat>>
    try {
      stats = await stat(absolutePath)
    } catch {
      throw new MediaAccessError(
        MediaAccessErrorCode.MEDIA_NOT_FOUND,
        'Média introuvable.',
      )
    }
    if (!stats.isFile()) {
      throw new MediaAccessError(
        MediaAccessErrorCode.MEDIA_NOT_FOUND,
        "La cible n'est pas un fichier.",
      )
    }
    if (stats.size <= 0) {
      throw new MediaAccessError(
        MediaAccessErrorCode.EMPTY_MEDIA,
        'Le média est vide.',
      )
    }

    const filename = absolutePath.split(sep).pop() ?? ''
    const mimeType = mimeTypeFromExtension(extname(filename))
    if (!mimeType) {
      throw new MediaAccessError(
        MediaAccessErrorCode.INVALID_MEDIA_TYPE,
        'Type de média non reconnu.',
      )
    }

    return {
      // Référence OPAQUE : chemin RELATIF à la racine, jamais absolu.
      ref: relative(uploadsRoot, absolutePath).split(sep).join('/'),
      size: stats.size,
      mimeType,
      filename,
    }
  }

  async openRange(
    ref: string,
    start: number,
    endInclusive: number,
  ): Promise<NodeJS.ReadableStream> {
    const cfg = this.cfg
    const uploadsRoot = await this.realUploadsRoot(cfg.uploadsRoot)
    // La référence est re-validée : elle a beau venir de nous, on ne fait pas
    // confiance à une valeur qui a traversé la couche Application.
    const absolutePath = await this.resolveWithinRoot(uploadsRoot, `/${ref}`)

    const { size } = await stat(absolutePath)
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(endInclusive) ||
      start < 0 ||
      endInclusive < start ||
      endInclusive >= size
    ) {
      throw new MediaAccessError(
        MediaAccessErrorCode.INVALID_MEDIA_RANGE,
        'Plage d’octets demandée invalide.',
      )
    }

    return createReadStream(absolutePath, { start, end: endInclusive })
  }

  // ── Sécurité des chemins ──────────────────────────────────────────────────

  /// Extrait le chemin sous /uploads/ d'une URL publique Zernio. Refuse tout ce
  /// qui n'est pas un média servi par cette instance.
  private extractUploadsPathname(publicUrl: string, publicBaseUrl: string): string {
    const raw = (publicUrl ?? '').trim()
    if (!raw) throw this.notManaged()

    let pathname: string
    if (raw.startsWith('/')) {
      // Chemin relatif : accepté tel quel (aucune origine à vérifier).
      pathname = raw.split('?')[0].split('#')[0]
    } else {
      let parsed: URL
      try {
        parsed = new URL(raw)
      } catch {
        throw this.notManaged()
      }
      // Schémas file:, ftp:, data:… systématiquement rejetés.
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw this.notManaged()
      }
      // L'origine doit être CELLE DE ZERNIO : aucune ressource distante n'est
      // téléchargée, ce qui ferme la porte au SSRF.
      let base: URL
      try {
        base = new URL(publicBaseUrl)
      } catch {
        throw this.notManaged()
      }
      if (parsed.origin !== base.origin) throw this.notManaged()
      pathname = parsed.pathname
    }

    if (!pathname.startsWith(PUBLIC_UPLOADS_PREFIX)) throw this.notManaged()

    let decoded: string
    try {
      decoded = decodeURIComponent(pathname)
    } catch {
      // Séquence de pourcentage invalide : tentative d'obfuscation.
      throw this.notManaged()
    }
    return decoded.slice(PUBLIC_UPLOADS_PREFIX.length - 1)
  }

  /// Résout un chemin relatif SOUS la racine des uploads, ou refuse.
  private async resolveWithinRoot(
    uploadsRoot: string,
    relativePathname: string,
  ): Promise<string> {
    // Caractère NUL : tronquerait le chemin côté appels système.
    if (relativePathname.includes('\0')) throw this.notManaged()
    // Antislash : séparateur sous Windows, donc vecteur de traversée.
    if (relativePathname.includes('\\')) throw this.notManaged()

    const segments = relativePathname.split('/').filter(Boolean)
    // Aucun segment de remontée, y compris après décodage de %2e%2e.
    if (segments.some((segment) => segment === '..' || segment === '.')) {
      throw this.notManaged()
    }
    if (segments.length === 0) throw this.notManaged()
    // Un segment absolu injecté (ex. "C:") ne doit jamais être recollé.
    if (segments.some((segment) => isAbsolute(segment))) throw this.notManaged()
    // Le répertoire des fichiers temporaires n'est PAS un média publiable :
    // son contenu est transitoire et n'a pas passé la validation.
    if (segments[0] === TEMP_UPLOAD_SUBDIR) throw this.notManaged()

    const candidate = resolve(uploadsRoot, ...segments)
    this.assertInsideRoot(uploadsRoot, candidate)

    // Résolution des liens symboliques : un lien pointant hors de la racine
    // passerait les contrôles purement lexicaux.
    let real: string
    try {
      real = await realpath(candidate)
    } catch {
      throw new MediaAccessError(
        MediaAccessErrorCode.MEDIA_NOT_FOUND,
        'Média introuvable.',
      )
    }
    this.assertInsideRoot(uploadsRoot, real)
    return real
  }

  /// Confinement strict : `path.relative` plutôt qu'un `startsWith`, qui
  /// laisserait passer un répertoire voisin au préfixe identique
  /// (« /uploads-public » vs « /uploads »).
  private assertInsideRoot(root: string, candidate: string): void {
    const rel = relative(root, candidate)
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
      throw this.notManaged()
    }
  }

  /// Racine canonique (liens symboliques résolus). Si elle n'existe pas encore,
  /// on retombe sur le chemin normalisé : le fichier sera de toute façon
  /// introuvable ensuite.
  private async realUploadsRoot(uploadsRoot: string): Promise<string> {
    try {
      return await realpath(uploadsRoot)
    } catch {
      return resolve(uploadsRoot)
    }
  }

  /// Message volontairement générique et SANS chemin absolu : ne rien révéler
  /// de l'arborescence du serveur.
  private notManaged(): MediaAccessError {
    return new MediaAccessError(
      MediaAccessErrorCode.MEDIA_NOT_MANAGED_BY_ZERNIO,
      "Le média n'est pas un fichier hébergé par Zernio.",
    )
  }

  /// Supprime un fichier temporaire d'upload. Refuse toute cible située hors du
  /// répertoire temporaire : ce nettoyage ne doit jamais devenir une primitive
  /// de suppression arbitraire.
  async discardTemporary(temporaryPath: string): Promise<void> {
    try {
      const root = resolve(resolveTempUploadDir())
      const target = resolve(temporaryPath)
      const rel = relative(root, target)
      if (!rel || rel.startsWith('..') || isAbsolute(rel)) return
      await unlink(target)
    } catch (err) {
      // Un temporaire déjà disparu n'est pas une erreur.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn('Suppression du fichier temporaire impossible.')
      }
    }
  }
}
