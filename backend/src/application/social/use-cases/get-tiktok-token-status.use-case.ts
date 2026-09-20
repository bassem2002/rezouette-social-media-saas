import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { TokenStatus } from '../../../domain/social/token-status.enum.js'
import { TikTokTokenService } from '../services/tiktok-token.service.js'

/// Vue du cycle de vie du token TikTok d'un user (compte unique par plateforme,
/// contrairement à Meta qui agrège FB + IG).
export interface TikTokTokenStatusResult {
  status: TokenStatus
  accountName: string | null
  expiresAt: Date | null
  needsReconnect: boolean
}

/// Calcule le statut du token TikTok du user. Réutilise TikTokTokenService pour la
/// dérivation (aucune logique d'expiration/refresh dupliquée ici). Lecture passive.
@Injectable()
export class GetTikTokTokenStatusUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
    private readonly tokenService: TikTokTokenService,
  ) {}

  async execute(userId: string): Promise<TikTokTokenStatusResult> {
    const accounts = await this.socialAccounts.findByUserId(userId)
    // Compte actif prioritaire, sinon n'importe quel compte TikTok connecté.
    const account =
      accounts.find((a) => a.platform === 'tiktok' && a.isActive) ??
      accounts.find((a) => a.platform === 'tiktok')

    if (!account) {
      throw new NotFoundException(
        'Aucun compte TikTok connecté pour cet utilisateur.',
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
