import { Inject, Injectable } from '@nestjs/common'
import { META_OAUTH_GATEWAY } from '../ports/meta-oauth.gateway.js'
import type {
  ConnectedSocialAccount,
  MetaOAuthGateway,
} from '../ports/meta-oauth.gateway.js'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'

export interface ConnectMetaAccountResult {
  facebookPages: { id: string; name: string }[]
  instagramAccounts: { id: string; username: string }[]
  count: number
}

/// Orchestration pure : récupère les comptes via la passerelle puis les
/// persiste (create ou update si déjà connectés). Zéro dépendance à Meta.
@Injectable()
export class ConnectMetaAccountUseCase {
  constructor(
    @Inject(META_OAUTH_GATEWAY)
    private readonly metaOAuth: MetaOAuthGateway,
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
  ) {}

  async execute(input: {
    userId: string
    code: string
  }): Promise<ConnectMetaAccountResult> {
    const connected = await this.metaOAuth.fetchConnectedAccounts(input.code)

    for (const account of connected) {
      await this.persist(input.userId, account)
    }

    return {
      facebookPages: connected
        .filter((a) => a.platform === 'facebook')
        .map((a) => ({ id: a.externalAccountId, name: a.accountName })),
      instagramAccounts: connected
        .filter((a) => a.platform === 'instagram')
        .map((a) => ({ id: a.externalAccountId, username: a.accountName })),
      count: connected.length,
    }
  }

  private async persist(
    userId: string,
    incoming: ConnectedSocialAccount,
  ): Promise<void> {
    const existing = await this.socialAccounts.findByExternalAccount(
      userId,
      incoming.platform,
      incoming.externalAccountId,
    )

    if (existing) {
      existing.updateTokens({
        accessToken: incoming.accessToken,
        tokenExpiresAt: incoming.tokenExpiresAt,
      })
      await this.socialAccounts.save(existing)
      return
    }

    const account = SocialAccount.create({
      userId,
      platform: incoming.platform,
      externalAccountId: incoming.externalAccountId,
      accountName: incoming.accountName,
      accessToken: incoming.accessToken,
      tokenExpiresAt: incoming.tokenExpiresAt,
      metadata: incoming.metadata,
    })
    await this.socialAccounts.save(account)
  }
}
