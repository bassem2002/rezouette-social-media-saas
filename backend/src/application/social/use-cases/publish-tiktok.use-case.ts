import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { TIKTOK_CONTENT_GATEWAY } from '../ports/tiktok-content.gateway.js'
import type { TikTokContentGateway } from '../ports/tiktok-content.gateway.js'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { SOCIAL_POST_REPOSITORY } from '../../../domain/social-post/repositories/social-post.repository.js'
import type { SocialPostRepository } from '../../../domain/social-post/repositories/social-post.repository.js'
import { SocialPost } from '../../../domain/social-post/entities/social-post.entity.js'
import type { PublicationOutcome } from '../../social-post/services/publication-recorder.js'
import { TikTokTokenService } from '../services/tiktok-token.service.js'
import { TikTokExceptionMapper } from '../services/tiktok-exception-mapper.js'
import { TikTokContentError } from '../errors/tiktok-content.error.js'

/// Publie une vidéo (Direct Post) sur le compte TikTok actif du user.
///
/// Trace d'historique : contrairement à Facebook/Instagram, TikTok N'utilise PAS
/// le PublicationRecorder — celui-ci est spécifique Meta (classification
/// MetaExceptionMapper + sémantique de reconnexion Meta). TikTok a sa propre
/// classification (TikTokExceptionMapper) et un refresh de token (et non une
/// reconnexion) : on écrit donc la ligne SocialPost ici, sans dupliquer d'appel
/// réseau (toute la logique TikTok vit dans le TikTokContentGateway).
@Injectable()
export class PublishTikTokUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
    @Inject(TIKTOK_CONTENT_GATEWAY)
    private readonly content: TikTokContentGateway,
    @Inject(SOCIAL_POST_REPOSITORY)
    private readonly socialPosts: SocialPostRepository,
    private readonly tokenService: TikTokTokenService,
    private readonly tiktokMapper: TikTokExceptionMapper,
  ) {}

  async execute(input: {
    userId: string
    videoUrl: string
    caption: string
  }): Promise<PublicationOutcome> {
    const accounts = await this.socialAccounts.findByUserId(input.userId)
    let account = accounts.find((a) => a.platform === 'tiktok' && a.isActive)

    if (!account) {
      throw new NotFoundException(
        'Aucun compte TikTok actif connecté pour cet utilisateur.',
      )
    }

    // Priorité 1 : garantir un access token frais (refresh automatique ~24 h).
    try {
      account = await this.tokenService.ensureFresh(account)
    } catch {
      return {
        success: false,
        error: this.tiktokMapper.forReconnectRequired(),
        message:
          'Token TikTok expiré et non rafraîchissable : reconnexion du compte requise.',
      }
    }

    if (this.tokenService.isExpired(account)) {
      return {
        success: false,
        error: this.tiktokMapper.forReconnectRequired(),
        message: 'Token TikTok expiré : reconnexion du compte requise.',
      }
    }

    const post = SocialPost.createPending({
      userId: input.userId,
      platform: 'tiktok',
      accountId: account.id,
      caption: input.caption,
      mediaUrl: input.videoUrl,
    })
    await this.socialPosts.save(post)

    try {
      const result = await this.content.publishVideoDirect({
        accessToken: account.accessToken,
        videoUrl: input.videoUrl,
        caption: input.caption,
      })
      post.attachPublishId(result.publishId)
      const externalId = result.postId ?? result.publishId
      post.markPublished(externalId)
      await this.socialPosts.save(post)
      return { success: true, externalPostId: externalId }
    } catch (err) {
      const mapped = this.tiktokMapper.map(err)
      const message = this.tiktokMapper.describe(err)
      if (err instanceof TikTokContentError && err.publishId) {
        post.attachPublishId(err.publishId)
      }
      post.markFailed(message, {
        code: mapped.code,
        subcode: mapped.subcode,
        reason: mapped.reason,
        retryable: mapped.retryable,
      })
      await this.socialPosts.save(post)
      return { success: false, error: mapped, message }
    }
  }
}
