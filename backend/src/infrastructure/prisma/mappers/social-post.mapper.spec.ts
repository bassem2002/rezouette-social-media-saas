import type { SocialPost as PrismaSocialPost } from '../../../../generated/prisma/client.js'
import { SocialPostMapper } from './social-post.mapper.js'
import { SocialPost } from '../../../domain/social-post/entities/social-post.entity.js'

const CREATED_AT = new Date('2026-07-30T08:00:00.000Z')

function row(overrides: Partial<PrismaSocialPost> = {}): PrismaSocialPost {
  return {
    id: 'b3f1c2d4-0000-0000-0000-000000000abc',
    userId: '00000000-0000-0000-0000-000000000001',
    platform: 'YOUTUBE',
    accountId: null,
    externalPostId: null,
    publishId: null,
    caption: null,
    mediaUrl: null,
    status: 'PENDING',
    errorMessage: null,
    metaCode: null,
    metaSubcode: null,
    metaReason: null,
    retryable: null,
    publishedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  } as PrismaSocialPost
}

describe('SocialPostMapper — YouTube', () => {
  it('traduit YOUTUBE en youtube', () => {
    expect(SocialPostMapper.toDomain(row()).platform).toBe('youtube')
  })

  it('traduit youtube en YOUTUBE', () => {
    const post = SocialPost.createPending({
      userId: '00000000-0000-0000-0000-000000000001',
      platform: 'youtube',
      caption: 'Ma vidéo',
      mediaUrl: 'https://example.test/clip.mp4',
    })

    expect(SocialPostMapper.toPersistence(post).platform).toBe('YOUTUBE')
  })

  it('reste PENDING après réception d’un identifiant de tâche asynchrone', () => {
    const post = SocialPost.createPending({
      userId: '00000000-0000-0000-0000-000000000001',
      platform: 'youtube',
    })

    // Cas YouTube : la vidéo est acceptée (videoId connu) mais encore en cours
    // de traitement côté Google — l'historique doit rester PENDING.
    post.attachPublishId('yt-video-id')

    const persisted = SocialPostMapper.toPersistence(post)
    expect(persisted.status).toBe('PENDING')
    expect(persisted.publishId).toBe('yt-video-id')
    expect(persisted.externalPostId).toBeNull()
  })

  it('restaure une ligne YouTube PENDING porteuse d’un publishId', () => {
    const post = SocialPostMapper.toDomain(
      row({ status: 'PENDING', publishId: 'yt-video-id' }),
    )

    expect(post.platform).toBe('youtube')
    expect(post.status).toBe('pending')
    expect(post.publishId).toBe('yt-video-id')
    expect(post.externalPostId).toBeNull()
  })
})
