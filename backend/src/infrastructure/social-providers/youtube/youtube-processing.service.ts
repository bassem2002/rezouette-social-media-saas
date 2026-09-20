import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'
import type {
  YouTubeProcessingGateway,
  YouTubeProcessingProgress,
  YouTubeProcessingStatus,
  YouTubeVideoProcessingResult,
} from '../../../application/social/ports/youtube-processing.gateway.js'
import { YouTubeContentError } from '../../../application/social/errors/youtube-content.error.js'
import {
  isYouTubeConfigured,
  type YouTubeConfig,
} from '../../../config/youtube.config.js'
import type { YouTubeVideoStatusResponse } from './youtube-api.types.js'

/// Valeurs documentées par l'API Data v3. Toute autre valeur est écartée plutôt
/// que propagée : on ne laisse pas une chaîne arbitraire de Google traverser la
/// frontière et finir dans un message ou en base.
const UPLOAD_STATUSES = new Set([
  'uploaded',
  'processed',
  'failed',
  'rejected',
  'deleted',
])
const PROCESSING_STATUSES = new Set([
  'processing',
  'succeeded',
  'failed',
  'terminated',
])
const FAILURE_REASONS = new Set([
  'codec',
  'conversion',
  'emptyFile',
  'invalidFile',
  'tooSmall',
  'uploadAborted',
])
const REJECTION_REASONS = new Set([
  'claim',
  'copyright',
  'duplicate',
  'inappropriate',
  'legal',
  'length',
  'termsOfUse',
  'trademark',
  'uploaderAccountClosed',
  'uploaderAccountSuspended',
])
const PROCESSING_FAILURE_REASONS = new Set([
  'other',
  'streamingFailed',
  'transcodeFailed',
  'uploadFailed',
])

/// Valeur de repli quand Google renvoie un motif hors nomenclature : on signale
/// qu'un motif existe, sans recopier sa valeur.
const UNKNOWN_REASON = 'unknown'

/// Lecture de l'état de traitement d'une vidéo (YouTube Data API v3).
///
/// Séparé de `YouTubeContentService` : cette lecture doit rester possible même
/// quand la publication est désactivée. Sa seule exigence est une configuration
/// YouTube complète.
///
/// AUCUN retry interne : le scheduler repassera au cycle suivant. Réessayer ici
/// masquerait la cadence réelle et multiplierait la consommation de quota.
@Injectable()
export class YouTubeProcessingService implements YouTubeProcessingGateway {
  private readonly logger = new Logger(YouTubeProcessingService.name)

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get youtube(): YouTubeConfig {
    return this.config.getOrThrow<YouTubeConfig>('youtube')
  }

  assertConfigured(): void {
    if (!isYouTubeConfigured(this.youtube)) {
      throw new YouTubeContentError({
        serviceErrorCode: 'publishing_not_configured',
        httpStatus: 503,
        message: "L'intégration YouTube n'est pas configurée.",
      })
    }
  }

  async getVideoProcessingStatus(input: {
    accessToken: string
    videoId: string
  }): Promise<YouTubeVideoProcessingResult> {
    this.assertConfigured()
    const cfg = this.youtube

    let response
    try {
      response = await firstValueFrom(
        this.http.get<YouTubeVideoStatusResponse>(`${cfg.apiBaseUrl}/videos`, {
          // `part` minimal : demander fileDetails ou statistics coûterait du
          // quota sans rien apporter. Pas de `maxResults` avec un filtre `id`.
          params: { part: 'status,processingDetails', id: input.videoId },
          headers: { Authorization: `Bearer ${input.accessToken}` },
          timeout: cfg.reconcileRequestTimeoutMs,
          validateStatus: () => true,
        }),
      )
    } catch (err) {
      // Aucune réponse : incident réseau ou dépassement de délai.
      throw new YouTubeContentError({
        serviceErrorCode: 'processing_timeout',
        httpStatus: 0,
        message: this.isTimeout(err)
          ? "Délai dépassé lors de la lecture de l'état de la vidéo."
          : "Lecture de l'état de la vidéo YouTube impossible (incident réseau).",
      })
    }

    if (response.status !== 200) {
      throw this.fromHttpStatus(response.status, response.data)
    }
    return this.parse(response.data, input.videoId)
  }

  /// Traduit un statut HTTP en erreur de traitement normalisée. Ne conserve que
  /// le statut et le motif Google — jamais le corps brut.
  private fromHttpStatus(status: number, data: unknown): YouTubeContentError {
    const reason = this.googleReason(data)
    if (status === 404) {
      return new YouTubeContentError({
        serviceErrorCode: 'video_not_found',
        httpStatus: 404,
        message: 'Vidéo introuvable côté YouTube.',
      })
    }
    if (status === 401) {
      return new YouTubeContentError({
        serviceErrorCode: 'processing_permission_denied',
        httpStatus: 401,
        ...(reason ? { googleReason: reason } : {}),
        message: "Accès refusé à l'état de la vidéo (token rejeté).",
      })
    }
    if (status === 403) {
      // Quota et débit sont distincts d'une permission insuffisante : les
      // premiers se résorbent d'eux-mêmes, la seconde exige une action.
      const code =
        reason && /quota|rateLimit/i.test(reason)
          ? 'processing_rate_limited'
          : 'processing_permission_denied'
      return new YouTubeContentError({
        serviceErrorCode: code,
        httpStatus: 403,
        ...(reason ? { googleReason: reason } : {}),
        message: "Accès refusé à l'état de la vidéo YouTube.",
      })
    }
    if (status === 429) {
      return new YouTubeContentError({
        serviceErrorCode: 'processing_rate_limited',
        httpStatus: 429,
        message: 'Débit YouTube dépassé lors de la lecture du statut.',
      })
    }
    return new YouTubeContentError({
      serviceErrorCode: 'processing_request_failed',
      httpStatus: status,
      ...(reason ? { googleReason: reason } : {}),
      message: `Lecture de l'état de la vidéo YouTube échouée (HTTP ${status}).`,
    })
  }

