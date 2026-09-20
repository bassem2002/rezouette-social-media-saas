import { Inject, Injectable } from '@nestjs/common'
import { TIKTOK_OAUTH_GATEWAY } from '../ports/tiktok-oauth.gateway.js'
import type {
  ConnectedTikTokAccount,
  TikTokOAuthGateway,
} from '../ports/tiktok-oauth.gateway.js'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'

export interface ConnectTikTokAccountResult {
  account: { id: string; name: string }
  count: number
}

/// Orchestration pure : récupère le compte via la passerelle puis le persiste
/// (create ou update si déjà connecté). Zéro dépendance à TikTok/axios.
/// Miroir de `ConnectMetaAccountUseCase`.
@Injectable()
export class ConnectTikTokAccountUseCase {
  constructor(
    @Inject(TIKTOK_OAUTH_GATEWAY)
    private readonly tiktokOAuth: TikTokOAuthGateway,
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
  ) {}

  async execute(input: {
    userId: string
    code: string
    codeVerifier: string
  }): Promise<ConnectTikTokAccountResult> {
    const connected = await this.tiktokOAuth.fetchConnectedAccount(
      input.code,
      input.codeVerifier,
    )

    await this.persist(input.userId, connected)

    return {
      account: {
        id: connected.externalAccountId,
        name: connected.accountName,
      },
      count: 1,
    }
  }

  private async persist(
    userId: string,
    incoming: ConnectedTikTokAccount,
  ): Promise<void> {
    const existing = await this.socialAccounts.findByExternalAccount(
      userId,
      incoming.platform,
      incoming.externalAccountId,
    )

    if (existing) {
      existing.updateTokens({
        accessToken: incoming.accessToken,
        refreshToken: incoming.refreshToken,
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
      refreshToken: incoming.refreshToken,
      tokenExpiresAt: incoming.tokenExpiresAt,
      scopes: incoming.scopes,
      metadata: incoming.metadata,
    })
    await this.socialAccounts.save(account)
  }
}
