import { PublishSocialUseCase } from './publish-social.use-case.js'
import type { PublishSocialInput } from './publish-social.use-case.js'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'
const VIDEO_URL = 'https://example.test/uploads/clip.mp4'

function youtubeOptions(overrides: Record<string, unknown> = {}) {
  return {
    accountId: ACCOUNT_ID,
    title: 'Ma vidéo',
    madeForKids: false,
    ...overrides,
  } as PublishSocialInput['youtubeOptions']
}

function makeOrchestrator(
  overrides: {
    youtube?: jest.Mock
    tiktok?: jest.Mock
    facebook?: jest.Mock
  } = {},
) {
  const facebook = {
    execute:
      overrides.facebook ??
      jest.fn().mockResolvedValue({ success: true, externalPostId: 'fb-1' }),
  }
  const instagram = {
    execute: jest.fn().mockResolvedValue({ success: true, externalPostId: 'ig-1' }),
  }
  const tiktok = {
    execute:
      overrides.tiktok ??
      jest.fn().mockResolvedValue({ success: true, externalPostId: 'tt-1' }),
  }
  const linkedin = {
    execute: jest.fn().mockResolvedValue({ success: true, externalPostId: 'li-1' }),
  }
  const youtube = {
    execute:
      overrides.youtube ??
      jest.fn().mockResolvedValue({
        success: true,
        processing: false,
        externalPostId: 'yt-1',
        publishId: 'yt-1',
      }),
  }

  return {
    useCase: new PublishSocialUseCase(
      facebook as never,
      instagram as never,
      tiktok as never,
      linkedin as never,
      youtube as never,
    ),
    facebook,
    tiktok,
    linkedin,
    youtube,
  }
}

describe('PublishSocialUseCase — YouTube', () => {
  it('publie sur youtube seul', async () => {
    const { useCase, youtube } = makeOrchestrator()

    const result = await useCase.execute({
      userId: USER_ID,
      platforms: ['youtube'],
      videoUrl: VIDEO_URL,
      youtubeOptions: youtubeOptions(),
    })

    expect(result.success).toBe(true)
    expect(result.results).toEqual([
      {
        platform: 'youtube',
        success: true,
        externalPostId: 'yt-1',
        processing: false,
        publishId: 'yt-1',
      },
    ])
    expect(youtube.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        accountId: ACCOUNT_ID,
        videoUrl: VIDEO_URL,
        title: 'Ma vidéo',
        madeForKids: false,
      }),
    )
  })

  it('expose processing sans externalPostId quand la vidéo est en traitement', async () => {
    const { useCase } = makeOrchestrator({
      youtube: jest.fn().mockResolvedValue({
        success: true,
        processing: true,
        externalPostId: null,
        publishId: 'yt-2',
      }),
    })

    const result = await useCase.execute({
      userId: USER_ID,
      platforms: ['youtube'],
      videoUrl: VIDEO_URL,
      youtubeOptions: youtubeOptions(),
    })

    expect(result.results[0]).toEqual({
      platform: 'youtube',
      success: true,
      processing: true,
      publishId: 'yt-2',
    })
    expect(result.results[0].externalPostId).toBeUndefined()
  })

  it('publie youtube + tiktok en parallèle', async () => {
    const { useCase, tiktok, youtube } = makeOrchestrator()

    const result = await useCase.execute({
      userId: USER_ID,
      platforms: ['tiktok', 'youtube'],
      videoUrl: VIDEO_URL,
      caption: 'Légende',
      youtubeOptions: youtubeOptions(),
    })

    expect(result.success).toBe(true)
    expect(tiktok.execute).toHaveBeenCalledTimes(1)
    expect(youtube.execute).toHaveBeenCalledTimes(1)
    expect(result.results.map((r) => r.platform)).toEqual(['tiktok', 'youtube'])
  })

  it('publie youtube + facebook', async () => {
    const { useCase, facebook } = makeOrchestrator()

    const result = await useCase.execute({
      userId: USER_ID,
      platforms: ['facebook', 'youtube'],
      message: 'Bonjour',
      videoUrl: VIDEO_URL,
      youtubeOptions: youtubeOptions(),
    })

    expect(result.success).toBe(true)
    expect(facebook.execute).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Bonjour' }),
    )
  })
})

