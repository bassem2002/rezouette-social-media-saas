import { ScheduledPost } from '../../../domain/scheduled-post/entities/scheduled-post.entity.js'
import type { ScheduledPostPlatform } from '../../../domain/scheduled-post/entities/scheduled-post.entity.js'
import type { ScheduledPlatformOptions } from '../../../domain/scheduled-post/value-objects/scheduled-platform-options.js'
import { ProcessDueScheduledPostsUseCase } from './process-due-scheduled-posts.use-case.js'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const PAST = new Date('2020-01-01T10:00:00.000Z')

/// Planification déjà due : on la crée dans le futur (invariant de l'entité)
/// puis on reconstruit l'entité avec une échéance passée.
function duePost(
  platforms: ScheduledPostPlatform[],
  options: {
    platformOptions?: ScheduledPlatformOptions | null
    videoUrl?: string | null
  } = {},
): ScheduledPost {
  const post = ScheduledPost.schedule({
    userId: USER_ID,
    platforms,
    scheduledAt: new Date('2099-01-01T10:00:00.000Z'),
    message: 'Bonjour',
    videoUrl:
      options.videoUrl === undefined
        ? 'https://example.test/clip.mp4'
        : options.videoUrl,
    imageUrl: 'https://example.test/img.jpg',
    platformOptions: options.platformOptions ?? null,
  })
  return ScheduledPost.reconstitute({
    id: post.id,
    userId: post.userId,
    platforms: post.platforms,
    message: post.message,
    caption: post.caption,
    imageUrl: post.imageUrl,
    videoUrl: post.videoUrl,
    platformOptions: post.platformOptions,
    scheduledAt: PAST,
    status: 'scheduled',
    attempts: 0,
    lastError: null,
    processedAt: null,
    createdAt: PAST,
    updatedAt: PAST,
  })
}

function makeUseCase(due: ScheduledPost[], publishResult?: unknown) {
  const scheduledPosts = {
    save: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn(),
    findAll: jest.fn(),
    findByUserId: jest.fn(),
    findDue: jest.fn().mockResolvedValue(due),
  }
  const publishSocial = {
    execute: jest.fn().mockResolvedValue(
      publishResult ?? {
        success: true,
        results: [{ platform: 'facebook', success: true }],
      },
    ),
  }
  return {
    useCase: new ProcessDueScheduledPostsUseCase(
      scheduledPosts as never,
      publishSocial as never,
    ),
    scheduledPosts,
    publishSocial,
  }
}

describe('ProcessDueScheduledPostsUseCase — plateformes programmables', () => {
  it.each(['facebook', 'instagram', 'tiktok', 'linkedin'] as const)(
    'publie une planification %s',
    async (platform) => {
    const post = duePost([platform])
    const { useCase, publishSocial } = makeUseCase([post])

    const result = await useCase.execute()

    expect(publishSocial.execute).toHaveBeenCalledTimes(1)
    expect(publishSocial.execute.mock.calls[0][0].platforms).toEqual([platform])
    expect(result).toEqual({ processed: 1, published: 1, failed: 0 })
    expect(post.status).toBe('published')
    },
  )

  it('publie une planification multi-réseaux historique', async () => {
    const post = duePost(['facebook', 'instagram', 'tiktok', 'linkedin'])
    const { useCase, publishSocial } = makeUseCase([post])

    await useCase.execute()

    expect(publishSocial.execute.mock.calls[0][0].platforms).toEqual([
      'facebook',
      'instagram',
      'tiktok',
      'linkedin',
    ])
  })

  it('ne transmet pas youtubeOptions quand la ligne ne cible pas youtube', async () => {
    const post = duePost(['facebook'])
    const { useCase, publishSocial } = makeUseCase([post])

    await useCase.execute()

    const input = publishSocial.execute.mock.calls[0][0]
    expect(input.youtubeOptions).toBeUndefined()
    expect(Object.keys(input)).not.toContain('youtubeOptions')
  })
})

