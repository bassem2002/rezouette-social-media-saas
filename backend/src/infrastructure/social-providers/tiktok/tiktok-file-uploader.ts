import { HttpService } from '@nestjs/axios'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'
import type { AxiosResponse } from 'axios'
import {
  MEDIA_READER_GATEWAY,
  type MediaReaderGateway,
} from '../../../application/media/ports/media-reader.gateway.js'
import { TikTokContentError } from '../../../application/social/errors/tiktok-content.error.js'

/// Bornes de découpage imposées par TikTok (Content Posting API, FILE_UPLOAD).
const MIN_CHUNK_BYTES = 5 * 1024 * 1024
const MAX_CHUNK_BYTES = 64 * 1024 * 1024
/// Taille visée : confortablement au-dessus du minimum, très en dessous du
/// plafond — un morceau perdu se rejoue vite.
const TARGET_CHUNK_BYTES = 10 * 1024 * 1024
const MAX_CHUNK_COUNT = 1000

/// Statuts transitoires : incident d'infrastructure côté TikTok, pas un refus.
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504])
const MAX_RETRIES = 2
const RETRY_BACKOFF_MS = 800
const REQUEST_TIMEOUT_MS = 120_000

/// Découpage annoncé à TikTok À L'INITIALISATION, donc calculé AVANT le
/// moindre octet transféré : `video/init/` exige `chunk_size` et
/// `total_chunk_count` dans son corps, et le transfert doit ensuite s'y
/// conformer exactement.
export interface TikTokChunkPlan {
  chunkSize: number
  totalChunkCount: number
}

/// Règle TikTok, littérale et contre-intuitive : `total_chunk_count` vaut
/// `floor(video_size / chunk_size)`, et c'est le DERNIER morceau qui absorbe le
/// reste de la division. Un morceau final peut donc peser jusqu'à deux fois
/// `chunk_size` — ce n'est pas une erreur d'arrondi, c'est le protocole.
///
/// Deux cas particuliers :
/// - fichier plus petit que le minimum de 5 Mo → un seul morceau couvrant tout
///   (TikTok tolère alors un `chunk_size` sous le plancher) ;
/// - fichier assez gros pour dépasser 1000 morceaux → on élargit le morceau
///   jusqu'à rentrer sous le plafond.
export function planTikTokChunks(videoSize: number): TikTokChunkPlan {
  if (!Number.isInteger(videoSize) || videoSize <= 0) {
    throw new TikTokContentError({
      errorCode: 'invalid_media_size',
      httpStatus: 0,
      message: 'Taille de vidéo invalide pour un transfert TikTok.',
    })
  }

  if (videoSize <= MIN_CHUNK_BYTES) {
    return { chunkSize: videoSize, totalChunkCount: 1 }
  }

  let chunkSize = TARGET_CHUNK_BYTES
  if (Math.floor(videoSize / chunkSize) > MAX_CHUNK_COUNT) {
    chunkSize = Math.min(
      MAX_CHUNK_BYTES,
      Math.ceil(videoSize / MAX_CHUNK_COUNT),
    )
  }

  const totalChunkCount = Math.floor(videoSize / chunkSize)
  return { chunkSize, totalChunkCount }
}

export interface TikTokUploadOptions {
  /// URL de dépôt renvoyée par `video/init/`. Elle est PRÉ-SIGNÉE : elle ne
  /// porte donc aucun en-tête `Authorization`, et constitue un secret de fait —
  /// jamais journalisée, jamais renvoyée au client.
  uploadUrl: string
  /// Référence opaque du média local (jamais un chemin absolu).
  mediaRef: string
  totalSize: number
  mimeType: string
  plan: TikTokChunkPlan
}

/// Transfert binaire d'une vidéo vers une session TikTok FILE_UPLOAD.
///
/// Remplace le mode PULL_FROM_URL, qui exigeait que TikTok atteigne lui-même
/// l'URL du média : impossible en développement (`localhost` n'existe pas depuis
/// leurs serveurs) et conditionné, en production, à la vérification préalable du
/// domaine dans le portail développeur. En poussant les octets nous-mêmes, on
/// s'aligne sur ce que font déjà YouTube et LinkedIn.
///
/// Comme l'uploader YouTube, la vidéo n'est JAMAIS chargée en mémoire : chaque
/// morceau est un flux borné fourni par le port de lecture média.
@Injectable()
export class TikTokFileUploader {
  private readonly logger = new Logger(TikTokFileUploader.name)

