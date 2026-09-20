import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { SOCIAL_POST_REPOSITORY } from '../../../domain/social-post/repositories/social-post.repository.js'
import type { SocialPostRepository } from '../../../domain/social-post/repositories/social-post.repository.js'
import type { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import type { SocialPost } from '../../../domain/social-post/entities/social-post.entity.js'
import { YouTubeErrorReason } from '../../../domain/social/errors/youtube-error-reason.enum.js'
import {
  isYouTubeConfigured,
  type YouTubeConfig,
} from '../../../config/youtube.config.js'
import { YOUTUBE_PROCESSING_GATEWAY } from '../ports/youtube-processing.gateway.js'
import type {
  YouTubeProcessingGateway,
  YouTubeVideoProcessingResult,
} from '../ports/youtube-processing.gateway.js'
import { extractYouTubeErrorPayload } from '../errors/youtube-content.error.js'
import type { MappedPublicationError } from '../services/mapped-publication-error.js'
import { YouTubeExceptionMapper } from '../services/youtube-exception-mapper.js'
import { YouTubeTokenService } from '../services/youtube-token.service.js'

export interface ReconcileYouTubeVideosSummary {
  /// Publications PENDING examinées durant le cycle.
  scanned: number
  /// Passées à PUBLISHED (traitement confirmé par YouTube).
  published: number
  /// Passées à FAILED (échec, rejet, suppression, ou abandon pour ancienneté).
  failed: number
  /// Encore en cours de traitement côté YouTube.
  stillProcessing: number
  /// Laissées PENDING volontairement (incident transitoire, délai de grâce…).
  deferred: number
  /// Abandonnées pour dépassement de l'âge maximal (sous-ensemble de `failed`).
  stale: number
}

/// Réconcilie l'historique avec l'état réel des vidéos côté YouTube.
///
/// Une vidéo envoyée reste PENDING : YouTube l'encode en arrière-plan et le
/// traitement peut encore échouer. Ce use case interroge `videos.list` et
/// applique la transition terminale — ou laisse la publication en attente.
///
/// Trois interdits structurants :
/// - il ne REPUBLIE jamais (aucun appel à PublishYouTubeUseCase, aucun upload) ;
/// - il ne conclut jamais au succès sur un état ambigu ;
/// - il ne marque jamais FAILED sur un incident transitoire.
@Injectable()
export class ReconcileYouTubeVideosUseCase {
  private readonly logger = new Logger(ReconcileYouTubeVideosUseCase.name)

  constructor(
    @Inject(SOCIAL_POST_REPOSITORY)
    private readonly socialPosts: SocialPostRepository,
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
    @Inject(YOUTUBE_PROCESSING_GATEWAY)
    private readonly processing: YouTubeProcessingGateway,
    private readonly tokenService: YouTubeTokenService,
    private readonly mapper: YouTubeExceptionMapper,
    private readonly config: ConfigService,
  ) {}

  private get youtube(): YouTubeConfig {
    return this.config.getOrThrow<YouTubeConfig>('youtube')
  }

  async execute(now: Date = new Date()): Promise<ReconcileYouTubeVideosSummary> {
    const summary = this.emptySummary()
    const cfg = this.youtube

    // Sans configuration : aucun réseau, et surtout aucune publication marquée
    // en échec — l'absence de credentials n'est pas un échec de la vidéo.
    if (!isYouTubeConfigured(cfg)) return summary

    const pending = await this.socialPosts.findPendingByPlatform(
      'youtube',
      cfg.reconcileBatchSize,
    )
    summary.scanned = pending.length

    for (const post of pending) {
      try {
        await this.reconcileOne(post, cfg, now, summary)
      } catch (err) {
        // Filet : une ligne en erreur inattendue ne doit jamais interrompre le
        // lot, ni faire perdre les transitions déjà appliquées.
        summary.deferred += 1
        this.logger.warn(
          `Réconciliation YouTube ${post.id} ignorée ce cycle : ${this.safeLabel(err)}`,
        )
      }
    }

    return summary
  }

  private async reconcileOne(
    post: SocialPost,
    cfg: YouTubeConfig,
    now: Date,
    summary: ReconcileYouTubeVideosSummary,
  ): Promise<void> {
    const ageMs = now.getTime() - post.createdAt.getTime()

    // A. Trop ancienne : on cesse de sonder indéfiniment. Aucun appel Google.
    if (ageMs > cfg.reconcileMaxAgeHours * 3_600_000) {
      await this.fail(
        post,
        this.error(YouTubeErrorReason.PROCESSING_FAILED, 504),
        'Le délai maximal de traitement YouTube a été dépassé. Vérifiez la vidéo dans YouTube Studio.',
      )
      summary.failed += 1
      summary.stale += 1
      return
    }

    // B. Aucun identifiant de vidéo : rien à interroger. On n'en fabrique pas,
    // et on ne réutilise pas `externalPostId` comme substitut.
    if (!post.publishId) {
      summary.deferred += 1
      return
    }

    // C/D. Chaîne d'origine.
    if (!post.accountId) {
      await this.fail(
        post,
        this.error(YouTubeErrorReason.CHANNEL_NOT_FOUND, 404),
        'Chaîne YouTube inconnue pour cette publication.',
      )
      summary.failed += 1
      return
    }
    const account = await this.resolveAccount(post)
    if (!account) {
      await this.fail(
        post,
        this.error(YouTubeErrorReason.CHANNEL_NOT_FOUND, 404),
        'La chaîne YouTube de cette publication est introuvable.',
      )
      summary.failed += 1
      return
    }

    // E/F. Token frais, puis lecture du statut.
    let result: YouTubeVideoProcessingResult
    try {
      result = await this.fetchStatus(post, account)
    } catch (err) {
      await this.handleFailure(post, err, ageMs, cfg, summary)
      return
    }

    await this.applyStatus(post, result, summary)
  }

  /// Lecture du statut, avec UN SEUL réessai après un 401 : Google peut rejeter
  /// un token que notre horloge croit encore valide. Le second 401 est terminal.
  private async fetchStatus(
    post: SocialPost,
    account: SocialAccount,
  ): Promise<YouTubeVideoProcessingResult> {
    const fresh = await this.tokenService.ensureFresh({
      userId: post.userId,
      accountId: account.id,
    })

    try {
      return await this.processing.getVideoProcessingStatus({
        accessToken: fresh.accessToken,
        videoId: post.publishId as string,
      })
    } catch (err) {
      if (!this.isUnauthorized(err)) throw err

      const forced = await this.tokenService.ensureFresh({
        userId: post.userId,
        accountId: account.id,
        forceRefresh: true,
      })
      // Une seule reprise : au-delà, l'erreur remonte telle quelle.
      return this.processing.getVideoProcessingStatus({
        accessToken: forced.accessToken,
        videoId: post.publishId as string,
      })
    }
  }

  private async applyStatus(
    post: SocialPost,
    result: YouTubeVideoProcessingResult,
    summary: ReconcileYouTubeVideosSummary,
  ): Promise<void> {
    switch (result.status) {
      case 'succeeded':
        post.markPublished(result.videoId)
        await this.socialPosts.save(post)
        summary.published += 1
        return

      case 'failed':
        await this.fail(
          post,
          this.error(YouTubeErrorReason.PROCESSING_FAILED, 502),
          `Le traitement de la vidéo a échoué côté YouTube (${result.failureReason ?? 'motif non précisé'}).`,
        )
        summary.failed += 1
        return

      case 'rejected':
        await this.fail(
          post,
          this.error(YouTubeErrorReason.VIDEO_REJECTED, 403),
          `La vidéo a été refusée par YouTube (${result.rejectionReason ?? 'motif non précisé'}).`,
        )
        summary.failed += 1
        return

      case 'deleted':
        await this.fail(
          post,
          this.error(YouTubeErrorReason.VIDEO_NOT_FOUND, 404),
          'La vidéo a été supprimée ou n’est plus disponible sur YouTube.',
        )
        summary.failed += 1
        return

      case 'terminated':
        // Traitement interrompu sans verdict : surtout NE PAS conclure au
        // succès. On patiente jusqu'à la limite d'âge.
        summary.deferred += 1
        return

      case 'processing':
      default:
        summary.stillProcessing += 1
        return
    }
  }

  /// Un échec de lecture ne condamne la publication que s'il est TERMINAL.
  private async handleFailure(
    post: SocialPost,
    err: unknown,
    ageMs: number,
    cfg: YouTubeConfig,
    summary: ReconcileYouTubeVideosSummary,
  ): Promise<void> {
    const code = extractYouTubeErrorPayload(err).serviceErrorCode

    // Vidéo introuvable juste après l'upload : Google ne l'a peut-être pas
    // encore indexée. On patiente pendant le délai de grâce.
    if (code === 'video_not_found') {
      if (ageMs <= cfg.reconcileNotFoundGraceSeconds * 1000) {
        summary.deferred += 1
        return
      }
      await this.fail(
        post,
        this.error(YouTubeErrorReason.VIDEO_NOT_FOUND, 404),
        "La vidéo est introuvable sur YouTube. Vérifiez la chaîne dans YouTube Studio.",
      )
      summary.failed += 1
      return
    }

    const mapped = this.mapper.map(err)
    if (mapped.retryable) {
      // Incident transitoire : la ligne reste PENDING et sera resondée. Le
      // diagnostic n'est PAS persisté (voir dettes) — seul un log le conserve.
      summary.deferred += 1
      this.logger.warn(
        `Réconciliation YouTube ${post.id} différée : ${mapped.reason}`,
      )
      return
    }

    await this.fail(post, mapped, this.mapper.describe(err))
    summary.failed += 1
  }

  private async resolveAccount(post: SocialPost): Promise<SocialAccount | null> {
    const accounts = await this.socialAccounts.findByUserId(post.userId)
    return (
      accounts.find(
        (candidate) =>
          candidate.id === post.accountId && candidate.platform === 'youtube',
      ) ?? null
    )
  }

  private async fail(
    post: SocialPost,
    mapped: MappedPublicationError,
    message: string,
  ): Promise<void> {
    post.markFailed(message, {
      code: mapped.code,
      subcode: mapped.subcode,
      reason: mapped.reason,
      retryable: mapped.retryable,
    })
    await this.socialPosts.save(post)
  }

  /// Diagnostic terminal normalisé, construit sans dépendre d'une exception.
  private error(
    reason: YouTubeErrorReason,
    code: number,
  ): MappedPublicationError {
    return {
      code,
      reason,
      retryable: false,
      action:
        reason === YouTubeErrorReason.CHANNEL_NOT_FOUND
          ? 'FIX_REQUEST'
          : 'CHECK_YOUTUBE',
    }
  }

  /// STRICTEMENT un 401 : un 403 signale une permission ou un quota, pas un
  /// token périmé — le renouveler n'y changerait rien et gâcherait du quota.
  private isUnauthorized(err: unknown): boolean {
    return extractYouTubeErrorPayload(err).httpStatus === 401
  }

  /// Libellé de log sûr : jamais de token, d'URL ni de corps brut.
  private safeLabel(err: unknown): string {
    return extractYouTubeErrorPayload(err).serviceErrorCode
  }

  private emptySummary(): ReconcileYouTubeVideosSummary {
    return {
      scanned: 0,
      published: 0,
      failed: 0,
      stillProcessing: 0,
      deferred: 0,
      stale: 0,
    }
  }
}
