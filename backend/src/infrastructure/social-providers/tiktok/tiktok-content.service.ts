import { HttpService } from '@nestjs/axios'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'
import {
  TikTokContentGateway,
  TikTokDirectPostInput,
  TikTokPublishResult,
} from '../../../application/social/ports/tiktok-content.gateway.js'
import {
  TikTokContentError,
  extractTikTokErrorPayload,
} from '../../../application/social/errors/tiktok-content.error.js'
import {
  MEDIA_READER_GATEWAY,
  type MediaReaderGateway,
  type MediaReadDescriptor,
} from '../../../application/media/ports/media-reader.gateway.js'
import { MediaAccessError } from '../../../application/media/errors/media-access.error.js'
import { ALLOWED_VIDEO_MIME_TYPES } from '../../../config/media.config.js'
import {
  TikTokFileUploader,
  planTikTokChunks,
  type TikTokChunkPlan,
} from './tiktok-file-uploader.js'
import {
  TikTokCreatorInfoResponse,
  TikTokPublishInitResponse,
  TikTokPublishStatusResponse,
} from './tiktok-content.types.js'

const API_BASE_URL = 'https://open.tiktokapis.com'

/// Codes réseau transitoires (aucune réponse HTTP) → réessai sûr des lectures
/// idempotentes (creator_info, status). L'init de publication n'est PAS réessayé
/// (non idempotent : risquerait un double post).
const RETRYABLE_NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
])
const MAX_RETRIES = 2
const RETRY_BACKOFF_MS = 800

/// Fenêtre de suivi asynchrone : au-delà, TikTok a accepté la tâche mais le
/// traitement n'est pas confirmé terminé → on retourne l'état `processing`
/// (livraison finale asynchrone ; réconciliation ultérieure hors périmètre MVP).
const MAX_POLL_ATTEMPTS = 6
const POLL_INTERVAL_MS = 2500

/// Confidentialité par défaut d'une app non auditée : seul SELF_ONLY est autorisé.
const DEFAULT_PRIVACY_LEVEL = 'SELF_ONLY'

/// Implémentation TikTok Content Posting API des appels de publication.
/// Seul endroit qui connaît axios/TikTok pour ces opérations. Ne touche ni à
/// l'OAuth ni à la persistance. Encapsule résolution du média → creator_info →
/// init → transfert des octets → polling statut.
///
/// TRANSFERT : source FILE_UPLOAD (et non PULL_FROM_URL). C'est Zernio qui
/// pousse les octets vers TikTok, au lieu de demander à TikTok d'aller les
/// chercher. Deux blocages disparaissent : l'URL du média n'a plus besoin d'être
/// joignable depuis Internet (impossible en développement), ni son domaine
/// d'être vérifié dans le portail développeur TikTok.
@Injectable()
export class TikTokContentService implements TikTokContentGateway {
  private readonly logger = new Logger(TikTokContentService.name)

  constructor(
    private readonly http: HttpService,
    @Inject(MEDIA_READER_GATEWAY)
    private readonly mediaReader: MediaReaderGateway,
    private readonly fileUploader: TikTokFileUploader,
  ) {}

  async publishVideoDirect(
    input: TikTokDirectPostInput,
  ): Promise<TikTokPublishResult> {
    // Le média est résolu EN PREMIER : inutile de consommer un appel
    // creator_info, ni surtout d'ouvrir une publication côté TikTok, pour un
    // fichier introuvable ou qui n'est pas une vidéo.
    const media = await this.resolveVideo(input.videoUrl)
    const plan = planTikTokChunks(media.size)

    const privacyLevel = await this.resolvePrivacyLevel(
      input.accessToken,
      input.privacyLevel,
    )
    const session = await this.initDirectPost(input, privacyLevel, media, plan)

    await this.fileUploader.upload({
      uploadUrl: session.uploadUrl,
      mediaRef: media.ref,
      totalSize: media.size,
      mimeType: media.mimeType,
      plan,
    })

    return this.pollUntilTerminal(session.publishId, input.accessToken)
  }

