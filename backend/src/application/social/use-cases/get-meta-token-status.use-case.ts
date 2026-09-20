import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import type { SocialPlatform } from '../../../domain/shared/ports/social-provider.port.js'
import { TokenStatus } from '../../../domain/social/token-status.enum.js'
import { MetaTokenService } from '../services/meta-token.service.js'

/// Vue agrégée du cycle de vie des tokens Meta d'un user (FB + IG).
export interface MetaTokenStatusResult {
  facebook: TokenStatus | null
  instagram: TokenStatus | null
  expiresAt: Date | null
  needsReconnect: boolean
}

/// Calcule le statut des tokens Meta du user. Réutilise MetaTokenService pour la
/// dérivation (aucune logique d'expiration dupliquée ici).
@Injectable()
export class GetMetaTokenStatusUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
    private readonly tokenService: MetaTokenService,
  ) {}

  async execute(userId: string): Promise<MetaTokenStatusResult> {
    const accounts = await this.socialAccounts.findByUserId(userId)
    const facebook = this.pick(accounts, 'facebook')
    const instagram = this.pick(accounts, 'instagram')

    if (!facebook && !instagram) {
      throw new NotFoundException('Aucun compte Meta connecté pour cet utilisateur.')
    }

    // Le token de Page (FB) est partagé avec l'IG Business : on l'utilise comme
    // référence d'expiration, IG en repli.
    const reference = facebook ?? instagram

    return {
      facebook: facebook ? this.tokenService.getStatus(facebook) : null,
      instagram: instagram ? this.tokenService.getStatus(instagram) : null,
      expiresAt: reference?.tokenExpiresAt ?? null,
      needsReconnect: accounts.some((a) => a.needsReconnect),
    }
  }

  /// Compte actif prioritaire, sinon n'importe quel compte de la plateforme.
  private pick(
    accounts: SocialAccount[],
    platform: SocialPlatform,
  ): SocialAccount | undefined {
    return (
      accounts.find((a) => a.platform === platform && a.isActive) ??
      accounts.find((a) => a.platform === platform)
    )
  }
}
