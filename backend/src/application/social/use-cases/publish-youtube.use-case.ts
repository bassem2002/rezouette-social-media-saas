import { Inject, Injectable } from '@nestjs/common'
import { YOUTUBE_CONTENT_GATEWAY } from '../ports/youtube-content.gateway.js'
import type { YouTubeContentGateway } from '../ports/youtube-content.gateway.js'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { SOCIAL_POST_REPOSITORY } from '../../../domain/social-post/repositories/social-post.repository.js'
import type { SocialPostRepository } from '../../../domain/social-post/repositories/social-post.repository.js'
import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import { SocialPost } from '../../../domain/social-post/entities/social-post.entity.js'
import { YouTubeErrorReason } from '../../../domain/social/errors/youtube-error-reason.enum.js'
import {
  YOUTUBE_DEFAULT_PRIVACY_STATUS,
  YOUTUBE_DESCRIPTION_MAX_LENGTH,
  YOUTUBE_TITLE_MAX_LENGTH,
  isYouTubePrivacyStatus,
  normalizeYouTubeTags,
  type YouTubePrivacyStatus,
} from '../../../domain/social/value-objects/youtube-video-options.js'
import type { MappedPublicationError } from '../services/mapped-publication-error.js'
import { YouTubeExceptionMapper } from '../services/youtube-exception-mapper.js'
import { YouTubeTokenService } from '../services/youtube-token.service.js'

/// Scope Google indispensable pour publier une vidéo.
export const YOUTUBE_UPLOAD_SCOPE =
  'https://www.googleapis.com/auth/youtube.upload'

export interface PublishYouTubeInput {
  userId: string
  /// Chaîne cible (id interne du SocialAccount). OBLIGATOIRE : YouTube est
  /// multi-chaînes, la destination ne peut pas être devinée.
  accountId: string
  videoUrl: string
  title: string
  description?: string
  tags?: string[]
  categoryId?: string
  privacyStatus?: YouTubePrivacyStatus
  madeForKids: boolean
  containsSyntheticMedia?: boolean
  notifySubscribers?: boolean
}

/// Résultat d'une publication YouTube. Le succès distingue explicitement une
/// vidéo ENCORE EN TRAITEMENT (`processing: true`, historique laissé PENDING)
/// d'une vidéo réellement publiée — nuance absente du `PublicationOutcome`
/// générique, qui suppose une publication synchrone.
export type YouTubePublicationOutcome =
  | {
      success: true
      processing: boolean
      /// Renseigné uniquement quand le traitement est terminé.
      externalPostId: string | null
      /// Identifiant de la vidéo, connu dès l'acceptation.
      publishId: string
    }
  | { success: false; error: MappedPublicationError; message: string }

