import { registerAs } from '@nestjs/config'

/// Scopes YouTube du MVP. `youtube.upload` est indispensable pour publier une
/// vidéo (videos.insert) ; `youtube.readonly` sert à résoudre la chaîne du user
/// (channels.list mine=true) et à suivre l'état de traitement d'une vidéo.
/// Séparés par des espaces (format OAuth 2.0 de Google), les virgules restant
/// tolérées au parsing par cohérence avec TikTok/LinkedIn.
export const YOUTUBE_DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
] as const

/// Endpoints Google par défaut. Surchargeables pour pointer un bouchon local
/// lors des tests — jamais pour contourner l'API réelle en production.
export const YOUTUBE_DEFAULT_OAUTH_AUTHORIZATION_URL =
  'https://accounts.google.com/o/oauth2/v2/auth'
export const YOUTUBE_DEFAULT_OAUTH_TOKEN_URL =
  'https://oauth2.googleapis.com/token'
export const YOUTUBE_DEFAULT_API_BASE_URL =
  'https://www.googleapis.com/youtube/v3'
/// Base distincte de l'API : les uploads (dont le mode `resumable`) passent par
/// le host d'upload de Google, pas par le host d'API standard.
export const YOUTUBE_DEFAULT_UPLOAD_BASE_URL =
  'https://www.googleapis.com/upload/youtube/v3'

/// Cadence par défaut de la réconciliation des vidéos en cours de traitement
/// (60 s : le traitement YouTube se compte en minutes, inutile de sonder plus vite).
export const YOUTUBE_DEFAULT_RECONCILE_INTERVAL_MS = 60_000

/// Marge de rafraîchissement anticipé du token, en secondes. L'access token
/// Google vit ~1 h — la plus courte durée de tous les réseaux du projet. 600 s
/// laissent le temps de démarrer un upload long sans que le token n'expire en
/// cours de route. Sert AUSSI de fenêtre de pré-alerte EXPIRING_SOON.
export const YOUTUBE_DEFAULT_TOKEN_REFRESH_SKEW_SECONDS = 600

/// Taille de bloc par défaut de l'upload résumable : 8 MiB. Google exige un
/// multiple de 256 Kio pour tout bloc non final.
export const YOUTUBE_UPLOAD_CHUNK_MULTIPLE_BYTES = 256 * 1024
export const YOUTUBE_DEFAULT_UPLOAD_CHUNK_SIZE_BYTES = 8 * 1024 * 1024
export const YOUTUBE_DEFAULT_UPLOAD_MAX_RETRIES = 3
/// Borne haute : au-delà, un blocage tiendrait la requête indéfiniment.
export const YOUTUBE_UPLOAD_MAX_RETRIES_CEILING = 10
export const YOUTUBE_DEFAULT_UPLOAD_RETRY_BASE_MS = 1000
export const YOUTUBE_DEFAULT_UPLOAD_REQUEST_TIMEOUT_MS = 120_000

/// Réconciliation du traitement : lot par cycle, âge maximal d'une publication
/// laissée en attente, tolérance après upload et délai de requête.
export const YOUTUBE_DEFAULT_RECONCILE_BATCH_SIZE = 25
export const YOUTUBE_RECONCILE_BATCH_SIZE_CEILING = 100
export const YOUTUBE_DEFAULT_RECONCILE_MAX_AGE_HOURS = 48
export const YOUTUBE_DEFAULT_RECONCILE_NOT_FOUND_GRACE_SECONDS = 300
export const YOUTUBE_DEFAULT_RECONCILE_REQUEST_TIMEOUT_MS = 30_000

/// Cadence de réconciliation lue HORS injection de dépendances : le décorateur
/// `@Interval` fige sa période au chargement du module, avant que ConfigService
/// n'existe. Même parseur que la config typée — une seule règle de validation.
export function YOUTUBE_RECONCILE_INTERVAL_ENV(): number {
  return parsePositiveInt(
    process.env['YOUTUBE_RECONCILE_INTERVAL_MS'],
    YOUTUBE_DEFAULT_RECONCILE_INTERVAL_MS,
  )
}

