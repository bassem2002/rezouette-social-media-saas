import { SocialAccount } from '../entities/social-account.entity.js'
import { SocialPlatform } from '../../shared/ports/social-provider.port.js'

/// Contrat de persistance des comptes sociaux. Pas de `delete` :
/// la déconnexion se fait via `account.revoke()` puis `save()`.
export interface SocialAccountRepository {
  findById(id: string): Promise<SocialAccount | null>
  findByUserId(userId: string): Promise<SocialAccount[]>
  findByExternalAccount(
    userId: string,
    platform: SocialPlatform,
    externalAccountId: string,
  ): Promise<SocialAccount | null>
  save(account: SocialAccount): Promise<void>
}

export const SOCIAL_ACCOUNT_REPOSITORY = Symbol('SocialAccountRepository')
