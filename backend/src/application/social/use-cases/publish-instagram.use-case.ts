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

/// Publie un post de production sur le compte Instagram Business actif du user.
/// Réutilise la passerelle Graph existante : POST /{igUserId}/media puis
/// POST /{igUserId}/media_publish. La trace d'historique (PENDING →
/// PUBLISHED/FAILED) est déléguée au PublicationRecorder.
@Injectable()
export class PublishInstagramUseCase {
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
    imageUrl: string
    caption: string
  }): Promise<PublicationOutcome> {
    const accounts = await this.socialAccounts.findByUserId(input.userId)
    const instagram = accounts.find(
      (a) => a.platform === 'instagram' && a.isActive,
    )

    if (!instagram) {
      throw new NotFoundException(
        'Aucun compte Instagram Business actif connecté pour cet utilisateur.',
      )
    }

    // Blocage en amont : token expiré → aucune tentative Graph, reconnexion requise.
    if (this.tokenService.isExpired(instagram)) {
      return {
        success: false,
        error: this.metaMapper.forExpiredToken(),
        message: 'Token Meta expiré : reconnexion du compte requise.',
      }
    }

    return this.recorder.record(
      {
        userId: input.userId,
        platform: 'instagram',
        accountId: instagram.id,
        caption: input.caption,
        mediaUrl: input.imageUrl,
      },
      () =>
        this.graph.publishInstagramImage(
          instagram.externalAccountId,
          instagram.accessToken,
          input.imageUrl,
          input.caption,
        ),
    )
  }
}
