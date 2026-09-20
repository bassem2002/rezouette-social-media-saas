import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { TokenStatus } from '../../../domain/social/token-status.enum.js'
import { LinkedInTokenService } from '../services/linkedin-token.service.js'

/// Vue du cycle de vie du token LinkedIn d'un user (compte membre unique par
/// plateforme, comme TikTok). Le renouvellement se fait par reconnexion OAuth.
export interface LinkedInTokenStatusResult {
  status: TokenStatus
  accountName: string | null
  expiresAt: Date | null
  needsReconnect: boolean
}

/// Calcule le statut du token LinkedIn du user. Réutilise LinkedInTokenService pour
/// la dérivation (aucune logique d'expiration dupliquée ici). Lecture passive.
@Injectable()
export class GetLinkedInTokenStatusUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
    private readonly tokenService: LinkedInTokenService,
  ) {}

  async execute(userId: string): Promise<LinkedInTokenStatusResult> {
    const accounts = await this.socialAccounts.findByUserId(userId)
    // Compte actif prioritaire, sinon n'importe quel compte LinkedIn connecté.
    const account =
      accounts.find((a) => a.platform === 'linkedin' && a.isActive) ??
      accounts.find((a) => a.platform === 'linkedin')

    if (!account) {
      throw new NotFoundException(
        'Aucun compte LinkedIn connecté pour cet utilisateur.',
      )
    }

    return {
      status: this.tokenService.getStatus(account),
      accountName: account.accountName,
      expiresAt: account.tokenExpiresAt,
      needsReconnect: account.needsReconnect,
    }
  }
}
