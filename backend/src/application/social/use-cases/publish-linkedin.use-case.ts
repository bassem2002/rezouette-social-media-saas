import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { LINKEDIN_CONTENT_GATEWAY } from '../ports/linkedin-content.gateway.js'
import type {
  LinkedInAuthor,
  LinkedInContentGateway,
  LinkedInPublishResult,
  LinkedInVisibility,
} from '../ports/linkedin-content.gateway.js'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { SOCIAL_POST_REPOSITORY } from '../../../domain/social-post/repositories/social-post.repository.js'
import type { SocialPostRepository } from '../../../domain/social-post/repositories/social-post.repository.js'
import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import { SocialPost } from '../../../domain/social-post/entities/social-post.entity.js'
import type { PublicationOutcome } from '../../social-post/services/publication-recorder.js'
import { LinkedInTokenService } from '../services/linkedin-token.service.js'
import { LinkedInExceptionMapper } from '../services/linkedin-exception-mapper.js'

export interface PublishLinkedInInput {
  userId: string
  text?: string
  linkUrl?: string
  linkTitle?: string
  linkDescription?: string
  imageUrl?: string
  imageAltText?: string
  visibility?: LinkedInVisibility
}

/// Publie un post sur le profil MEMBRE LinkedIn actif du user (texte, lien/article
/// ou une image). Indépendant de l'endpoint : toute la logique réseau vit dans le
/// LinkedInContentGateway (adaptateur rest/ugc/disabled sélectionné par la factory).
///
/// Trace d'historique : comme TikTok, LinkedIn écrit sa propre ligne SocialPost ici
/// (classification via LinkedInExceptionMapper, cycle de token par reconnexion — pas
/// de refresh), sans passer par le PublicationRecorder (spécifique Meta).
@Injectable()
export class PublishLinkedInUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
    @Inject(LINKEDIN_CONTENT_GATEWAY)
    private readonly content: LinkedInContentGateway,
    @Inject(SOCIAL_POST_REPOSITORY)
    private readonly socialPosts: SocialPostRepository,
    private readonly tokenService: LinkedInTokenService,
    private readonly mapper: LinkedInExceptionMapper,
  ) {}

  async execute(input: PublishLinkedInInput): Promise<PublicationOutcome> {
    const text = input.text?.trim() ?? ''
    const linkUrl = input.linkUrl?.trim() || null
    const imageUrl = input.imageUrl?.trim() || null

    if (!text && !linkUrl && !imageUrl) {
      // Précondition : rien à publier. Isolé sans appel réseau.
      return {
        success: false,
        error: this.mapper.forInvalidParameter(),
        message:
          'Contenu LinkedIn vide : fournissez au moins un texte, un lien ou une image.',
      }
    }

    const account = await this.resolveAccount(input.userId)

    // Token : LinkedIn n'a pas de refresh (app standard) → expiré/reconnexion = blocage.
    if (this.tokenService.needsReconnect(account) || this.tokenService.isExpired(account)) {
      const mapped = this.mapper.forReconnectRequired()
      await this.recordFailure(input, account, mapped, imageUrl, linkUrl,
        'Token LinkedIn expiré : reconnexion du compte requise.')
      return {
        success: false,
        error: mapped,
        message: 'Token LinkedIn expiré : reconnexion du compte requise.',
      }
    }

    const author: LinkedInAuthor = { type: 'MEMBER', urn: account.externalAccountId }
    const visibility: LinkedInVisibility = input.visibility ?? 'PUBLIC'

    const post = SocialPost.createPending({
      userId: input.userId,
      platform: 'linkedin',
      accountId: account.id,
      caption: text || linkUrl || imageUrl,
      mediaUrl: imageUrl ?? linkUrl,
    })
    await this.socialPosts.save(post)

    try {
      const result = await this.publish({
        author,
        accessToken: account.accessToken,
        visibility,
        text,
        linkUrl,
        imageUrl,
        input,
      })
      post.markPublished(result.postUrn)
      await this.socialPosts.save(post)
      return { success: true, externalPostId: result.postUrn }
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
      await this.flagReconnectIfNeeded(account, mapped.reason)
      return { success: false, error: mapped, message }
    }
  }

  /// Sélectionne l'adaptateur selon la nature du contenu (image > lien > texte).
  private publish(args: {
    author: LinkedInAuthor
    accessToken: string
    visibility: LinkedInVisibility
    text: string
    linkUrl: string | null
    imageUrl: string | null
    input: PublishLinkedInInput
  }): Promise<LinkedInPublishResult> {
    const { author, accessToken, visibility, text, linkUrl, imageUrl, input } = args
    if (imageUrl) {
      return this.content.publishImage({
        author,
        accessToken,
        visibility,
        text,
        imageUrl,
        altText: input.imageAltText?.trim() || undefined,
      })
    }
    if (linkUrl) {
      return this.content.publishArticle({
        author,
        accessToken,
        visibility,
        text,
        url: linkUrl,
        title: input.linkTitle?.trim() || undefined,
        description: input.linkDescription?.trim() || undefined,
      })
    }
    return this.content.publishText({ author, accessToken, visibility, text })
  }

  private async resolveAccount(userId: string): Promise<SocialAccount> {
    const accounts = await this.socialAccounts.findByUserId(userId)
    const account =
      accounts.find((a) => a.platform === 'linkedin' && a.isActive) ??
      accounts.find((a) => a.platform === 'linkedin')
    if (!account) {
      throw new NotFoundException(
        'Aucun compte LinkedIn actif connecté pour cet utilisateur.',
      )
    }
    return account
  }

  /// Archive un échec de précondition (token) sans appel réseau.
  private async recordFailure(
    input: PublishLinkedInInput,
    account: SocialAccount,
    mapped: { code: number; subcode?: number; reason: string; retryable: boolean },
    imageUrl: string | null,
    linkUrl: string | null,
    message: string,
  ): Promise<void> {
    const post = SocialPost.createPending({
      userId: input.userId,
      platform: 'linkedin',
      accountId: account.id,
      caption: input.text?.trim() || linkUrl || imageUrl,
      mediaUrl: imageUrl ?? linkUrl,
    })
    post.markFailed(message, {
      code: mapped.code,
      subcode: mapped.subcode,
      reason: mapped.reason,
      retryable: mapped.retryable,
    })
    await this.socialPosts.save(post)
    await this.flagReconnectIfNeeded(account, mapped.reason)
  }

  /// Lève le drapeau de reconnexion sur le compte quand LinkedIn l'exige, afin que
  /// GET /social/linkedin/token-status le reflète (RECONNECT_REQUIRED).
  private async flagReconnectIfNeeded(
    account: SocialAccount,
    reason: string,
  ): Promise<void> {
    if (
      (reason === 'RECONNECT_REQUIRED' || reason === 'TOKEN_EXPIRED') &&
      !account.needsReconnect
    ) {
      account.markNeedsReconnect()
      await this.socialAccounts.save(account)
    }
  }
}