describe('PublishSocialUseCase — isolation des échecs YouTube', () => {
  it('un échec YouTube n’empêche pas TikTok', async () => {
    const { useCase, tiktok } = makeOrchestrator({
      youtube: jest.fn().mockResolvedValue({
        success: false,
        error: {
          code: 503,
          reason: 'PUBLISHING_NOT_CONFIGURED',
          retryable: false,
          action: 'CONFIGURE_PUBLISHING',
        },
        message: 'publication désactivée',
      }),
    })

    const result = await useCase.execute({
      userId: USER_ID,
      platforms: ['tiktok', 'youtube'],
      videoUrl: VIDEO_URL,
      youtubeOptions: youtubeOptions(),
    })

    expect(tiktok.execute).toHaveBeenCalledTimes(1)
    expect(result.results[0]).toMatchObject({ platform: 'tiktok', success: true })
    expect(result.results[1]).toMatchObject({
      platform: 'youtube',
      success: false,
      reason: 'PUBLISHING_NOT_CONFIGURED',
      retryable: false,
    })
    // Un seul échec suffit à invalider le succès global.
    expect(result.success).toBe(false)
  })

  it('une exception YouTube n’interrompt pas les autres plateformes', async () => {
    const { useCase, facebook } = makeOrchestrator({
      youtube: jest.fn().mockRejectedValue(new Error('panne inattendue')),
    })

    const result = await useCase.execute({
      userId: USER_ID,
      platforms: ['facebook', 'youtube'],
      message: 'Bonjour',
      videoUrl: VIDEO_URL,
      youtubeOptions: youtubeOptions(),
    })

    expect(facebook.execute).toHaveBeenCalledTimes(1)
    expect(result.results[0].success).toBe(true)
    expect(result.results[1]).toMatchObject({
      platform: 'youtube',
      success: false,
      error: 'panne inattendue',
    })
  })
})

describe('PublishSocialUseCase — préconditions YouTube', () => {
  it.each([
    ['videoUrl absente', { videoUrl: undefined }, /vidéo/i],
    ['youtubeOptions absent', { youtubeOptions: undefined }, /youtubeOptions/],
    [
      'accountId vide',
      { youtubeOptions: youtubeOptions({ accountId: '  ' }) },
      /accountId/,
    ],
    [
      'titre absent',
      { youtubeOptions: youtubeOptions({ title: '' }) },
      /title/,
    ],
    [
      'madeForKids absent',
      { youtubeOptions: youtubeOptions({ madeForKids: undefined }) },
      /madeForKids/,
    ],
  ])(
    'isole %s en échec YouTube sans appeler le use case',
    async (_label, overrides, pattern) => {
      const { useCase, youtube, facebook } = makeOrchestrator()

      const result = await useCase.execute({
        userId: USER_ID,
        platforms: ['facebook', 'youtube'],
        message: 'Bonjour',
        videoUrl: VIDEO_URL,
        youtubeOptions: youtubeOptions(),
        ...(overrides as Partial<PublishSocialInput>),
      })

      expect(youtube.execute).not.toHaveBeenCalled()
      // Facebook n'est pas affecté.
      expect(facebook.execute).toHaveBeenCalledTimes(1)
      expect(result.results[0].success).toBe(true)
      expect(result.results[1].success).toBe(false)
      expect(result.results[1].error).toMatch(pattern)
      expect(result.success).toBe(false)
    },
  )
})

describe('PublishSocialUseCase — non-régression des autres réseaux', () => {
  it('ne transmet jamais youtubeOptions aux autres plateformes', async () => {
    const { useCase, facebook, tiktok, linkedin } = makeOrchestrator()

    await useCase.execute({
      userId: USER_ID,
      platforms: ['facebook', 'instagram', 'tiktok', 'linkedin'],
      message: 'Bonjour',
      caption: 'Légende',
      imageUrl: 'https://example.test/img.jpg',
      videoUrl: VIDEO_URL,
      youtubeOptions: youtubeOptions(),
    })

    for (const spy of [facebook, tiktok, linkedin]) {
      expect(JSON.stringify(spy.execute.mock.calls[0][0])).not.toContain(
        'madeForKids',
      )
    }
  })

  it('publie les 4 réseaux historiques sans YouTube', async () => {
    const { useCase, youtube } = makeOrchestrator()

    const result = await useCase.execute({
      userId: USER_ID,
      platforms: ['facebook', 'instagram', 'tiktok', 'linkedin'],
      message: 'Bonjour',
      caption: 'Légende',
      imageUrl: 'https://example.test/img.jpg',
      videoUrl: VIDEO_URL,
    })

    expect(result.success).toBe(true)
    expect(result.results).toHaveLength(4)
    expect(youtube.execute).not.toHaveBeenCalled()
  })
})
