import { ScheduledPost } from '../../domain/scheduled-post/entities/scheduled-post.entity.js'
import type {
  ScheduledPostPlatform,
  ScheduledPostStatus,
} from '../../domain/scheduled-post/entities/scheduled-post.entity.js'
import type { ScheduledPlatformOptions } from '../../domain/scheduled-post/value-objects/scheduled-platform-options.js'
import {
  ScheduledPlatformOptionsResponseDto,
  ScheduledPostResponseDto,
} from './dto/scheduled-post-response.dto.js'

const PLATFORM_TO_API = {
  facebook: 'FACEBOOK',
  instagram: 'INSTAGRAM',
  tiktok: 'TIKTOK',
  linkedin: 'LINKEDIN',
  youtube: 'YOUTUBE',
} as const satisfies Record<ScheduledPostPlatform, string>

const STATUS_TO_API = {
  scheduled: 'SCHEDULED',
  processing: 'PROCESSING',
  published: 'PUBLISHED',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
} as const satisfies Record<ScheduledPostStatus, string>

/// Projette les options par plateforme en réponse HTTP. Les champs optionnels du
/// domaine sont normalisés en `null` (ou `[]` pour les tags), pour un contrat de
/// réponse stable. Construction explicite : aucune référence du domaine ne fuit.
function toPlatformOptionsResponse(
  options: ScheduledPlatformOptions | null,
): ScheduledPlatformOptionsResponseDto | null {
  if (options === null) return null
  const { youtube } = options
  if (!youtube) return null
  return {
    youtube: {
      // `null` = non renseigné. On ne comble JAMAIS l'absence par une valeur
      // par défaut : `madeForKids` est une déclaration légale.
      title: youtube.title ?? null,
      description: youtube.description ?? null,
      tags: youtube.tags ? [...youtube.tags] : [],
      categoryId: youtube.categoryId ?? null,
      privacyStatus: youtube.privacyStatus ?? null,
      madeForKids: youtube.madeForKids ?? null,
      containsSyntheticMedia: youtube.containsSyntheticMedia ?? null,
      notifySubscribers: youtube.notifySubscribers ?? null,
      accountId: youtube.accountId ?? null,
    },
  }
}

/// Convertit l'entité domaine en réponse HTTP (enums MAJUSCULES, dates ISO).
export function toScheduledPostResponse(
  post: ScheduledPost,
): ScheduledPostResponseDto {
  return {
    id: post.id,
    userId: post.userId,
    platforms: post.platforms.map((p) => PLATFORM_TO_API[p]),
    message: post.message,
    caption: post.caption,
    imageUrl: post.imageUrl,
    videoUrl: post.videoUrl,
    platformOptions: toPlatformOptionsResponse(post.platformOptions),
    scheduledAt: post.scheduledAt.toISOString(),
    status: STATUS_TO_API[post.status],
    attempts: post.attempts,
    lastError: post.lastError,
    processedAt: post.processedAt ? post.processedAt.toISOString() : null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  }
}
