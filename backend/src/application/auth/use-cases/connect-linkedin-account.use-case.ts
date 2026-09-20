import { Inject, Injectable } from '@nestjs/common'
import { LINKEDIN_OAUTH_GATEWAY } from '../ports/linkedin-oauth.gateway.js'
import type {
  ConnectedLinkedInMember,
  LinkedInOAuthGateway,
} from '../ports/linkedin-oauth.gateway.js'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'

export interface ConnectLinkedInAccountResult {
  account: { id: string; name: string }
  count: number
}

/// Orchestration pure : récupère le membre via la passerelle (OIDC déjà validée
/// côté infra) puis le persiste (create ou update si déjà connecté). Zéro
/// dépendance à LinkedIn/axios/jose. Miroir de `ConnectTikTokAccountUseCase`.
@Injectable()
export class ConnectLinkedInAccountUseCase {
  constructor(
    @Inject(LINKEDIN_OAUTH_GATEWAY)
    private readonly linkedinOAuth: LinkedInOAuthGateway,
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
  ) {}

  async execute(input: {
    userId: string
    code: string
    expectedNonce: string
  }): Promise<ConnectLinkedInAccountResult> {
    const connected = await this.linkedinOAuth.fetchConnectedMember(
      input.code,
      input.expectedNonce,
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
    incoming: ConnectedLinkedInMember,
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
