import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { META_GRAPH_GATEWAY } from '../ports/meta-graph.gateway.js'
import type { MetaGraphGateway } from '../ports/meta-graph.gateway.js'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import {
  PublicationRecorder,
  type PublicationOutcome,
} from '../../social-post/services/publication-recorder.js'
import { MetaTokenService } from '../services/meta-token.service.js'
import { MetaExceptionMapper } from '../services/meta-exception-mapper.js'

/// Publie un post de production sur la Page Facebook active du user.
/// Réutilise la passerelle Graph existante : POST /{pageId}/photos quand une
/// `imageUrl` est fournie, sinon POST /{pageId}/feed. La trace d'historique
/// (PENDING → PUBLISHED/FAILED) est déléguée au PublicationRecorder.
@Injectable()
export class PublishFacebookUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
    @Inject(META_GRAPH_GATEWAY)
    private readonly graph: MetaGraphGateway,
    private readonly recorder: PublicationRecorder,
    private readonly tokenService: MetaTokenService,
    private readonly metaMapper: MetaExceptionMapper,
  ) {}

  async execute(input: {
    userId: string
    message: string
    imageUrl?: string
  }): Promise<PublicationOutcome> {
    const accounts = await this.socialAccounts.findByUserId(input.userId)
    const page = accounts.find((a) => a.platform === 'facebook' && a.isActive)

    if (!page) {
      throw new NotFoundException(
        'Aucune Page Facebook active connectée pour cet utilisateur.',
      )
    }

    // Blocage en amont : token expiré → aucune tentative Graph, reconnexion requise.
    if (this.tokenService.isExpired(page)) {
      return {
        success: false,
        error: this.metaMapper.forExpiredToken(),
        message: 'Token Meta expiré : reconnexion du compte requise.',
      }
    }

    return this.recorder.record(
      {
        userId: input.userId,
        platform: 'facebook',
        accountId: page.id,
        caption: input.message,
        mediaUrl: input.imageUrl ?? null,
      },
      () =>
        input.imageUrl
          ? this.graph.publishPagePhoto(
              page.externalAccountId,
              page.accessToken,
              input.imageUrl,
              input.message,
            )
          : this.graph.publishPagePost(
              page.externalAccountId,
              page.accessToken,
              input.message,
            ),
    )
  }
}
