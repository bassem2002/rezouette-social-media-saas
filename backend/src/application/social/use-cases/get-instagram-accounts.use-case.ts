import { Inject, Injectable } from '@nestjs/common'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'

export interface InstagramAccountView {
  id: string
  username: string
}

/// Liste les comptes Instagram Business connectés du user (lecture seule).
@Injectable()
export class GetInstagramAccountsUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
  ) {}

  async execute(userId: string): Promise<InstagramAccountView[]> {
    const accounts = await this.socialAccounts.findByUserId(userId)
    return accounts
      .filter((a) => a.platform === 'instagram')
      .map((a) => ({ id: a.externalAccountId, username: a.accountName }))
  }
}