  /// Résout l'URL publique vers un média local ET vérifie que c'est bien une
  /// vidéo. Sans ce contrôle, une image partait vers `video/init/` et revenait
  /// en `INVALID_MEDIA` — un diagnostic bien plus obscur que le refus explicite
  /// rendu ici.
  private async resolveVideo(videoUrl: string): Promise<MediaReadDescriptor> {
    let media: MediaReadDescriptor
    try {
      media = await this.mediaReader.resolvePublicUrl(videoUrl)
    } catch (err) {
      if (err instanceof MediaAccessError) {
        throw new TikTokContentError({
          errorCode: 'media_unavailable',
          httpStatus: 0,
          message: `Média TikTok inexploitable : ${err.message}`,
        })
      }
      throw err
    }

    if (!(ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(media.mimeType)) {
      throw new TikTokContentError({
        errorCode: 'invalid_media_type',
        httpStatus: 0,
        message:
          `TikTok ne publie que des vidéos (MP4, MOV, WebM) ; le média fourni est ` +
          `de type ${media.mimeType}.`,
      })
    }

    return media
  }

  /// Interroge creator_info et choisit un niveau de confidentialité autorisé :
  /// la valeur demandée si permise, sinon SELF_ONLY, sinon la première option.
  private async resolvePrivacyLevel(
    accessToken: string,
    requested?: string,
  ): Promise<string> {
    try {
      const res = await this.withNetworkRetry('creator_info', () =>
        firstValueFrom(
          this.http.post<TikTokCreatorInfoResponse>(
            `${API_BASE_URL}/v2/post/publish/creator_info/query/`,
            {},
            { headers: this.authJsonHeaders(accessToken) },
          ),
        ),
      )
      this.assertNoApiError(res.data.error)
      const options = res.data.data?.privacy_level_options ?? []
      if (requested && options.includes(requested)) return requested
      if (options.includes(DEFAULT_PRIVACY_LEVEL)) return DEFAULT_PRIVACY_LEVEL
      return options[0] ?? DEFAULT_PRIVACY_LEVEL
    } catch (err) {
      this.logger.error(`creator_info TikTok échoué: ${this.describe(err)}`)
      throw new TikTokContentError(extractTikTokErrorPayload(err))
    }
  }

  /// Initialise la publication Direct Post (source FILE_UPLOAD) et ouvre la
  /// session de dépôt. Non réessayé : l'appel n'est pas idempotent et un second
  /// essai créerait une publication en double.
  private async initDirectPost(
    input: TikTokDirectPostInput,
    privacyLevel: string,
    media: MediaReadDescriptor,
    plan: TikTokChunkPlan,
  ): Promise<{ publishId: string; uploadUrl: string }> {
    try {
      const res = await firstValueFrom(
        this.http.post<TikTokPublishInitResponse>(
          `${API_BASE_URL}/v2/post/publish/video/init/`,
          {
            post_info: {
              title: input.caption,
              privacy_level: privacyLevel,
              disable_comment: false,
              disable_duet: false,
              disable_stitch: false,
            },
            // Le découpage annoncé ici ENGAGE le transfert qui suit : les
            // en-têtes Content-Range devront s'y conformer exactement.
            source_info: {
              source: 'FILE_UPLOAD',
              video_size: media.size,
              chunk_size: plan.chunkSize,
              total_chunk_count: plan.totalChunkCount,
            },
          },
          { headers: this.authJsonHeaders(input.accessToken) },
        ),
      )
      this.assertNoApiError(res.data.error)
      const publishId = res.data.data?.publish_id
      const uploadUrl = res.data.data?.upload_url
      if (!publishId || !uploadUrl) {
        throw new TikTokContentError({
          errorCode: 'init_incomplete',
          httpStatus: 0,
          message:
            "Réponse video/init TikTok incomplète (publish_id ou upload_url absent)",
        })
      }
      return { publishId, uploadUrl }
    } catch (err) {
      if (err instanceof TikTokContentError) throw err
      this.logger.error(`init Direct Post TikTok échoué: ${this.describe(err)}`)
      throw new TikTokContentError(extractTikTokErrorPayload(err))
    }
  }

  /// Suit le statut jusqu'à PUBLISH_COMPLETE / FAILED, ou retourne `processing`
  /// si la fenêtre de polling est épuisée sans état terminal.
  private async pollUntilTerminal(
    publishId: string,
    accessToken: string,
  ): Promise<TikTokPublishResult> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await this.delay(POLL_INTERVAL_MS)

      let data: TikTokPublishStatusResponse['data']
      try {
        const res = await this.withNetworkRetry('status/fetch', () =>
          firstValueFrom(
            this.http.post<TikTokPublishStatusResponse>(
              `${API_BASE_URL}/v2/post/publish/status/fetch/`,
              { publish_id: publishId },
              { headers: this.authJsonHeaders(accessToken) },
            ),
          ),
        )
        this.assertNoApiError(res.data.error, publishId)
        data = res.data.data
      } catch (err) {
        if (err instanceof TikTokContentError) throw err
        throw new TikTokContentError(extractTikTokErrorPayload(err), publishId)
      }

      const status = data?.status
      if (status === 'PUBLISH_COMPLETE') {
        return { publishId, postId: this.extractPostId(data), status: 'complete' }
      }
      if (status === 'FAILED') {
        throw new TikTokContentError(
          {
            errorCode: data?.fail_reason ?? 'publish_failed',
            httpStatus: 0,
            message: `Publication TikTok échouée (${data?.fail_reason ?? 'raison inconnue'})`,
          },
          publishId,
        )
      }
      // Sinon : PROCESSING_* ou SEND_TO_USER_INBOX → on continue le polling.
    }

