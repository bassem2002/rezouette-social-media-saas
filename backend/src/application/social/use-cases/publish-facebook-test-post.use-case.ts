import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import {
  META_GRAPH_GATEWAY,
  type MetaPublishResult,
} from '../ports/meta-graph.gateway.js'
import type { MetaGraphGateway } from '../ports/meta-graph.gateway.js'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'

/// Publie un message de test sur la première Page Facebook active du user.
/// Réutilise le repository des comptes (DDD) + la passerelle Graph.
@Injectable()
export class PublishFacebookTestPostUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
    @Inject(META_GRAPH_GATEWAY)
    private readonly graph: MetaGraphGateway,
  ) {}

  async execute(input: {
    userId: string
    message: string
  }): Promise<MetaPublishResult> {
    const accounts = await this.socialAccounts.findByUserId(input.userId)
    const page = accounts.find((a) => a.platform === 'facebook' && a.isActive)

    if (!page) {
      throw new NotFoundException(
        'Aucune Page Facebook active connectée pour cet utilisateur.',
      )
    }

    return this.graph.publishPagePost(
      page.externalAccountId,
      page.accessToken,
      input.message,
    )
  }
}
