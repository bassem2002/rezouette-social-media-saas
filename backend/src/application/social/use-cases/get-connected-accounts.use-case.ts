import { Inject, Injectable } from '@nestjs/common'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialPlatform } from '../../../domain/shared/ports/social-provider.port.js'
import type { SocialAccountStatus } from '../../../domain/social-account/entities/social-account.entity.js'

/// Vue sécurisée d'un SocialAccount : jamais de token en clair.
export interface ConnectedAccountView {
  id: string
  platform: SocialPlatform
  externalAccountId: string
  accountName: string
  status: SocialAccountStatus
  tokenExpiresAt: string | null
  scopes: string[]
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

/// Retourne tous les SocialAccounts persistés du user, sans exposer les tokens.
@Injectable()
export class GetConnectedAccountsUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
  ) {}

  async execute(userId: string): Promise<ConnectedAccountView[]> {
    const accounts = await this.socialAccounts.findByUserId(userId)
    return accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      externalAccountId: a.externalAccountId,
      accountName: a.accountName,
      status: a.status,
      tokenExpiresAt: a.tokenExpiresAt?.toISOString() ?? null,
      scopes: a.scopes,
      metadata: a.metadata,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }))
  }
}
