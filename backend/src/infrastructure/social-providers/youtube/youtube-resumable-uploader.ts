import { HttpService } from '@nestjs/axios'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'
import type { AxiosResponse } from 'axios'
import {
  MEDIA_READER_GATEWAY,
  type MediaReaderGateway,
} from '../../../application/media/ports/media-reader.gateway.js'
import { YouTubeContentError } from '../../../application/social/errors/youtube-content.error.js'

/// Statuts HTTP transitoires : un incident d'infrastructure côté Google, pas un
/// refus. Ils justifient une SONDE puis une reprise, jamais un abandon.
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504])

/// Plafond du respect de `Retry-After` : au-delà, une valeur hostile ou aberrante
/// bloquerait la requête bien plus longtemps que le délai d'upload lui-même.
const MAX_RETRY_AFTER_MS = 60_000

export interface ResumableUploadOptions {
  accessToken: string
  /// URI de session renvoyée par Google. SECRET de fait : elle autorise l'écriture
  /// sur la vidéo. Jamais journalisée, jamais renvoyée, jamais persistée.
  sessionUrl: string
  /// Référence opaque du média local (jamais un chemin absolu).
  mediaRef: string
  totalSize: number
  mimeType: string
  chunkSizeBytes: number
  maxRetries: number
  retryBaseMs: number
  requestTimeoutMs: number
}

/// Résultat brut du transfert : la ressource vidéo renvoyée par Google.
export interface ResumableUploadResult {
  videoId: string
}

/// Transfert binaire d'une vidéo vers une session d'upload résumable Google.
///
/// Trois garanties structurantes :
/// 1. **Jamais de vidéo en mémoire** : chaque bloc est un `ReadStream` borné
///    fourni par le port de lecture média, transmis tel quel à axios.
/// 2. **Aucun octet supposé reçu** : après le moindre incident, l'uploader
///    SONDE la session pour connaître l'offset réellement confirmé par Google,
///    au lieu de rejouer aveuglément le bloc précédent.
/// 3. **Aucun secret exposé** : ni token, ni URI de session, ni chemin local ne
///    figurent dans les logs, les erreurs ou les résultats.
///
/// La reprise est INTRA-REQUÊTE : rien n'est persisté, un redémarrage du backend
/// perd la session (hors périmètre, voir dettes).
@Injectable()
export class YouTubeResumableUploader {
  private readonly logger = new Logger(YouTubeResumableUploader.name)

  constructor(
    private readonly http: HttpService,
    @Inject(MEDIA_READER_GATEWAY)
    private readonly mediaReader: MediaReaderGateway,
  ) {}

  async upload(options: ResumableUploadOptions): Promise<ResumableUploadResult> {
    let offset = 0
    let attempt = 0

    while (offset < options.totalSize) {
      const start = offset
      const end = Math.min(
        start + options.chunkSizeBytes - 1,
        options.totalSize - 1,
      )

      let response: AxiosResponse<unknown>
      try {
        response = await this.sendChunk(options, start, end)
      } catch (err) {
        // Aucune réponse exploitable (réseau coupé, timeout) : on ne sait pas
        // combien d'octets Google a réellement reçus. Une SEULE sonde tranche —
        // elle peut aussi révéler que l'upload était en fait déjà terminé.
        attempt = await this.recoverOrThrow(options, attempt, err)
        const probed = await this.probeCompletion(options)
        if (probed.completed) return { videoId: probed.videoId }
        offset = probed.offset
        continue
      }

      const status = response.status

      if (status === 308) {
        const confirmed = this.parseRangeEnd(response.headers as never)
        if (confirmed === null) {
          // Range absent ou illisible : on ne devine pas, on sonde.
          const probed = await this.probeCompletion(options)
          if (probed.completed) return { videoId: probed.videoId }
          offset = probed.offset
        } else {
          offset = this.assertProgress(confirmed + 1, options.totalSize, offset)
        }
        // Progression confirmée : le compteur de reprises repart de zéro.
        attempt = 0
        continue
      }

      if (status === 200 || status === 201) {
        return { videoId: this.extractVideoId(response.data) }
      }

      if (TRANSIENT_STATUSES.has(status)) {
        attempt = await this.recoverOrThrow(options, attempt, null, response)
        const probed = await this.probeCompletion(options)
        if (probed.completed) return { videoId: probed.videoId }
        offset = probed.offset
        continue
      }

      // 4xx : refus définitif (droits, quota, requête invalide…).
      throw this.permanentFailure(status, response.data)
    }

    // Tous les octets sont confirmés mais aucune réponse finale n'a été reçue :
    // la sonde tranche (upload terminé, ou session encore incomplète).
    const probed = await this.probeCompletion(options)
    if (probed.completed) return { videoId: probed.videoId }
    throw new YouTubeContentError({
      serviceErrorCode: 'upload_response_invalid',
      httpStatus: 0,
      message:
        "Transfert terminé sans réponse finale exploitable de YouTube : vérifiez l'état de la vidéo avant de republier.",
    })
  }

