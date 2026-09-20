import { PrismaSocialPostRepository } from './prisma-social-post.repository.js'

const CREATED_AT = new Date('2026-08-01T08:00:00.000Z')

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b3f1c2d4-0000-0000-0000-000000000abc',
    userId: '00000000-0000-0000-0000-000000000001',
    platform: 'YOUTUBE',
    accountId: 'acc-1',
    externalPostId: null,
    publishId: 'yt-video-1',
    caption: 'Ma vidéo',
    mediaUrl: 'https://api.zernio.test/uploads/social/2026/08/clip.mp4',
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
  }
}

function makeRepository(rows: unknown[] = []) {
  const findMany = jest.fn().mockResolvedValue(rows)
  const prisma = { socialPost: { findMany, upsert: jest.fn(), findUnique: jest.fn() } }
  return {
    repository: new PrismaSocialPostRepository(prisma as never),
    findMany,
  }
}

describe('PrismaSocialPostRepository — findPendingByPlatform', () => {
  it('filtre sur la plateforme (en MAJUSCULES) et le statut PENDING', async () => {
    const { repository, findMany } = makeRepository()

    await repository.findPendingByPlatform('youtube', 25)

    expect(findMany).toHaveBeenCalledWith({
      where: { platform: 'YOUTUBE', status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 25,
    })
  })

  it('trie du plus ancien au plus récent', async () => {
    const { repository, findMany } = makeRepository()

    await repository.findPendingByPlatform('youtube', 10)

    expect(findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' })
  })

  it('applique la limite demandée', async () => {
    const { repository, findMany } = makeRepository()

    await repository.findPendingByPlatform('youtube', 5)

    expect(findMany.mock.calls[0][0].take).toBe(5)
  })

  it('normalise une limite absurde à au moins 1', async () => {
    const { repository, findMany } = makeRepository()

    await repository.findPendingByPlatform('youtube', 0)
    await repository.findPendingByPlatform('youtube', -10)

    expect(findMany.mock.calls[0][0].take).toBe(1)
    expect(findMany.mock.calls[1][0].take).toBe(1)
  })

  it('traduit YOUTUBE en youtube et mappe complètement la ligne', async () => {
    const { repository } = makeRepository([row()])

    const [post] = await repository.findPendingByPlatform('youtube', 25)

    expect(post.platform).toBe('youtube')
    expect(post.status).toBe('pending')
    expect(post.publishId).toBe('yt-video-1')
    expect(post.externalPostId).toBeNull()
    expect(post.accountId).toBe('acc-1')
    expect(post.createdAt).toEqual(CREATED_AT)
  })

  it('inclut les lignes SANS publishId (elles doivent pouvoir expirer)', async () => {
    const { repository, findMany } = makeRepository([row({ publishId: null })])

    const [post] = await repository.findPendingByPlatform('youtube', 25)

    // Aucun filtre SQL sur publishId.
    expect(JSON.stringify(findMany.mock.calls[0][0].where)).not.toContain(
      'publishId',
    )
    expect(post.publishId).toBeNull()
  })

  it('fonctionne pour une autre plateforme', async () => {
    const { repository, findMany } = makeRepository()

    await repository.findPendingByPlatform('tiktok', 25)

    expect(findMany.mock.calls[0][0].where.platform).toBe('TIKTOK')
  })
})
