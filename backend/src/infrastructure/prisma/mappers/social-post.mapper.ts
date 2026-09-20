import type { SocialPost as PrismaSocialPost } from '../../../../generated/prisma/client.js'
import {
  SocialPost,
  type SocialPostPlatform,
  type SocialPostStatus,
} from '../../../domain/social-post/entities/social-post.entity.js'

/// Enums : domaine en minuscules, base de données en MAJUSCULES.
const PLATFORM_TO_DB = {
  facebook: 'FACEBOOK',
  instagram: 'INSTAGRAM',
  tiktok: 'TIKTOK',
  linkedin: 'LINKEDIN',
  youtube: 'YOUTUBE',
} as const satisfies Record<SocialPostPlatform, string>

const PLATFORM_TO_DOMAIN: Record<string, SocialPostPlatform> = {
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  TIKTOK: 'tiktok',
  LINKEDIN: 'linkedin',
  YOUTUBE: 'youtube',
}

const STATUS_TO_DB = {
  pending: 'PENDING',
  published: 'PUBLISHED',
  failed: 'FAILED',
} as const satisfies Record<SocialPostStatus, string>

const STATUS_TO_DOMAIN: Record<string, SocialPostStatus> = {
  PENDING: 'pending',
  PUBLISHED: 'published',
  FAILED: 'failed',
}

/// Conversion plateforme domaine → valeur DB (utile pour les requêtes ciblées).
export function toDbSocialPostPlatform(
  platform: SocialPostPlatform,
): (typeof PLATFORM_TO_DB)[SocialPostPlatform] {
  return PLATFORM_TO_DB[platform]
}

export const SocialPostMapper = {
  toDomain(row: PrismaSocialPost): SocialPost {
    return SocialPost.reconstitute({
      id: row.id,
      userId: row.userId,
      platform: PLATFORM_TO_DOMAIN[row.platform],
      accountId: row.accountId,
      externalPostId: row.externalPostId,
      publishId: row.publishId,
      caption: row.caption,
      mediaUrl: row.mediaUrl,
      status: STATUS_TO_DOMAIN[row.status],
      errorMessage: row.errorMessage,
      metaCode: row.metaCode,
      metaSubcode: row.metaSubcode,
      metaReason: row.metaReason,
      retryable: row.retryable,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  },

  toPersistence(post: SocialPost) {
    return {
      id: post.id,
      userId: post.userId,
      platform: PLATFORM_TO_DB[post.platform],
      accountId: post.accountId,
      externalPostId: post.externalPostId,
      publishId: post.publishId,
      caption: post.caption,
      mediaUrl: post.mediaUrl,
      status: STATUS_TO_DB[post.status],
      errorMessage: post.errorMessage,
      metaCode: post.metaCode,
      metaSubcode: post.metaSubcode,
      metaReason: post.metaReason,
      retryable: post.retryable,
      publishedAt: post.publishedAt,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    }
  },
}