  /// Envoie un bloc `[start, end]`. Le corps est un flux BORNÉ : à aucun moment
  /// le bloc n'existe sous forme de Buffer complet.
  private async sendChunk(
    options: ResumableUploadOptions,
    start: number,
    end: number,
  ): Promise<AxiosResponse<unknown>> {
    const length = end - start + 1
    const stream = await this.mediaReader.openRange(options.mediaRef, start, end)

    try {
      return await firstValueFrom(
        this.http.put(options.sessionUrl, stream, {
          headers: {
            Authorization: `Bearer ${options.accessToken}`,
            'Content-Type': options.mimeType,
            'Content-Length': String(length),
            'Content-Range': `bytes ${start}-${end}/${options.totalSize}`,
          },
          timeout: options.requestTimeoutMs,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          // 308 n'est pas une erreur ici : c'est la progression normale.
          validateStatus: () => true,
          // La réponse est du JSON ou rien — surtout pas une transformation
          // du flux envoyé.
          responseType: 'json',
        }),
      )
    } finally {
      // Le flux est refermé quoi qu'il arrive : succès, erreur, timeout.
      this.destroyStream(stream)
    }
  }

  /// Sonde l'état de la session : `PUT` vide avec `Content-Range: bytes * /total`.
  /// N'OUVRE JAMAIS le fichier média.
  private async probeSession(
    options: ResumableUploadOptions,
  ): Promise<AxiosResponse<unknown>> {
    try {
      return await firstValueFrom(
        this.http.put(options.sessionUrl, undefined, {
          headers: {
            Authorization: `Bearer ${options.accessToken}`,
            'Content-Length': '0',
            'Content-Range': `bytes */${options.totalSize}`,
          },
          timeout: options.requestTimeoutMs,
          validateStatus: () => true,
          responseType: 'json',
        }),
      )
    } catch {
      throw new YouTubeContentError({
        serviceErrorCode: 'upload_interrupted',
        httpStatus: 0,
        message:
          "Impossible de vérifier l'état de la session d'upload YouTube (incident réseau).",
      })
    }
  }

  /// Sonde unique : soit la session est terminée (et porte l'id de la vidéo),
  /// soit elle indique l'offset réellement confirmé par Google.
  private async probeCompletion(
    options: ResumableUploadOptions,
  ): Promise<
    | { completed: true; videoId: string }
    | { completed: false; offset: number }
  > {
    const response = await this.probeSession(options)
    const status = response.status

    if (status === 308) {
      const confirmed = this.parseRangeEnd(response.headers as never)
      // Range absent = aucun octet confirmé : on reprend à 0.
      return { completed: false, offset: confirmed === null ? 0 : confirmed + 1 }
    }
    if (status === 200 || status === 201) {
      return { completed: true, videoId: this.extractVideoId(response.data) }
    }
    if (status === 404 || status === 410) {
      throw new YouTubeContentError({
        serviceErrorCode: 'upload_session_expired',
        httpStatus: status,
        message:
          "La session d'upload YouTube a expiré : relancez la publication.",
      })
    }
    if (TRANSIENT_STATUSES.has(status)) {
      throw new YouTubeContentError({
        serviceErrorCode: 'upload_interrupted',
        httpStatus: status,
        message: "État de la session d'upload YouTube momentanément indisponible.",
      })
    }
    throw this.permanentFailure(status, response.data)
  }

  /// Décide si une reprise est permise, applique le backoff, et renvoie le
  /// numéro de tentative suivant. Lève quand le budget est épuisé.
  private async recoverOrThrow(
    options: ResumableUploadOptions,
    attempt: number,
    cause: unknown,
    response?: AxiosResponse<unknown>,
  ): Promise<number> {
    if (attempt >= options.maxRetries) {
      // Message prudent : l'état réel côté Google reste inconnu. Ne JAMAIS
      // relancer une seconde session automatiquement — on créerait un doublon.
      throw new YouTubeContentError({
        serviceErrorCode: 'upload_interrupted',
        httpStatus: response?.status ?? 0,
        message:
          "Transfert YouTube interrompu après plusieurs tentatives : l'état de la vidéo est indéterminé, vérifiez la chaîne avant de republier.",
      })
    }
    if (cause !== null && cause !== undefined && !this.isTransientError(cause)) {
      throw cause
    }

    const delay =
      this.retryAfterMs(response) ?? options.retryBaseMs * 2 ** attempt
    this.logger.warn(
      `Transfert YouTube interrompu — nouvelle tentative ${attempt + 1}/${options.maxRetries} dans ${delay} ms`,
    )
    await this.delay(delay)
    return attempt + 1
  }

