import { Inject, Injectable } from '@nestjs/common'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { TokenStatus } from '../../../domain/social/token-status.enum.js'
import { YouTubeTokenService } from '../services/youtube-token.service.js'

/// Statut du token d'UNE chaîne. Contrairement à LinkedIn et TikTok (un compte
/// par réseau), un user peut avoir plusieurs chaînes YouTube : le statut est donc
/// une LISTE, pas une valeur unique.
export interface YouTubeAccountTokenStatus {
  accountId: string
  channelId: string
  accountName: string
  status: TokenStatus
  expiresAt: Date | null
  needsReconnect: boolean
  /// Booléen seulement — le refresh token lui-même n'est jamais exposé.
  hasRefreshToken: boolean
}

export interface YouTubeTokenStatusResult {
  accounts: YouTubeAccountTokenStatus[]
}

/// Calcule le statut des tokens YouTube du user. Réutilise `YouTubeTokenService`
/// pour la dérivation (aucune règle d'expiration dupliquée). STRICTEMENT PASSIF :
/// aucun refresh, aucun appel réseau, aucune écriture.
///
/// Une liste vide est renvoyée quand aucune chaîne n'est connectée : l'UI doit
/// pouvoir distinguer « pas connecté » (état normal) de « non configuré » (503).
@Injectable()
export class GetYouTubeTokenStatusUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
    private readonly tokenService: YouTubeTokenService,
  ) {}

  async execute(userId: string): Promise<YouTubeTokenStatusResult> {
    const accounts = await this.socialAccounts.findByUserId(userId)
    return {
      accounts: accounts
        .filter((a) => a.platform === 'youtube')
        .map((a) => ({
          accountId: a.id,
          channelId: a.externalAccountId,
          accountName: a.accountName,
          status: this.tokenService.getStatus(a),
          expiresAt: a.tokenExpiresAt,
          needsReconnect: a.needsReconnect,
          hasRefreshToken: a.refreshToken !== null,
        })),
    }
  }
}
