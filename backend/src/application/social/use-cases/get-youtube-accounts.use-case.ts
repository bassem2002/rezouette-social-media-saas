import { Inject, Injectable } from '@nestjs/common'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { stripCredentialGroupId } from '../services/youtube-credential-group.js'

/// Vue publique d'une chaîne YouTube connectée. NE CONTIENT AUCUN TOKEN, et pas
/// davantage l'identifiant de groupe de credentials (détail interne).
export interface YouTubeAccountView {
  id: string
  externalAccountId: string
  accountName: string
  platform: 'youtube'
  status: string
  needsReconnect: boolean
  tokenExpiresAt: string | null
  scopes: string[]
  metadata: Record<string, unknown> | null
}

/// Retourne les chaînes YouTube persistées du user. Lecture PURE : aucun appel
/// Google, aucune écriture. Zéro, une ou plusieurs chaînes — la liste vide est
/// un état normal, jamais une erreur.
@Injectable()
export class GetYouTubeAccountsUseCase {
  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
  ) {}

  async execute(userId: string): Promise<YouTubeAccountView[]> {
    const accounts = await this.socialAccounts.findByUserId(userId)
    return accounts
      .filter((a) => a.platform === 'youtube')
      .map((a) => ({
        id: a.id,
        externalAccountId: a.externalAccountId,
        accountName: a.accountName,
        platform: 'youtube' as const,
        status: a.status.toUpperCase(),
        needsReconnect: a.needsReconnect,
        tokenExpiresAt: a.tokenExpiresAt?.toISOString() ?? null,
        scopes: a.scopes,
        // Le groupe de credentials est retiré : jamais exposé publiquement.
        metadata: stripCredentialGroupId(a.metadata),
      }))
  }
}
