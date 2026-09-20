import { Inject, Injectable } from '@nestjs/common'
import { SocialPost } from '../../../domain/social-post/entities/social-post.entity.js'
import type { SocialPostPlatform } from '../../../domain/social-post/entities/social-post.entity.js'
import { SOCIAL_POST_REPOSITORY } from '../../../domain/social-post/repositories/social-post.repository.js'
import type { SocialPostRepository } from '../../../domain/social-post/repositories/social-post.repository.js'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { MetaErrorReason } from '../../../domain/social/errors/meta-error-reason.enum.js'
import type { MetaPublishResult } from '../../social/ports/meta-graph.gateway.js'
import { MetaExceptionMapper } from '../../social/services/meta-exception-mapper.js'
import type { MappedPublicationError } from '../../social/services/mapped-publication-error.js'
import { extractMetaErrorPayload } from '../../social/errors/meta-graph.error.js'

/// Métadonnées d'une publication à archiver.
export interface RecordablePublication {
  userId: string
  platform: SocialPostPlatform
  accountId?: string | null
  caption?: string | null
  mediaUrl?: string | null
}

/// Résultat normalisé d'une publication, propagé aux use-cases et à la
/// présentation. Union discriminée : succès (externalPostId) ou échec (erreur
/// Meta classifiée + message lisible). Aucune exception n'est levée pour une
/// erreur Meta — l'orchestrateur peut continuer les autres plateformes.
export type PublicationOutcome =
  | { success: true; externalPostId: string }
  | { success: false; error: MappedPublicationError; message: string }

/// Service applicatif réutilisable qui entoure une publication Meta de sa trace
/// d'historique : écrit un SocialPost PENDING, exécute `publish`, puis bascule
/// PUBLISHED (externalPostId) ou FAILED (errorMessage + diagnostic Meta).
/// Point UNIQUE d'invocation de MetaExceptionMapper côté publication → toute la
/// classification d'erreur passe ici, sans duplication.
@Injectable()
export class PublicationRecorder {
  constructor(
    @Inject(SOCIAL_POST_REPOSITORY)
    private readonly socialPosts: SocialPostRepository,
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
    private readonly metaMapper: MetaExceptionMapper,
  ) {}

  async record(
    meta: RecordablePublication,
    publish: () => Promise<MetaPublishResult>,
  ): Promise<PublicationOutcome> {
    const post = SocialPost.createPending({
      userId: meta.userId,
      platform: meta.platform,
      accountId: meta.accountId ?? null,
      caption: meta.caption ?? null,
      mediaUrl: meta.mediaUrl ?? null,
    })
    await this.socialPosts.save(post)

    try {
      const result = await publish()
      post.markPublished(result.id)
      await this.socialPosts.save(post)
      return { success: true, externalPostId: result.id }
    } catch (err) {
      const mapped = this.metaMapper.map(err)
      const message = extractMetaErrorPayload(err).message
      post.markFailed(message, {
        code: mapped.code,
        subcode: mapped.subcode,
        reason: mapped.reason,
        retryable: mapped.retryable,
      })
      await this.socialPosts.save(post)
      await this.flagReconnectIfNeeded(meta.accountId ?? null, mapped.reason)
      return { success: false, error: mapped, message }
    }
  }

  /// Quand Meta signale RECONNECT_REQUIRED, on lève le drapeau de reconnexion sur
  /// le compte concerné afin que GET /social/meta/token-status le reflète.
  private async flagReconnectIfNeeded(
    accountId: string | null,
    reason: string,
  ): Promise<void> {
    if (reason !== MetaErrorReason.RECONNECT_REQUIRED || accountId === null) {
      return
    }
    const account = await this.socialAccounts.findById(accountId)
    if (account && !account.needsReconnect) {
      account.markNeedsReconnect()
      await this.socialAccounts.save(account)
    }
  }
}
