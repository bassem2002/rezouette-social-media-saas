import { Inject, Injectable } from '@nestjs/common'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { ConnectedAccountView } from './get-connected-accounts.use-case.js'

/// Retourne les comptes LinkedIn persistés du user, sans exposer les tokens.
/// Filtre la vue générique `GetConnectedAccountsUseCase` sur la plateforme LinkedIn
/// (parité avec les autres verticals ; l'UI comptes peut aussi lire /social/accounts).
@Injectable()
export class GetLinkedInAccountsUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
  ) {}

  async execute(userId: string): Promise<ConnectedAccountView[]> {
    const accounts = await this.socialAccounts.findByUserId(userId)
    return accounts
      .filter((a) => a.platform === 'linkedin')
      .map((a) => ({
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