describe('ProcessDueScheduledPostsUseCase — lignes YouTube incohérentes', () => {
  it('marque FAILED une ligne YouTube sans options, sans publier', async () => {
    const post = duePost(['youtube'])
    const { useCase, publishSocial } = makeUseCase([post])

    const result = await useCase.execute()

    // Aucun appel à l'orchestrateur, donc aucun upload ni appel Google.
    expect(publishSocial.execute).not.toHaveBeenCalled()
    expect(post.status).toBe('failed')
    expect(post.lastError).toMatch(/YouTube/)
    expect(result).toEqual({ processed: 1, published: 0, failed: 1 })
  })

  it('refuse une planification mixte dont le bloc YouTube est incomplet', async () => {
    const post = duePost(['facebook', 'youtube'])
    const { useCase, publishSocial } = makeUseCase([post])

    await useCase.execute()

    // Cohérence avant tout : on ne publie pas Facebook si YouTube est bancal.
    expect(publishSocial.execute).not.toHaveBeenCalled()
    expect(post.status).toBe('failed')
  })

  it('n’empêche pas le traitement des autres planifications du lot', async () => {
    const youtubePost = duePost(['youtube'])
    const metaPost = duePost(['facebook'])
    const { useCase, publishSocial } = makeUseCase([youtubePost, metaPost])

    const result = await useCase.execute()

    expect(publishSocial.execute).toHaveBeenCalledTimes(1)
    expect(youtubePost.status).toBe('failed')
    expect(metaPost.status).toBe('published')
    expect(result).toEqual({ processed: 2, published: 1, failed: 1 })
  })
})

const YOUTUBE_OPTIONS: ScheduledPlatformOptions = {
  youtube: {
    accountId: '11111111-1111-1111-1111-111111111111',
    title: 'Ma vidéo',
    privacyStatus: 'unlisted',
    madeForKids: false,
    description: 'Description',
    tags: ['zernio', 'saas'],
    categoryId: '22',
    containsSyntheticMedia: false,
    notifySubscribers: true,
  },
}

