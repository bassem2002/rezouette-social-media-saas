import { BadRequestException } from '@nestjs/common'
import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import type { ScheduledPost } from '../../../domain/scheduled-post/entities/scheduled-post.entity.js'
import { CreateScheduledPostUseCase } from './create-scheduled-post.use-case.js'
import type { CreateScheduledPostInput } from './create-scheduled-post.use-case.js'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '11111111-1111-1111-1111-111111111111'
const FUTURE = '2099-01-01T10:00:00.000Z'
const VIDEO_URL = 'https://api.zernio.test/uploads/social/2026/08/clip.mp4'

function channel(
  overrides: { platform?: 'youtube' | 'tiktok'; userId?: string } = {},
): SocialAccount {
  const account = SocialAccount.create({
    userId: overrides.userId ?? USER_ID,
    platform: overrides.platform ?? 'youtube',
    externalAccountId: 'UC_channel_1',
    accountName: 'Zernio Channel',
    accessToken: 'fake-access-token',
    refreshToken: 'fake-refresh-token',
    tokenExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    scopes: [],
    metadata: {},
  })
  Object.defineProperty(account, 'id', { get: () => CHANNEL_ID })
  return account
}

function makeUseCase(accounts: SocialAccount[] = [channel()]) {
  const scheduledPosts = {
    save: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn(),
    findAll: jest.fn(),
    findByUserId: jest.fn(),
    findDue: jest.fn(),
  }
  const socialAccounts = {
    findById: jest.fn(),
    findByUserId: jest
      .fn()
      .mockImplementation(async (userId: string) =>
        accounts.filter((a) => a.userId === userId),
      ),
    findByExternalAccount: jest.fn(),
    save: jest.fn(),
  }
  return {
    useCase: new CreateScheduledPostUseCase(
      scheduledPosts as never,
      socialAccounts as never,
    ),
    scheduledPosts,
    socialAccounts,
  }
}

function youtubeInput(
  youtube: Record<string, unknown> = {},
  overrides: Partial<CreateScheduledPostInput> = {},
): CreateScheduledPostInput {
  return {
    userId: USER_ID,
    platforms: ['youtube'],
    scheduledAt: FUTURE,
    videoUrl: VIDEO_URL,
    platformOptions: {
      youtube: {
        accountId: CHANNEL_ID,
        title: 'Ma vidéo',
        madeForKids: false,
        ...youtube,
      },
    },
    ...overrides,
  } as CreateScheduledPostInput
}

function savedPost(scheduledPosts: { save: jest.Mock }): ScheduledPost {
  return scheduledPosts.save.mock.calls[0][0] as ScheduledPost
}

describe('CreateScheduledPostUseCase — compatibilité', () => {
  it.each([
    ['facebook', { message: 'Bonjour' }],
    ['instagram', { imageUrl: 'https://img.test/a.jpg', caption: 'Légende' }],
    ['tiktok', { videoUrl: VIDEO_URL, caption: 'Clip' }],
    ['linkedin', { message: 'Bonjour' }],
  ])('accepte une planification %s sans platformOptions', async (platform, extra) => {
    const { useCase, scheduledPosts } = makeUseCase()

    await useCase.execute({
      userId: USER_ID,
      platforms: [platform],
      scheduledAt: FUTURE,
      ...extra,
    } as CreateScheduledPostInput)

    expect(scheduledPosts.save).toHaveBeenCalledTimes(1)
    expect(savedPost(scheduledPosts).platformOptions).toBeNull()
  })

  it('ne consulte aucun compte quand YouTube n’est pas ciblé', async () => {
    const { useCase, socialAccounts } = makeUseCase()

    await useCase.execute({
      userId: USER_ID,
      platforms: ['facebook'],
      scheduledAt: FUTURE,
      message: 'Bonjour',
    } as CreateScheduledPostInput)

    expect(socialAccounts.findByUserId).not.toHaveBeenCalled()
  })
})

