import type { SocialAccount as PrismaSocialAccount } from '../../../../generated/prisma/client.js'
import { Prisma } from '../../../../generated/prisma/client.js'
import {
  SocialAccount,
  type SocialAccountStatus,
} from '../../../domain/social-account/entities/social-account.entity.js'
import { type SocialPlatform } from '../../../domain/shared/ports/social-provider.port.js'

/// Enums : domaine en minuscules, base de données en MAJUSCULES.
const PLATFORM_TO_DB = {
  facebook: 'FACEBOOK',
  instagram: 'INSTAGRAM',
  linkedin: 'LINKEDIN',
  tiktok: 'TIKTOK',
  youtube: 'YOUTUBE',
  threads: 'THREADS',
} as const satisfies Record<SocialPlatform, string>

const PLATFORM_TO_DOMAIN: Record<string, SocialPlatform> = {
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  LINKEDIN: 'linkedin',
  TIKTOK: 'tiktok',
  YOUTUBE: 'youtube',
  THREADS: 'threads',
}

const STATUS_TO_DB = {
  active: 'ACTIVE',
  expired: 'EXPIRED',
  revoked: 'REVOKED',
  error: 'ERROR',
} as const satisfies Record<SocialAccountStatus, string>

const STATUS_TO_DOMAIN: Record<string, SocialAccountStatus> = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
  ERROR: 'error',
}

/// Conversion plateforme domaine → valeur DB (utile pour les requêtes ciblées).
export function toDbPlatform(
  platform: SocialPlatform,
): (typeof PLATFORM_TO_DB)[SocialPlatform] {
  return PLATFORM_TO_DB[platform]
}

export const SocialAccountMapper = {
  toDomain(row: PrismaSocialAccount): SocialAccount {
    return SocialAccount.reconstitute({
      id: row.id,
      userId: row.userId,
      platform: PLATFORM_TO_DOMAIN[row.platform],
      externalAccountId: row.externalAccountId,
      accountName: row.accountName,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      tokenExpiresAt: row.tokenExpiresAt,
      scopes: row.scopes,
      status: STATUS_TO_DOMAIN[row.status],
      metadata: row.metadata as Record<string, unknown> | null,
      lastRefreshAt: row.lastRefreshAt,
      needsReconnect: row.needsReconnect,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  },

  toPersistence(account: SocialAccount) {
    return {
      id: account.id,
      userId: account.userId,
      platform: PLATFORM_TO_DB[account.platform],
      externalAccountId: account.externalAccountId,
      accountName: account.accountName,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      tokenExpiresAt: account.tokenExpiresAt,
      scopes: account.scopes,
      status: STATUS_TO_DB[account.status],
      metadata:
        account.metadata === null
          ? Prisma.JsonNull
          : (account.metadata as Prisma.InputJsonValue),
      lastRefreshAt: account.lastRefreshAt,
      needsReconnect: account.needsReconnect,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }
  },
}