export interface YouTubeConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  /// Dialogue de consentement Google (OAuth 2.0 Authorization Code).
  oauthAuthorizationUrl: string
  /// Échange du code / rafraîchissement du token.
  oauthTokenUrl: string
  /// Base des appels API (channels, videos…).
  apiBaseUrl: string
  /// Base des appels d'upload (upload résumable).
  uploadBaseUrl: string
  /// Interrupteur de publication (défaut `false` : aucune publication réelle).
  publishingEnabled: boolean
  /// Intervalle du scheduler de réconciliation, en millisecondes.
  reconcileIntervalMs: number
  /// Marge de rafraîchissement anticipé du token (secondes). N'entre PAS dans
  /// `isYouTubeConfigured` ni `isYouTubePublishingEnabled` : c'est un réglage
  /// d'exploitation, pas un pré-requis d'activation.
  tokenRefreshSkewSeconds: number
  /// Taille d'un bloc d'upload résumable (octets), multiple de 256 Kio.
  uploadChunkSizeBytes: number
  /// Nombre maximal de reprises après incident transitoire (0 = aucune).
  uploadMaxRetries: number
  /// Base du backoff exponentiel entre deux reprises (ms).
  uploadRetryBaseMs: number
  /// Délai maximal d'une requête d'upload (ms).
  uploadRequestTimeoutMs: number
  /// Nombre de publications examinées par cycle de réconciliation.
  reconcileBatchSize: number
  /// Au-delà de cet âge, une publication encore en attente est abandonnée.
  reconcileMaxAgeHours: number
  /// Tolérance après l'upload : une vidéo « introuvable » peut n'être pas encore
  /// indexée par Google. En deçà, on ne conclut pas à un échec.
  reconcileNotFoundGraceSeconds: number
  /// Délai maximal d'une requête de lecture de statut (ms).
  reconcileRequestTimeoutMs: number
}

/// Valeurs d'environnement reconnues comme « vrai ». Toute autre valeur (y
/// compris absente ou mal orthographiée) vaut `false` — défaut sûr.
const TRUTHY_VALUES = new Set(['true', '1', 'yes', 'on'])

/// Parseur booléen sûr : ne lève jamais, retombe sur `false`.
function parseBooleanFlag(raw: string | undefined): boolean {
  return TRUTHY_VALUES.has((raw ?? '').trim().toLowerCase())
}

/// Parseur entier sûr : n'accepte qu'un entier strictement positif ; toute
/// valeur absente, non numérique, nulle ou négative retombe sur `fallback`.
function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').trim())
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.trunc(value)
}

/// Entier ≥ 0 borné par un plafond ; toute valeur invalide retombe sur `fallback`.
function parseBoundedCount(
  raw: string | undefined,
  fallback: number,
  ceiling: number,
): number {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return fallback
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return fallback
  return Math.min(Math.trunc(value), ceiling)
}

/// Nombre strictement positif, décimales autorisées (durées en heures).
function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').trim())
  if (!Number.isFinite(value) || value <= 0) return fallback
  return value
}

/// Entier ≥ 0 (une tolérance nulle est un choix légitime).
function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return fallback
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return fallback
  return Math.trunc(value)
}

/// Taille de bloc d'upload : entier strictement positif ET multiple de 256 Kio
/// (exigence Google pour tout bloc non final). Sinon, retour au défaut.
function parseChunkSize(raw: string | undefined, fallback: number): number {
  const value = parsePositiveInt(raw, 0)
  if (value <= 0 || value % YOUTUBE_UPLOAD_CHUNK_MULTIPLE_BYTES !== 0) {
    return fallback
  }
  return value
}

/// Normalise une liste de scopes : séparation par espaces ou virgules, trim,
/// suppression des valeurs vides et des doublons (ordre de première apparition
/// préservé). Une variable absente ou vide retombe sur les scopes par défaut —
/// aucun scope n'est exigé au démarrage.
function parseScopes(raw: string | undefined, fallback: readonly string[]): string[] {
  const parsed = (raw ?? '')
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
  return [...new Set(parsed.length > 0 ? parsed : fallback)]
}

/// Repli robuste : une variable PRÉSENTE mais VIDE (`KEY=`) doit retomber sur la
/// valeur par défaut. `??` ne couvre que null/undefined, pas la chaîne vide.
function envOrDefault(key: string, fallback: string): string {
  const value = process.env[key]
  return value && value.trim() ? value.trim() : fallback
}

