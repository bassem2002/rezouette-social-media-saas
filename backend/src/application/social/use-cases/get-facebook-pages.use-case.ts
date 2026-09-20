import { Inject, Injectable } from '@nestjs/common'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'

export interface FacebookPageView {
  id: string
  name: string
}

/// Liste les Pages Facebook connectées du user (lecture seule, depuis la base).
@Injectable()
export class GetFacebookPagesUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
  ) {}

  async execute(userId: string): Promise<FacebookPageView[]> {
    const accounts = await this.socialAccounts.findByUserId(userId)
    return accounts
      .filter((a) => a.platform === 'facebook')
      .map((a) => ({ id: a.externalAccountId, name: a.accountName }))
  }
}
