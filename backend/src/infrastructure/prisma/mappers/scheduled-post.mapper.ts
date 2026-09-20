import type { ScheduledPost as PrismaScheduledPost } from '../../../../generated/prisma/client.js'
import { Prisma } from '../../../../generated/prisma/client.js'
import {
  ScheduledPost,
  type ScheduledPostPlatform,
  type ScheduledPostStatus,
} from '../../../domain/scheduled-post/entities/scheduled-post.entity.js'
import type { ScheduledPlatformOptions } from '../../../domain/scheduled-post/value-objects/scheduled-platform-options.js'
import {
  createYouTubeScheduleOptions,
  isYouTubePrivacyStatus,
  type YouTubeScheduleOptions,
} from '../../../domain/scheduled-post/value-objects/youtube-schedule-options.js'

/// Enums : domaine en minuscules, base de données en MAJUSCULES.
const PLATFORM_TO_DB = {
  facebook: 'FACEBOOK',
  instagram: 'INSTAGRAM',
  tiktok: 'TIKTOK',
  linkedin: 'LINKEDIN',
  youtube: 'YOUTUBE',
} as const satisfies Record<ScheduledPostPlatform, string>

const PLATFORM_TO_DOMAIN: Record<string, ScheduledPostPlatform> = {
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  TIKTOK: 'tiktok',
  LINKEDIN: 'linkedin',
  YOUTUBE: 'youtube',
}

const STATUS_TO_DB = {
  scheduled: 'SCHEDULED',
  processing: 'PROCESSING',
  published: 'PUBLISHED',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
} as const satisfies Record<ScheduledPostStatus, string>

const STATUS_TO_DOMAIN: Record<string, ScheduledPostStatus> = {
  SCHEDULED: 'scheduled',
  PROCESSING: 'processing',
  PUBLISHED: 'published',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
}

/// Vrai objet JSON (ni null, ni tableau, ni primitive).
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string')
}

/// JSON persisté → objet-valeur du domaine. Chaque champ est re-typé depuis
/// `unknown` : aucune référence n'est partagée avec la ligne Prisma et aucune
/// donnée inattendue ne franchit la frontière. Les défauts des champs
/// obligatoires viennent de la fabrique du domaine (source unique).
function toDomainYouTubeOptions(
  value: unknown,
): YouTubeScheduleOptions | undefined {
  if (!isPlainObject(value)) return undefined

  const privacyStatus = value['privacyStatus']
  return createYouTubeScheduleOptions({
    title: optionalString(value['title']),
    ...(isYouTubePrivacyStatus(privacyStatus) ? { privacyStatus } : {}),
    madeForKids: optionalBoolean(value['madeForKids']),
    description: optionalString(value['description']),
    tags: optionalStringArray(value['tags']),
    categoryId: optionalString(value['categoryId']),
    containsSyntheticMedia: optionalBoolean(value['containsSyntheticMedia']),
    notifySubscribers: optionalBoolean(value['notifySubscribers']),
    accountId: optionalString(value['accountId']),
  })
}

function toDomainPlatformOptions(
  value: unknown,
): ScheduledPlatformOptions | null {
  if (!isPlainObject(value)) return null
  const youtube = toDomainYouTubeOptions(value['youtube'])
  // Un JSON sans aucune option connue équivaut à « pas d'options ».
  return youtube ? { youtube } : null
}

/// Objet-valeur du domaine → JSON Prisma. `Prisma.DbNull` écrit un VRAI NULL SQL
/// (contrairement à `Prisma.JsonNull`, qui stockerait la valeur JSON `null`) :
/// c'est la sémantique attendue pour une colonne `Json?` optionnelle.
function toPersistencePlatformOptions(
  options: ScheduledPlatformOptions | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (options === null) return Prisma.DbNull
  // Sérialisation explicite : le cast reste confiné à cette frontière, et la
  // structure envoyée est une copie neuve (jamais la référence du domaine).
  return JSON.parse(JSON.stringify(options)) as Prisma.InputJsonValue
}

export const ScheduledPostMapper = {
  toDomain(row: PrismaScheduledPost): ScheduledPost {
    return ScheduledPost.reconstitute({
      id: row.id,
      userId: row.userId,
      platforms: row.platforms.map((p) => PLATFORM_TO_DOMAIN[p]),
      message: row.message,
      caption: row.caption,
      imageUrl: row.imageUrl,
      videoUrl: row.videoUrl,
      platformOptions: toDomainPlatformOptions(row.platformOptions),
      scheduledAt: row.scheduledAt,
      status: STATUS_TO_DOMAIN[row.status],
      attempts: row.attempts,
      lastError: row.lastError,
      processedAt: row.processedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  },

  toPersistence(post: ScheduledPost) {
    return {
      id: post.id,
      userId: post.userId,
      platforms: post.platforms.map((p) => PLATFORM_TO_DB[p]),
      message: post.message,
      caption: post.caption,
      imageUrl: post.imageUrl,
      videoUrl: post.videoUrl,
      platformOptions: toPersistencePlatformOptions(post.platformOptions),
      scheduledAt: post.scheduledAt,
      status: STATUS_TO_DB[post.status],
      attempts: post.attempts,
      lastError: post.lastError,
      processedAt: post.processedAt,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    }
  },
}