/// Config typée chargée depuis l'environnement. Comme TikTok et LinkedIn (et
/// contrairement à Meta, cœur du MVP), YouTube est une intégration optionnelle
/// pas encore provisionnée : on N'échoue JAMAIS au boot si les credentials
/// manquent — la validation se fait au moment de l'usage (voir
/// `isYouTubeConfigured` / `isYouTubePublishingEnabled`, qui alimenteront les
/// gardes 503 des futurs controllers et le sélecteur d'adaptateur désactivé).
export default registerAs('youtube', (): YouTubeConfig => {
  return {
    clientId: process.env['YOUTUBE_CLIENT_ID']?.trim() ?? '',
    clientSecret: process.env['YOUTUBE_CLIENT_SECRET']?.trim() ?? '',
    redirectUri: process.env['YOUTUBE_REDIRECT_URI']?.trim() ?? '',
    scopes: parseScopes(process.env['YOUTUBE_SCOPES'], YOUTUBE_DEFAULT_SCOPES),
    oauthAuthorizationUrl: envOrDefault(
      'YOUTUBE_OAUTH_AUTHORIZATION_URL',
      YOUTUBE_DEFAULT_OAUTH_AUTHORIZATION_URL,
    ),
    oauthTokenUrl: envOrDefault(
      'YOUTUBE_OAUTH_TOKEN_URL',
      YOUTUBE_DEFAULT_OAUTH_TOKEN_URL,
    ),
    apiBaseUrl: envOrDefault(
      'YOUTUBE_API_BASE_URL',
      YOUTUBE_DEFAULT_API_BASE_URL,
    ),
    uploadBaseUrl: envOrDefault(
      'YOUTUBE_UPLOAD_BASE_URL',
      YOUTUBE_DEFAULT_UPLOAD_BASE_URL,
    ),
    publishingEnabled: parseBooleanFlag(
      process.env['YOUTUBE_PUBLISHING_ENABLED'],
    ),
    reconcileIntervalMs: parsePositiveInt(
      process.env['YOUTUBE_RECONCILE_INTERVAL_MS'],
      YOUTUBE_DEFAULT_RECONCILE_INTERVAL_MS,
    ),
    tokenRefreshSkewSeconds: parsePositiveInt(
      process.env['YOUTUBE_TOKEN_REFRESH_SKEW_SECONDS'],
      YOUTUBE_DEFAULT_TOKEN_REFRESH_SKEW_SECONDS,
    ),
    uploadChunkSizeBytes: parseChunkSize(
      process.env['YOUTUBE_UPLOAD_CHUNK_SIZE_BYTES'],
      YOUTUBE_DEFAULT_UPLOAD_CHUNK_SIZE_BYTES,
    ),
    uploadMaxRetries: parseBoundedCount(
      process.env['YOUTUBE_UPLOAD_MAX_RETRIES'],
      YOUTUBE_DEFAULT_UPLOAD_MAX_RETRIES,
      YOUTUBE_UPLOAD_MAX_RETRIES_CEILING,
    ),
    uploadRetryBaseMs: parsePositiveInt(
      process.env['YOUTUBE_UPLOAD_RETRY_BASE_MS'],
      YOUTUBE_DEFAULT_UPLOAD_RETRY_BASE_MS,
    ),
    uploadRequestTimeoutMs: parsePositiveInt(
      process.env['YOUTUBE_UPLOAD_REQUEST_TIMEOUT_MS'],
      YOUTUBE_DEFAULT_UPLOAD_REQUEST_TIMEOUT_MS,
    ),
    reconcileBatchSize: Math.min(
      parsePositiveInt(
        process.env['YOUTUBE_RECONCILE_BATCH_SIZE'],
        YOUTUBE_DEFAULT_RECONCILE_BATCH_SIZE,
      ),
      YOUTUBE_RECONCILE_BATCH_SIZE_CEILING,
    ),
    reconcileMaxAgeHours: parsePositiveNumber(
      process.env['YOUTUBE_RECONCILE_MAX_AGE_HOURS'],
      YOUTUBE_DEFAULT_RECONCILE_MAX_AGE_HOURS,
    ),
    reconcileNotFoundGraceSeconds: parseNonNegativeInt(
      process.env['YOUTUBE_RECONCILE_NOT_FOUND_GRACE_SECONDS'],
      YOUTUBE_DEFAULT_RECONCILE_NOT_FOUND_GRACE_SECONDS,
    ),
    reconcileRequestTimeoutMs: parsePositiveInt(
      process.env['YOUTUBE_RECONCILE_REQUEST_TIMEOUT_MS'],
      YOUTUBE_DEFAULT_RECONCILE_REQUEST_TIMEOUT_MS,
    ),
  }
})

/// Vrai si l'intégration YouTube est utilisable (credentials OAuth complets).
/// Ne dépend PAS encore d'`OAUTH_STATE_SECRET` : le socle OAuth partagé sera
/// généralisé au checkpoint OAuth, et cette fonction s'alignera alors.
export function isYouTubeConfigured(config: YouTubeConfig): boolean {
  return Boolean(config.clientId && config.clientSecret && config.redirectUri)
}

/// Vrai si la publication YouTube est réellement activée : credentials présents
/// ET interrupteur explicitement levé. Des credentials sans interrupteur — ou
/// l'inverse — ne publient jamais.
export function isYouTubePublishingEnabled(config: YouTubeConfig): boolean {
  return isYouTubeConfigured(config) && config.publishingEnabled
}
