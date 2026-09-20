import type { Post as PrismaPost } from '../../../../generated/prisma/client.js'
import {
  Post,
  type PostStatus,
} from '../../../domain/post/entities/post.entity.js'

const STATUS_TO_DB = {
  draft: 'DRAFT',
  scheduled: 'SCHEDULED',
  publishing: 'PUBLISHING',
  published: 'PUBLISHED',
  partially_published: 'PARTIALLY_PUBLISHED',
  failed: 'FAILED',
} as const satisfies Record<PostStatus, string>

const STATUS_TO_DOMAIN: Record<string, PostStatus> = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  PUBLISHING: 'publishing',
  PUBLISHED: 'published',
  PARTIALLY_PUBLISHED: 'partially_published',
  FAILED: 'failed',
}

export const PostMapper = {
  toDomain(row: PrismaPost): Post {
    return Post.reconstitute({
      id: row.id,
      userId: row.userId,
      content: row.content,
      status: STATUS_TO_DOMAIN[row.status],
      scheduledAt: row.scheduledAt,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  },

  toPersistence(post: Post) {
    return {
      id: post.id,
      userId: post.userId,
      content: post.content,
      status: STATUS_TO_DB[post.status],
      scheduledAt: post.scheduledAt,
      publishedAt: post.publishedAt,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    }
  },
}
