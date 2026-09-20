import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import {
  META_GRAPH_GATEWAY,
  type MetaPageProfile,
} from '../ports/meta-graph.gateway.js'
import type { MetaGraphGateway } from '../ports/meta-graph.gateway.js'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'

/// Vérifie en direct le token de la Page via Graph API et renvoie son profil.
/// NOTE : l'OAuth existant ne persiste que le *page access token* (pas le user
/// token), donc on lit GET /{pageId}?fields=id,name plutôt que /me/accounts
/// (qui exige un user token). Cela vérifie tout autant la validité du token.
@Injectable()
export class GetFacebookProfileUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
    @Inject(META_GRAPH_GATEWAY)
    private readonly graph: MetaGraphGateway,
  ) {}

  async execute(userId: string): Promise<MetaPageProfile> {
    const accounts = await this.socialAccounts.findByUserId(userId)
    const page = accounts.find((a) => a.platform === 'facebook' && a.isActive)

    if (!page) {
      throw new NotFoundException(
        'Aucune Page Facebook active connectée pour cet utilisateur.',
      )
    }

    return this.graph.fetchPageProfile(page.externalAccountId, page.accessToken)
  }
}