describe('CreateScheduledPostUseCase — YouTube valide', () => {
  it('persiste la planification avec ses options normalisées', async () => {
    const { useCase, scheduledPosts } = makeUseCase()

    await useCase.execute(youtubeInput())

    const post = savedPost(scheduledPosts)
    expect(post.platforms).toEqual(['youtube'])
    expect(post.videoUrl).toBe(VIDEO_URL)
    expect(post.platformOptions?.youtube).toEqual({
      accountId: CHANNEL_ID,
      title: 'Ma vidéo',
      privacyStatus: 'private',
      madeForKids: false,
    })
  })

  it('applique la visibilité private par défaut', async () => {
    const { useCase, scheduledPosts } = makeUseCase()

    await useCase.execute(youtubeInput())

    expect(savedPost(scheduledPosts).platformOptions?.youtube?.privacyStatus).toBe(
      'private',
    )
  })

  it('conserve une visibilité explicite', async () => {
    const { useCase, scheduledPosts } = makeUseCase()

    await useCase.execute(youtubeInput({ privacyStatus: 'unlisted' }))

    expect(savedPost(scheduledPosts).platformOptions?.youtube?.privacyStatus).toBe(
      'unlisted',
    )
  })

  it('nettoie et déduplique les tags', async () => {
    const { useCase, scheduledPosts } = makeUseCase()

    await useCase.execute(
      youtubeInput({ tags: ['  zernio ', '', 'zernio', 'saas'] }),
    )

    expect(savedPost(scheduledPosts).platformOptions?.youtube?.tags).toEqual([
      'zernio',
      'saas',
    ])
  })

  it('trime le titre et conserve les options facultatives', async () => {
    const { useCase, scheduledPosts } = makeUseCase()

    await useCase.execute(
      youtubeInput({
        title: '  Ma vidéo  ',
        description: 'Description',
        categoryId: '22',
        containsSyntheticMedia: true,
        notifySubscribers: false,
      }),
    )

    expect(savedPost(scheduledPosts).platformOptions?.youtube).toEqual({
      accountId: CHANNEL_ID,
      title: 'Ma vidéo',
      privacyStatus: 'private',
      madeForKids: false,
      description: 'Description',
      categoryId: '22',
      containsSyntheticMedia: true,
      notifySubscribers: false,
    })
  })

  it('accepte une planification multi-réseaux avec YouTube', async () => {
    const { useCase, scheduledPosts } = makeUseCase()

    await useCase.execute(
      youtubeInput({}, { platforms: ['tiktok', 'youtube'] }),
    )

    expect(savedPost(scheduledPosts).platforms).toEqual(['tiktok', 'youtube'])
  })

  it('n’effectue AUCUN appel réseau ni refresh de token', async () => {
    const { useCase, socialAccounts } = makeUseCase()

    await useCase.execute(youtubeInput())

    // Seule une lecture des comptes : ni token, ni Google.
    expect(socialAccounts.findByUserId).toHaveBeenCalledTimes(1)
    expect(socialAccounts.save).not.toHaveBeenCalled()
  })
})

describe('CreateScheduledPostUseCase — YouTube invalide', () => {
  async function expectRejected(
    input: CreateScheduledPostInput,
    pattern: RegExp,
    accounts?: SocialAccount[],
  ) {
    const { useCase, scheduledPosts } = makeUseCase(accounts)

    await expect(useCase.execute(input)).rejects.toThrow(BadRequestException)
    await expect(useCase.execute(input)).rejects.toThrow(pattern)
    // Rien n'est persisté : un job cohérent, ou aucun job.
    expect(scheduledPosts.save).not.toHaveBeenCalled()
  }

  it('refuse une vidéo manquante', async () => {
    await expectRejected(
      youtubeInput({}, { videoUrl: undefined }),
      /videoUrl/i,
    )
  })

  it('refuse des options absentes', async () => {
    await expectRejected(
      {
        userId: USER_ID,
        platforms: ['youtube'],
        scheduledAt: FUTURE,
        videoUrl: VIDEO_URL,
      } as CreateScheduledPostInput,
      /platformOptions\.youtube/,
    )
  })

  it('refuse un accountId absent', async () => {
    await expectRejected(
      youtubeInput({ accountId: undefined }),
      /accountId/,
    )
  })

  it('refuse un titre absent', async () => {
    await expectRejected(youtubeInput({ title: undefined }), /titre/i)
  })

  it('refuse un titre vide', async () => {
    await expectRejected(youtubeInput({ title: '   ' }), /titre/i)
  })

  it('refuse un titre trop long', async () => {
    await expectRejected(youtubeInput({ title: 'x'.repeat(101) }), /100/)
  })

  it('refuse une description trop longue', async () => {
    await expectRejected(
      youtubeInput({ description: 'x'.repeat(5001) }),
      /5000/,
    )
  })

  it('refuse un madeForKids absent (déclaration légale)', async () => {
    await expectRejected(youtubeInput({ madeForKids: undefined }), /madeForKids/)
  })

  it('refuse un madeForKids non booléen', async () => {
    await expectRejected(
      youtubeInput({ madeForKids: 'oui' as never }),
      /madeForKids/,
    )
  })

  it('refuse une visibilité invalide', async () => {
    await expectRejected(
      youtubeInput({ privacyStatus: 'secret' as never }),
      /visibilité/i,
    )
  })

  it('refuse une chaîne inconnue', async () => {
    await expectRejected(youtubeInput(), /introuvable/i, [])
  })

  it("refuse la chaîne d'un autre utilisateur", async () => {
    await expectRejected(youtubeInput(), /introuvable/i, [
      channel({ userId: 'autre-user' }),
    ])
  })

  it("refuse un compte d'une autre plateforme utilisé comme chaîne", async () => {
    await expectRejected(youtubeInput(), /introuvable/i, [
      channel({ platform: 'tiktok' }),
    ])
  })

  it('refuse des options YouTube sans cibler youtube', async () => {
    await expectRejected(
      youtubeInput({}, { platforms: ['facebook'], message: 'Bonjour' }),
      /ne fait pas partie des plateformes/i,
    )
  })
})