  /// `Retry-After` en secondes (ou date HTTP), borné pour éviter une attente
  /// déraisonnable dictée par la réponse.
  private retryAfterMs(response?: AxiosResponse<unknown>): number | null {
    const raw = this.header(response?.headers as never, 'retry-after')
    if (!raw) return null
    const seconds = Number(raw)
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
    }
    const date = Date.parse(raw)
    if (Number.isNaN(date)) return null
    return Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_AFTER_MS)
  }

  /// Seules les coupures réseau et les timeouts sont réessayables ; une erreur
  /// applicative (média invalide, plage incohérente) ne l'est jamais.
  private isTransientError(err: unknown): boolean {
    if (err instanceof YouTubeContentError) return false
    if (typeof err !== 'object' || err === null) return false
    const candidate = err as { code?: string; response?: unknown }
    if (candidate.response) return false
    return typeof candidate.code === 'string'
  }

  /// Extrait la borne haute confirmée d'un en-tête `Range: bytes=0-N`.
  /// Renvoie `null` si l'en-tête est absent ou illisible — auquel cas on SONDE
  /// plutôt que de supposer une progression.
  private parseRangeEnd(headers: Record<string, unknown>): number | null {
    const raw = this.header(headers, 'range')
    if (!raw) return null
    const match = /^bytes=(\d+)-(\d+)$/.exec(raw.trim())
    if (!match) return null
    const start = Number(match[1])
    const end = Number(match[2])
    // Google confirme toujours une plage continue depuis 0 ; toute autre forme
    // est suspecte et déclenche une sonde.
    if (start !== 0 || !Number.isInteger(end) || end < 0) return null
    return end
  }

  /// Refuse toute progression incohérente : un offset qui recule, dépasse la
  /// taille totale ou n'avance pas ferait boucler indéfiniment.
  private assertProgress(
    nextOffset: number,
    totalSize: number,
    previousOffset: number,
  ): number {
    if (
      !Number.isInteger(nextOffset) ||
      nextOffset <= previousOffset ||
      nextOffset > totalSize
    ) {
      throw new YouTubeContentError({
        serviceErrorCode: 'upload_response_invalid',
        httpStatus: 308,
        message: "Progression d'upload YouTube incohérente.",
      })
    }
    return nextOffset
  }

  /// Valide la ressource finale : `id` doit être une chaîne non vide. Ni une
  /// valeur numérique, ni une chaîne vide ne sont acceptées.
  private extractVideoId(data: unknown): string {
    if (typeof data === 'object' && data !== null) {
      const id = (data as { id?: unknown }).id
      if (typeof id === 'string' && id.trim()) return id
    }
    throw new YouTubeContentError({
      serviceErrorCode: 'upload_response_invalid',
      httpStatus: 0,
      message: "Réponse finale YouTube sans identifiant de vidéo exploitable.",
    })
  }

  /// Échec définitif. Ne conserve que le statut et le motif Google : jamais le
  /// corps brut, qui peut contenir l'URI de session ou des jetons.
  private permanentFailure(status: number, data: unknown): YouTubeContentError {
    const reason = this.googleReason(data)
    return new YouTubeContentError({
      serviceErrorCode: reason ?? 'upload_failed',
      httpStatus: status,
      ...(reason ? { googleReason: reason } : {}),
      message: `Transfert YouTube refusé (HTTP ${status}${reason ? `, ${reason}` : ''}).`,
    })
  }

  private googleReason(data: unknown): string | undefined {
    if (typeof data !== 'object' || data === null) return undefined
    const error = (data as { error?: { errors?: { reason?: unknown }[] } }).error
    const reason = error?.errors?.[0]?.reason
    return typeof reason === 'string' ? reason : undefined
  }

  /// Lecture d'en-tête insensible à la casse (axios normalise en minuscules,
  /// mais un mock ou un proxy peut ne pas le faire).
  private header(
    headers: Record<string, unknown> | undefined,
    name: string,
  ): string | null {
    if (!headers) return null
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === name && typeof value === 'string') return value
    }
    return null
  }

  private destroyStream(stream: NodeJS.ReadableStream): void {
    const destroyable = stream as { destroy?: () => void }
    if (typeof destroyable.destroy === 'function') destroyable.destroy()
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