    this.logger.warn(
      `Publication TikTok ${publishId} toujours en traitement après ${MAX_POLL_ATTEMPTS} vérifications — acceptée (livraison asynchrone).`,
    )
    return { publishId, postId: null, status: 'processing' }
  }

  private extractPostId(
    data: TikTokPublishStatusResponse['data'],
  ): string | null {
    const ids =
      data?.publicaly_available_post_id ?? data?.publicly_available_post_id
    const id = ids?.[0]
    return id !== undefined ? String(id) : null
  }

  private authJsonHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }
  }

  /// Lève une TikTokContentError si la réponse porte une erreur applicative.
  private assertNoApiError(
    error: { code?: string; message?: string } | undefined,
    publishId?: string,
  ): void {
    if (error && error.code && error.code !== 'ok') {
      throw new TikTokContentError(
        {
          errorCode: error.code,
          httpStatus: 0,
          message: error.message ?? 'Erreur TikTok',
        },
        publishId,
      )
    }
  }

  /// Réessaie uniquement les échecs de connexion transitoires (backoff exponentiel).
  /// Les erreurs applicatives TikTok (avec réponse) ne sont JAMAIS réessayées.
  private async withNetworkRetry<T>(
    label: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await operation()
      } catch (err) {
        if (attempt >= MAX_RETRIES || !this.isRetryableNetworkError(err)) {
          throw err
        }
        const delay = RETRY_BACKOFF_MS * 2 ** attempt
        const code = (err as { code?: string }).code
        this.logger.warn(
          `${label}: erreur réseau transitoire (${code}) — nouvel essai ` +
            `${attempt + 1}/${MAX_RETRIES} dans ${delay} ms`,
        )
        await this.delay(delay)
      }
    }
  }

  private isRetryableNetworkError(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false
    const e = err as { response?: unknown; code?: string }
    if (e.response) return false
    return typeof e.code === 'string' && RETRYABLE_NETWORK_CODES.has(e.code)
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private describe(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'response' in err) {
      const response = (err as { response?: { data?: unknown } }).response
      if (response?.data) return JSON.stringify(response.data)
    }
    return err instanceof Error ? err.message : String(err)
  }
}