describe('ProcessDueScheduledPostsUseCase — planification YouTube', () => {
  it('transmet videoUrl et des youtubeOptions validées', async () => {
    const post = duePost(['youtube'], { platformOptions: YOUTUBE_OPTIONS })
    const { useCase, publishSocial } = makeUseCase([post])

    await useCase.execute()

    const input = publishSocial.execute.mock.calls[0][0]
    expect(input.platforms).toEqual(['youtube'])
    expect(input.videoUrl).toBe('https://example.test/clip.mp4')
    expect(input.youtubeOptions).toEqual({
      accountId: '11111111-1111-1111-1111-111111111111',
      title: 'Ma vidéo',
      privacyStatus: 'unlisted',
      madeForKids: false,
      description: 'Description',
      tags: ['zernio', 'saas'],
      categoryId: '22',
      containsSyntheticMedia: false,
      notifySubscribers: true,
    })
  })

  it('applique la visibilité private par défaut', async () => {
    const post = duePost(['youtube'], {
      platformOptions: {
        youtube: {
          accountId: '11111111-1111-1111-1111-111111111111',
          title: 'Ma vidéo',
          madeForKids: true,
        },
      },
    })
    const { useCase, publishSocial } = makeUseCase([post])

    await useCase.execute()

    const options = publishSocial.execute.mock.calls[0][0].youtubeOptions
    expect(options.privacyStatus).toBe('private')
    expect(options.madeForKids).toBe(true)
  })

  it('normalise les tags (trim, vides et doublons retirés)', async () => {
    const post = duePost(['youtube'], {
      platformOptions: {
        youtube: {
          accountId: '11111111-1111-1111-1111-111111111111',
          title: 'Ma vidéo',
          madeForKids: false,
          tags: ['  zernio ', '', 'zernio', 'saas', '   '],
        },
      },
    })
    const { useCase, publishSocial } = makeUseCase([post])

    await useCase.execute()

    expect(publishSocial.execute.mock.calls[0][0].youtubeOptions.tags).toEqual([
      'zernio',
      'saas',
    ])
  })

  it('ne transmet jamais le conteneur platformOptions brut', async () => {
    const post = duePost(['youtube'], { platformOptions: YOUTUBE_OPTIONS })
    const { useCase, publishSocial } = makeUseCase([post])

    await useCase.execute()

    const input = publishSocial.execute.mock.calls[0][0]
    expect(input.platformOptions).toBeUndefined()
    // L'objet transmis est une COPIE : le muter n'altère pas la planification.
    input.youtubeOptions.title = 'Titre pirate'
    expect(post.platformOptions?.youtube?.title).toBe('Ma vidéo')
  })

  it('partage videoUrl entre TikTok et YouTube', async () => {
    const post = duePost(['tiktok', 'youtube'], {
      platformOptions: YOUTUBE_OPTIONS,
    })
    const { useCase, publishSocial } = makeUseCase([post])

    await useCase.execute()

    const input = publishSocial.execute.mock.calls[0][0]
    expect(input.platforms).toEqual(['tiktok', 'youtube'])
    expect(input.videoUrl).toBe('https://example.test/clip.mp4')
  })

  it('transmet Facebook et YouTube ensemble', async () => {
    const post = duePost(['facebook', 'youtube'], {
      platformOptions: YOUTUBE_OPTIONS,
    })
    const { useCase, publishSocial } = makeUseCase([post])

    await useCase.execute()

    expect(publishSocial.execute.mock.calls[0][0].platforms).toEqual([
      'facebook',
      'youtube',
    ])
  })

  it('considère un upload accepté en cours de traitement comme distribué', async () => {
    const post = duePost(['youtube'], { platformOptions: YOUTUBE_OPTIONS })
    const { useCase } = makeUseCase([post], {
      success: true,
      results: [
        {
          platform: 'youtube',
          success: true,
          processing: true,
          publishId: 'yt-video-1',
        },
      ],
    })

    const result = await useCase.execute()

    // La distribution à l'échéance a réussi ; la suite du cycle appartient au
    // SocialPost, finalisé par la réconciliation.
    expect(post.status).toBe('published')
    expect(result).toEqual({ processed: 1, published: 0 + 1, failed: 0 })
  })

  it('suit la politique d’échec existante quand YouTube échoue', async () => {
    const post = duePost(['facebook', 'youtube'], {
      platformOptions: YOUTUBE_OPTIONS,
    })
    const { useCase } = makeUseCase([post], {
      success: false,
      results: [
        { platform: 'facebook', success: true },
        { platform: 'youtube', success: false, error: 'quota dépassé' },
      ],
    })

    const result = await useCase.execute()

    // Aucun rollback Facebook : les SocialPost individuels font foi.
    expect(post.status).toBe('failed')
    expect(post.lastError).toContain('youtube')
    expect(result.failed).toBe(1)
  })

  it.each([
    ['accountId absent', { title: 'T', madeForKids: false }],
    ['title absent', { accountId: 'acc-1', madeForKids: false }],
    ['title vide', { accountId: 'acc-1', title: '   ', madeForKids: false }],
    ['madeForKids absent', { accountId: 'acc-1', title: 'T' }],
  ])('marque FAILED une ligne héritée (%s), sans publier', async (_label, youtube) => {
    const post = duePost(['youtube'], {
      platformOptions: { youtube } as ScheduledPlatformOptions,
    })
    const { useCase, publishSocial } = makeUseCase([post])

    await useCase.execute()

    expect(publishSocial.execute).not.toHaveBeenCalled()
    expect(post.status).toBe('failed')
    expect(post.lastError).toMatch(/YouTube/)
  })

  it('marque FAILED une ligne YouTube sans videoUrl', async () => {
    const post = duePost(['youtube'], {
      platformOptions: YOUTUBE_OPTIONS,
      videoUrl: null,
    })
    const { useCase, publishSocial } = makeUseCase([post])

    await useCase.execute()

    expect(publishSocial.execute).not.toHaveBeenCalled()
    expect(post.status).toBe('failed')
    expect(post.lastError).toMatch(/videoUrl/i)
  })

  it('ne comble JAMAIS un madeForKids absent par false', async () => {
    const post = duePost(['youtube'], {
      platformOptions: {
        youtube: { accountId: 'acc-1', title: 'T' },
      } as ScheduledPlatformOptions,
    })
    const { useCase, publishSocial } = makeUseCase([post])

    await useCase.execute()

    expect(publishSocial.execute).not.toHaveBeenCalled()
    expect(post.lastError).toMatch(/madeForKids/)
  })
})
