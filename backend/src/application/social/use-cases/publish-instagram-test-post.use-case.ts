import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import {
  META_GRAPH_GATEWAY,
  type MetaPublishResult,
} from '../ports/meta-graph.gateway.js'
import type { MetaGraphGateway } from '../ports/meta-graph.gateway.js'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'

/// Publie une image sur le premier compte Instagram Business actif du user.
/// Le token stocké est le page access token, suffisant pour /media + /media_publish.
@Injectable()
export class PublishInstagramTestPostUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
    @Inject(META_GRAPH_GATEWAY)
    private readonly graph: MetaGraphGateway,
  ) {}

  async execute(input: {
    userId: string
    imageUrl: string
    caption: string
  }): Promise<MetaPublishResult> {
    const accounts = await this.socialAccounts.findByUserId(input.userId)
    const instagram = accounts.find(
      (a) => a.platform === 'instagram' && a.isActive,
    )

    if (!instagram) {
      throw new NotFoundException(
        'Aucun compte Instagram Business actif connecté pour cet utilisateur.',
      )
    }

    return this.graph.publishInstagramImage(
      instagram.externalAccountId,
      instagram.accessToken,
      input.imageUrl,
      input.caption,
    )
  }
}
