import { SocialPost } from '../../domain/social-post/entities/social-post.entity.js'
import type { SocialPostPlatform } from '../../domain/social-post/entities/social-post.entity.js'
import { SocialPostResponseDto } from './dto/social-post-response.dto.js'

const PLATFORM_TO_API = {
  facebook: 'FACEBOOK',
  instagram: 'INSTAGRAM',
  tiktok: 'TIKTOK',
  linkedin: 'LINKEDIN',
  youtube: 'YOUTUBE',
} as const satisfies Record<SocialPostPlatform, string>

const STATUS_TO_API = {
  pending: 'PENDING',
  published: 'PUBLISHED',
  failed: 'FAILED',
} as const

/// Convertit l'entité domaine en réponse HTTP (enums MAJUSCULES, dates ISO).
export function toSocialPostResponse(post: SocialPost): SocialPostResponseDto {
  return {
    id: post.id,
    userId: post.userId,
    platform: PLATFORM_TO_API[post.platform],
    accountId: post.accountId,
    externalPostId: post.externalPostId,
    // Identifiant de tâche fournisseur (videoId YouTube, publish_id TikTok).
    // Aucun secret : ni token, ni URI de session d'upload, ni chemin local.
    publishId: post.publishId,
    caption: post.caption,
    mediaUrl: post.mediaUrl,
    status: STATUS_TO_API[post.status],
    errorMessage: post.errorMessage,
    metaCode: post.metaCode,
    metaSubcode: post.metaSubcode,
    metaReason: post.metaReason,
    retryable: post.retryable,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  }
}
