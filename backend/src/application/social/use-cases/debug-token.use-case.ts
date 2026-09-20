import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'

export interface TokenDebugView {
  provider: 'meta'
  pageId: string | null
  instagramId: string | null
  tokenExpiration: string | null
  tokenType: string
  /// Aperçu masqué : jamais le token complet.
  tokenPreview: string
}

/// Diagnostic des tokens Meta du user, sans jamais exposer le secret complet.
@Injectable()
export class DebugTokenUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
  ) {}

  async execute(userId: string): Promise<TokenDebugView> {
    const accounts = await this.socialAccounts.findByUserId(userId)
    const facebook = accounts.find((a) => a.platform === 'facebook')
    const instagram = accounts.find((a) => a.platform === 'instagram')

    if (!facebook && !instagram) {
      throw new NotFoundException('Aucun compte Meta connecté pour cet utilisateur.')
    }

    const reference = facebook ?? instagram!

    return {
      provider: 'meta',
      pageId: facebook?.externalAccountId ?? null,
      instagramId: instagram?.externalAccountId ?? null,
      tokenExpiration: reference.tokenExpiresAt?.toISOString() ?? null,
      // Les tokens de Page Meta longue durée n'expirent pas → bearer "permanent".
      tokenType: reference.tokenExpiresAt ? 'bearer' : 'page_long_lived',
      tokenPreview: this.mask(reference.accessToken),
    }
  }

  /// Garde les 6 premiers et 4 derniers caractères ; masque le reste.
  private mask(token: string): string {
    if (token.length <= 12) {
      return '****'
    }
    return `${token.slice(0, 6)}...${token.slice(-4)}`
  }
}