  constructor(
    private readonly http: HttpService,
    @Inject(MEDIA_READER_GATEWAY)
    private readonly mediaReader: MediaReaderGateway,
  ) {}

  async upload(options: TikTokUploadOptions): Promise<void> {
    const { plan, totalSize } = options

    for (let index = 0; index < plan.totalChunkCount; index += 1) {
      const start = index * plan.chunkSize
      // Le dernier morceau va jusqu'au bout du fichier : il absorbe le reste de
      // la division entière (voir `planTikTokChunks`).
      const isLast = index === plan.totalChunkCount - 1
      const end = isLast ? totalSize - 1 : start + plan.chunkSize - 1

      await this.sendChunkWithRetry(options, start, end, index)
    }
  }

  /// Envoie un morceau, en réessayant les seuls échecs transitoires. Un PUT de
  /// plage est idempotent : rejouer exactement les mêmes octets est sûr.
  private async sendChunkWithRetry(
    options: TikTokUploadOptions,
    start: number,
    end: number,
    index: number,
  ): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      let response: AxiosResponse<unknown>
      try {
        response = await this.sendChunk(options, start, end)
      } catch (err) {
        if (attempt >= MAX_RETRIES || !this.isTransientError(err)) {
          throw new TikTokContentError({
            errorCode: 'upload_interrupted',
            httpStatus: 0,
            message: `Transfert TikTok interrompu au morceau ${index + 1}/${options.plan.totalChunkCount}.`,
          })
        }
        await this.backoff(attempt, index)
        continue
      }

      // 2xx : morceau accepté. TikTok renvoie 201 sur le dernier morceau.
      if (response.status >= 200 && response.status < 300) return

      if (TRANSIENT_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
        await this.backoff(attempt, index)
        continue
      }

      // 4xx (ou transitoire épuisé) : refus définitif. On ne conserve que le
      // statut — le corps peut contenir l'URL de dépôt signée.
      throw new TikTokContentError({
        errorCode: 'upload_rejected',
        httpStatus: response.status,
        message: `Transfert TikTok refusé (HTTP ${response.status}) au morceau ${index + 1}/${options.plan.totalChunkCount}.`,
      })
    }
  }

  /// Envoie `[start, end]`. Le corps est un flux BORNÉ : à aucun moment le
  /// morceau n'existe sous forme de Buffer complet.
  private async sendChunk(
    options: TikTokUploadOptions,
    start: number,
    end: number,
  ): Promise<AxiosResponse<unknown>> {
    const length = end - start + 1
    const stream = await this.mediaReader.openRange(options.mediaRef, start, end)

    try {
      return await firstValueFrom(
        this.http.put(options.uploadUrl, stream, {
          headers: {
            // Pas d'Authorization : l'URL de dépôt est déjà signée.
            'Content-Type': options.mimeType,
            'Content-Length': String(length),
            'Content-Range': `bytes ${start}-${end}/${options.totalSize}`,
          },
          timeout: REQUEST_TIMEOUT_MS,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          validateStatus: () => true,
        }),
      )
    } finally {
      // Le flux est refermé quoi qu'il arrive : succès, erreur, timeout.
      this.destroyStream(stream)
    }
  }

  /// Seules les coupures réseau sont réessayables ; une erreur applicative ne
  /// l'est jamais.
  private isTransientError(err: unknown): boolean {
    if (err instanceof TikTokContentError) return false
    if (typeof err !== 'object' || err === null) return false
    const candidate = err as { code?: string; response?: unknown }
    if (candidate.response) return false
    return typeof candidate.code === 'string'
  }

  private async backoff(attempt: number, index: number): Promise<void> {
    const delay = RETRY_BACKOFF_MS * 2 ** attempt
    this.logger.warn(
      `Morceau TikTok ${index + 1} : incident transitoire — nouvelle tentative ` +
        `${attempt + 1}/${MAX_RETRIES} dans ${delay} ms`,
    )
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  private destroyStream(stream: NodeJS.ReadableStream): void {
    const destroyable = stream as { destroy?: () => void }
    if (typeof destroyable.destroy === 'function') destroyable.destroy()
  }
}
