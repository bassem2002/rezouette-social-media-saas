import { registerAs } from '@nestjs/config'
import { join } from 'node:path'

/// Formats d'image autorisés à l'upload (alignés Facebook + Instagram).
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

/// Formats vidéo autorisés (alignés TikTok Content Posting API : MP4/MOV/WEBM).
export const ALLOWED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const

/// Nature d'un média accepté par le pipeline d'upload.
export type MediaKind = 'image' | 'video'

export interface MediaConfig {
  /// Base publique servant à construire l'URL absolue des fichiers servis.
  publicBaseUrl: string
  /// Racine disque des uploads (sert aussi de root à useStaticAssets).
  uploadsRoot: string
  /// Sous-dossier dédié aux médias sociaux.
  socialSubdir: string
  allowedImageMimeTypes: readonly string[]
  allowedVideoMimeTypes: readonly string[]
  /// Taille maximale d'une image (octets).
  maxImageBytes: number
  /// Taille maximale d'une vidéo (octets).
  maxVideoBytes: number
}

/// Classe un type MIME en image/vidéo selon la config, ou null si non supporté.
/// Source unique de la détection de nature média (upload + stockage).
export function resolveMediaKind(
  mimeType: string,
  cfg: MediaConfig,
): MediaKind | null {
  if (cfg.allowedImageMimeTypes.includes(mimeType)) return 'image'
  if (cfg.allowedVideoMimeTypes.includes(mimeType)) return 'video'
  return null
}

/// Hôtes non accessibles depuis Internet : Meta ne peut pas y télécharger l'image.
export const LOCAL_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
] as const

/// Vrai si l'URL pointe vers la machine locale (boucle locale) — donc inaccessible
/// par Meta Graph API. Réutilisé par le garde-fou production de l'upload.
export function isLocalUrl(url: string): boolean {
  try {
    // hostname IPv6 renvoyé entre crochets par URL → on les retire.
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '')
    return (
      (LOCAL_HOSTNAMES as readonly string[]).includes(host) ||
      host.startsWith('127.') ||
      host.endsWith('.localhost')
    )
  } catch {
    return false
  }
}

/// Sous-dossier des fichiers temporaires d'upload (multipart en cours). Vit sous
/// `uploadsRoot` pour rester sur le MÊME VOLUME que la destination finale : le
/// déplacement se fait alors par `rename`, sans recopier les octets.
///
/// ⚠️ Il n'est PAS servi publiquement : voir `resolveStaticAssetsRoot()`.
export const TEMP_UPLOAD_SUBDIR = '.tmp'

/// Sous-dossier des médias sociaux publiés — le SEUL contenu servi en statique.
export const SOCIAL_MEDIA_SUBDIR = 'social'

/// Préfixe URL historique des médias. Inchangé : les URL déjà distribuées
/// (`/uploads/social/AAAA/MM/fichier.ext`) doivent rester valides.
export const PUBLIC_UPLOADS_PREFIX = '/uploads/'

/// Préfixe public réellement servi. `uploadsRoot` contient aussi `.tmp/` : le
/// servir en entier exposerait les fichiers temporaires (fenêtre courte, noms
/// aléatoires, mais aucun contenu validé). On ne monte donc QUE `social/`.
export const PUBLIC_SOCIAL_PREFIX = `${PUBLIC_UPLOADS_PREFIX}${SOCIAL_MEDIA_SUBDIR}/`

/// Racine disque des uploads. Fonction PURE et partagée : la config Nest,
/// l'interceptor multipart (évalué au chargement du module, hors DI) et le
/// service statique de `main.ts` doivent tous désigner la même racine.
export function resolveUploadsRoot(): string {
  return process.env['UPLOADS_DIR'] ?? join(process.cwd(), 'uploads')
}

/// Répertoire des fichiers temporaires, dérivé de la racine des uploads.
export function resolveTempUploadDir(): string {
  return join(resolveUploadsRoot(), TEMP_UPLOAD_SUBDIR)
}

/// Racine EXPOSÉE en statique : uniquement `uploads/social`. Combinée au préfixe
/// `/uploads/social/`, elle reproduit exactement les URL historiques tout en
/// plaçant `uploads/.tmp/` HORS de l'arborescence servie.
export function resolveStaticAssetsRoot(): string {
  return join(resolveUploadsRoot(), SOCIAL_MEDIA_SUBDIR)
}

/// Préfixe monté avec cette racine. Source unique partagée par `main.ts` et le
/// stockage — deux constructions divergentes finiraient par se désynchroniser.
export function resolveStaticAssetsPrefix(): string {
  return PUBLIC_SOCIAL_PREFIX
}

/// Extension → type MIME, inverse de la table utilisée à l'écriture. Sert à
/// redonner un MIME FIABLE à un fichier déjà stocké, sans deviner ni retomber
/// sur `application/octet-stream`.
const EXTENSION_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
}

/// Type MIME d'un média stocké, déduit de son extension. `null` si l'extension
/// n'appartient pas aux formats acceptés à l'upload — le fichier est alors
/// refusé plutôt que traité comme un binaire opaque.
export function mimeTypeFromExtension(extension: string): string | null {
  return EXTENSION_MIME[extension.toLowerCase()] ?? null
}

/// Config média typée. URL publique et limites centralisées (source unique).
export default registerAs('media', (): MediaConfig => {
  const port = process.env['PORT'] ?? '3000'
  // Trim du/des slash(s) final(aux) pour éviter `//uploads` dans les URLs.
  const publicBaseUrl = (
    process.env['PUBLIC_BASE_URL'] ?? `http://localhost:${port}`
  ).replace(/\/+$/, '')

  // Taille max vidéo configurable (défaut 100 Mo). Le fichier est bufferisé en
  // mémoire (multer) au stade MVP — l'upload chunké/streamé sera introduit avec
  // la stratégie de transfert TikTok FILE_UPLOAD (phase publication).
  const maxVideoMb = Number(process.env['MAX_VIDEO_UPLOAD_MB'] ?? 100)

  return {
    publicBaseUrl,
    uploadsRoot: resolveUploadsRoot(),
    socialSubdir: SOCIAL_MEDIA_SUBDIR,
    allowedImageMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
    allowedVideoMimeTypes: ALLOWED_VIDEO_MIME_TYPES,
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoBytes: maxVideoMb * 1024 * 1024,
  }
})