  /// Valide la réponse et n'en extrait QUE les champs autorisés.
  private parse(data: unknown, videoId: string): YouTubeVideoProcessingResult {
    if (typeof data !== 'object' || data === null) {
      throw this.invalidResponse()
    }
    const items = (data as YouTubeVideoStatusResponse).items
    if (!Array.isArray(items)) throw this.invalidResponse()

    const item = items.find((candidate) => candidate?.id === videoId)
    if (!item || typeof item.id !== 'string' || !item.id.trim()) {
      // Liste vide, id différent : la vidéo demandée n'est pas (ou plus) là.
      throw new YouTubeContentError({
        serviceErrorCode: 'video_not_found',
        httpStatus: 404,
        message: 'Vidéo introuvable côté YouTube.',
      })
    }

    const uploadStatus = this.pick(item.status?.uploadStatus, UPLOAD_STATUSES)
    const processingStatus = this.pick(
      item.processingDetails?.processingStatus,
      PROCESSING_STATUSES,
    )
    const status = this.classify(uploadStatus, processingStatus)

    const failureReason =
      this.pickOrUnknown(item.status?.failureReason, FAILURE_REASONS) ??
      this.pickOrUnknown(
        item.processingDetails?.processingFailureReason,
        PROCESSING_FAILURE_REASONS,
      )
    const rejectionReason = this.pickOrUnknown(
      item.status?.rejectionReason,
      REJECTION_REASONS,
    )
    const progress = this.pickProgress(item.processingDetails?.processingProgress)

    return {
      videoId: item.id,
      status,
      ...(uploadStatus ? { uploadStatus } : {}),
      ...(processingStatus ? { processingStatus } : {}),
      ...(failureReason ? { failureReason } : {}),
      ...(rejectionReason ? { rejectionReason } : {}),
      ...(progress ? { progress } : {}),
    }
  }

  /// Classification, dans un ORDRE STRICT. Un rejet ou un échec d'upload prime
  /// toujours sur un `processingStatus` contradictoire : YouTube peut annoncer
  /// « succeeded » pour l'encodage d'une vidéo pourtant rejetée.
  private classify(
    uploadStatus: string | undefined,
    processingStatus: string | undefined,
  ): YouTubeProcessingStatus {
    if (uploadStatus === 'rejected') return 'rejected'
    if (uploadStatus === 'failed') return 'failed'
    if (uploadStatus === 'deleted') return 'deleted'
    if (processingStatus === 'failed') return 'failed'
    if (processingStatus === 'succeeded') return 'succeeded'
    if (uploadStatus === 'processed') return 'succeeded'
    if (processingStatus === 'processing') return 'processing'
    if (uploadStatus === 'uploaded') return 'processing'
    if (processingStatus === 'terminated') return 'terminated'
    // Combinaison inconnue ou champs absents : ne rien supposer.
    throw this.invalidResponse()
  }

  /// Retient la valeur si elle appartient à la nomenclature, sinon `undefined`.
  private pick(value: unknown, allowed: Set<string>): string | undefined {
    return typeof value === 'string' && allowed.has(value) ? value : undefined
  }

  /// Comme `pick`, mais signale l'existence d'un motif hors nomenclature sans
  /// en recopier la valeur.
  private pickOrUnknown(
    value: unknown,
    allowed: Set<string>,
  ): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined
    return allowed.has(value) ? value : UNKNOWN_REASON
  }

  /// Progression : uniquement des compteurs, jamais d'URL ni d'identifiant.
  private pickProgress(value: unknown): YouTubeProcessingProgress | undefined {
    if (typeof value !== 'object' || value === null) return undefined
    const raw = value as Record<string, unknown>
    const progress: YouTubeProcessingProgress = {
      ...(typeof raw['partsProcessed'] === 'string'
        ? { partsProcessed: raw['partsProcessed'] }
        : {}),
      ...(typeof raw['partsTotal'] === 'string'
        ? { partsTotal: raw['partsTotal'] }
        : {}),
      ...(typeof raw['timeLeftMs'] === 'string'
        ? { timeLeftMs: raw['timeLeftMs'] }
        : {}),
    }
    return Object.keys(progress).length > 0 ? progress : undefined
  }

  private invalidResponse(): YouTubeContentError {
    this.logger.warn('Réponse de statut YouTube inexploitable')
    return new YouTubeContentError({
      serviceErrorCode: 'processing_response_invalid',
      httpStatus: 502,
      message: "État de traitement YouTube inexploitable.",
    })
  }

  private isTimeout(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false
    const candidate = err as { code?: string; message?: string }
    return (
      candidate.code === 'ECONNABORTED' ||
      candidate.code === 'ETIMEDOUT' ||
      /timeout/i.test(candidate.message ?? '')
    )
  }

  private googleReason(data: unknown): string | undefined {
    if (typeof data !== 'object' || data === null) return undefined
    const error = (data as { error?: { errors?: { reason?: unknown }[] } }).error
    const reason = error?.errors?.[0]?.reason
    return typeof reason === 'string' ? reason : undefined
  }
}