/// Publie une vidéo sur une chaîne YouTube de l'utilisateur.
///
/// Comme TikTok et LinkedIn, ce use case écrit lui-même sa ligne d'historique
/// (classification via YouTubeExceptionMapper), sans passer par le
/// PublicationRecorder — spécifique à Meta.
///
/// Différence majeure avec TikTok : une vidéo acceptée mais encore en cours de
/// traitement reste **PENDING**. Marquer PUBLISHED à ce stade serait faux — le
/// traitement peut encore échouer (l'antipattern présent côté TikTok).
@Injectable()
export class PublishYouTubeUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
    @Inject(YOUTUBE_CONTENT_GATEWAY)
    private readonly content: YouTubeContentGateway,
    @Inject(SOCIAL_POST_REPOSITORY)
    private readonly socialPosts: SocialPostRepository,
    private readonly tokenService: YouTubeTokenService,
    private readonly mapper: YouTubeExceptionMapper,
  ) {}

  async execute(input: PublishYouTubeInput): Promise<YouTubePublicationOutcome> {
    // ── 1. Validations de forme : aucune écriture, aucun réseau ────────────
    const invalid = this.validate(input)
    if (invalid) return invalid

    const title = input.title.trim()
    const videoUrl = input.videoUrl.trim()
    const tags = normalizeYouTubeTags(input.tags)
    const privacyStatus = input.privacyStatus ?? YOUTUBE_DEFAULT_PRIVACY_STATUS

    // ── 2. Résolution de la chaîne cible ──────────────────────────────────
    const account = await this.resolveAccount(input.userId, input.accountId)
    if (!account) {
      // Précondition non archivée : sans compte, on ne sait pas à quelle chaîne
      // rattacher la trace, et l'appelant a fourni une cible inexistante.
      return this.failure(
        this.mapper.forChannelNotFound(),
        "Aucune chaîne YouTube correspondante pour cet utilisateur.",
      )
    }

    // ── 3. Scope d'upload : vérifié AVANT tout appel réseau ───────────────
    if (!this.hasUploadScope(account)) {
      return this.recordFailure(input, account, title, videoUrl,
        this.mapper.forUploadScopeMissing(),
        "Le scope youtube.upload n'a pas été accordé : reconnectez la chaîne avec les permissions requises.",
      )
    }

    // ── 4. Token frais (refresh si nécessaire) ────────────────────────────
    let freshAccount: SocialAccount
    try {
      freshAccount = await this.tokenService.ensureFresh({
        userId: input.userId,
        accountId: account.id,
      })
    } catch (err) {
      // Un échec de token est archivé, jamais propagé en 500, et le gateway
      // n'est jamais atteint.
      return this.recordFailure(input, account, title, videoUrl,
        this.mapper.map(err),
        this.mapper.describe(err),
      )
    }

    // ── 5. Historique PENDING avant l'appel de publication ────────────────
    const post = SocialPost.createPending({
      userId: input.userId,
      platform: 'youtube',
      accountId: freshAccount.id,
      caption: title,
      mediaUrl: videoUrl,
    })
    await this.socialPosts.save(post)

    // ── 6. Publication ────────────────────────────────────────────────────
    try {
      const result = await this.content.publishVideo({
        // Token issu du compte RAFRAÎCHI : jamais l'objet d'avant refresh.
        accessToken: freshAccount.accessToken,
        channelId: freshAccount.externalAccountId,
        videoUrl,
        title,
        privacyStatus,
        madeForKids: input.madeForKids,
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(tags.length > 0 ? { tags } : {}),
        ...(input.categoryId !== undefined
          ? { categoryId: input.categoryId }
          : {}),
        ...(input.containsSyntheticMedia !== undefined
          ? { containsSyntheticMedia: input.containsSyntheticMedia }
          : {}),
        ...(input.notifySubscribers !== undefined
          ? { notifySubscribers: input.notifySubscribers }
          : {}),
      })

      post.attachPublishId(result.videoId)

      if (result.processingState === 'processing') {
        // Vidéo acceptée mais encore encodée par YouTube : l'historique RESTE
        // PENDING, `externalPostId` et `publishedAt` restent nuls. La
        // réconciliation les renseignera une fois le traitement terminé.
        await this.socialPosts.save(post)
        return {
          success: true,
          processing: true,
          externalPostId: null,
          publishId: result.videoId,
        }
      }

      post.markPublished(result.videoId)
      await this.socialPosts.save(post)
      return {
        success: true,
        processing: false,
        externalPostId: result.videoId,
        publishId: result.videoId,
      }
    } catch (err) {
      const mapped = this.mapper.map(err)
      const message = this.mapper.describe(err)
      post.markFailed(message, {
        code: mapped.code,
        subcode: mapped.subcode,
        reason: mapped.reason,
        retryable: mapped.retryable,
      })
      await this.socialPosts.save(post)
      await this.flagReconnectIfNeeded(freshAccount, mapped.reason)
      return { success: false, error: mapped, message }
    }
  }

  /// Validations de forme. Aucune n'atteint la base ni le réseau : elles
  /// protègent l'appelant d'un aller-retour inutile.
  private validate(input: PublishYouTubeInput): YouTubePublicationOutcome | null {
    if (!input.userId?.trim()) {
      return this.failure(this.mapper.forInvalidParameter(), 'userId est requis.')
    }
    if (!input.accountId?.trim()) {
      return this.failure(
        this.mapper.forInvalidParameter(),
        'accountId (chaîne YouTube cible) est requis.',
      )
    }
    if (!input.videoUrl?.trim()) {
      return this.failure(
        this.mapper.forInvalidParameter(YouTubeErrorReason.INVALID_VIDEO),
        'videoUrl est requise pour publier sur YouTube.',
      )
    }
    const title = input.title?.trim() ?? ''
    if (!title) {
      return this.failure(
        this.mapper.forInvalidParameter(YouTubeErrorReason.INVALID_TITLE),
        'Le titre de la vidéo est requis.',
      )
    }
    if (title.length > YOUTUBE_TITLE_MAX_LENGTH) {
      return this.failure(
        this.mapper.forInvalidParameter(YouTubeErrorReason.INVALID_TITLE),
        `Le titre dépasse ${YOUTUBE_TITLE_MAX_LENGTH} caractères.`,
      )
    }
    if (
      input.description !== undefined &&
      input.description.length > YOUTUBE_DESCRIPTION_MAX_LENGTH
    ) {
      return this.failure(
        this.mapper.forInvalidParameter(),
        `La description dépasse ${YOUTUBE_DESCRIPTION_MAX_LENGTH} caractères.`,
      )
    }
    if (
      input.privacyStatus !== undefined &&
      !isYouTubePrivacyStatus(input.privacyStatus)
    ) {
      return this.failure(
        this.mapper.forInvalidParameter(),
        'La visibilité doit valoir private, unlisted ou public.',
      )
    }
    if (typeof input.madeForKids !== 'boolean') {
      return this.failure(
        this.mapper.forInvalidParameter(),
        'madeForKids doit être un booléen (déclaration COPPA obligatoire).',
      )
    }
    return null
  }

  private async resolveAccount(
    userId: string,
    accountId: string,
  ): Promise<SocialAccount | null> {
    const accounts = await this.socialAccounts.findByUserId(userId)
    // Le filtre sur `userId` vient du repository, celui sur la plateforme d'ici :
    // un compte d'un autre utilisateur ou d'un autre réseau n'est jamais retenu.
    return (
      accounts.find((a) => a.id === accountId && a.platform === 'youtube') ?? null
    )
  }

  /// Le scope n'est réputé absent que s'il est EXPLICITEMENT absent d'une liste
  /// de scopes connue. Un compte sans scopes enregistrés (connexion antérieure)
  /// n'est pas bloqué ici — Google tranchera.
  private hasUploadScope(account: SocialAccount): boolean {
    if (account.scopes.length === 0) return true
    return account.scopes.includes(YOUTUBE_UPLOAD_SCOPE)
  }

  /// Archive un échec de précondition (scope, token) sans appel réseau.
  private async recordFailure(
    input: PublishYouTubeInput,
    account: SocialAccount,
    title: string,
    videoUrl: string,
    mapped: MappedPublicationError,
    message: string,
  ): Promise<YouTubePublicationOutcome> {
    const post = SocialPost.createPending({
      userId: input.userId,
      platform: 'youtube',
      accountId: account.id,
      caption: title,
      mediaUrl: videoUrl,
    })
    post.markFailed(message, {
      code: mapped.code,
      subcode: mapped.subcode,
      reason: mapped.reason,
      retryable: mapped.retryable,
    })
    await this.socialPosts.save(post)
    await this.flagReconnectIfNeeded(account, mapped.reason)
    return { success: false, error: mapped, message }
  }

  private failure(
    error: MappedPublicationError,
    message: string,
  ): YouTubePublicationOutcome {
    return { success: false, error, message }
  }

  /// Lève le drapeau de reconnexion quand YouTube l'exige, afin que
  /// GET /social/youtube/token-status le reflète.
  private async flagReconnectIfNeeded(
    account: SocialAccount,
    reason: string,
  ): Promise<void> {
    const needsFlag =
      reason === YouTubeErrorReason.RECONNECT_REQUIRED ||
      reason === YouTubeErrorReason.REFRESH_TOKEN_MISSING ||
      reason === YouTubeErrorReason.UPLOAD_SCOPE_MISSING ||
      reason === YouTubeErrorReason.TOKEN_EXPIRED
    if (needsFlag && !account.needsReconnect) {
      account.markNeedsReconnect()
      await this.socialAccounts.save(account)
    }
  }
}
