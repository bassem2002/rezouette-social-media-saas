import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import { SocialPost } from '../../../domain/social-post/entities/social-post.entity.js'
import { YouTubeErrorReason } from '../../../domain/social/errors/youtube-error-reason.enum.js'
import {
  YouTubeTokenError,
  YouTubeTokenErrorCode,
} from '../errors/youtube-token.error.js'
import { YouTubeContentError } from '../errors/youtube-content.error.js'
import { YouTubeExceptionMapper } from '../services/youtube-exception-mapper.js'
import {
  PublishYouTubeUseCase,
  YOUTUBE_UPLOAD_SCOPE,
  type PublishYouTubeInput,
} from './publish-youtube.use-case.js'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const OTHER_USER = '00000000-0000-0000-0000-000000000002'

function account(overrides: {
  platform?: 'youtube' | 'tiktok'
  scopes?: string[]
} = {}): SocialAccount {
  return SocialAccount.create({
    userId: USER_ID,
    platform: overrides.platform ?? 'youtube',
    externalAccountId: 'UC_channel_1',
    accountName: 'Zernio Channel',
    accessToken: 'ancien-access-token',
    refreshToken: 'fake-refresh-token',
    tokenExpiresAt: new Date(Date.now() + 3_600_000),
    scopes: overrides.scopes ?? [YOUTUBE_UPLOAD_SCOPE],
    metadata: {},
  })
}

function input(
  target: SocialAccount,
  overrides: Partial<PublishYouTubeInput> = {},
): PublishYouTubeInput {
  return {
    userId: USER_ID,
    accountId: target.id,
    videoUrl: 'https://example.test/uploads/clip.mp4',
    title: 'Ma vidéo',
    madeForKids: false,
    ...overrides,
  }
}

function makeUseCase(
  accounts: SocialAccount[],
  options: {
    publishVideo?: jest.Mock
    ensureFresh?: jest.Mock
  } = {},
) {
  const savedPosts: SocialPost[] = []
  const socialAccounts = {
    findById: jest.fn(),
    findByUserId: jest
      .fn()
      .mockImplementation(async (userId: string) =>
        accounts.filter((a) => a.userId === userId),
      ),
    findByExternalAccount: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  }
  const socialPosts = {
    save: jest.fn().mockImplementation(async (post: SocialPost) => {
      savedPosts.push(post)
    }),
    findAll: jest.fn(),
    findById: jest.fn(),
    findByUserId: jest.fn(),
  }
  const content = {
    publishVideo:
      options.publishVideo ??
      jest.fn().mockResolvedValue({
        videoId: 'yt-video-1',
        processingState: 'succeeded',
      }),
  }
  const tokenService = {
    ensureFresh:
      options.ensureFresh ??
      jest.fn().mockImplementation(async () => {
        const fresh = accounts[0]
        fresh.updateTokens({
          accessToken: 'token-frais',
          refreshToken: null,
          tokenExpiresAt: new Date(Date.now() + 3_600_000),
        })
        return fresh
      }),
  }

  return {
    useCase: new PublishYouTubeUseCase(
      socialAccounts as never,
      content as never,
      socialPosts as never,
      tokenService as never,
      new YouTubeExceptionMapper(),
    ),
    socialAccounts,
    socialPosts,
    savedPosts,
    content,
    tokenService,
  }
}

/// Dernier état sauvegardé de l'historique (le repository fait un upsert sur id).
function lastPost(savedPosts: SocialPost[]): SocialPost {
  return savedPosts[savedPosts.length - 1]
}

describe('PublishYouTubeUseCase — validations de forme', () => {
  it.each([
    ['videoUrl absente', { videoUrl: '  ' }, YouTubeErrorReason.INVALID_VIDEO],
    ['titre vide', { title: '   ' }, YouTubeErrorReason.INVALID_TITLE],
    [
      'titre > 100',
      { title: 'x'.repeat(101) },
      YouTubeErrorReason.INVALID_TITLE,
    ],
    [
      'description > 5000',
      { description: 'x'.repeat(5001) },
      YouTubeErrorReason.INVALID_PARAMETER,
    ],
    [
      'visibilité invalide',
      { privacyStatus: 'secret' as never },
      YouTubeErrorReason.INVALID_PARAMETER,
    ],
    [
      'madeForKids non booléen',
      { madeForKids: 'oui' as never },
      YouTubeErrorReason.INVALID_PARAMETER,
    ],
    ['accountId vide', { accountId: '' }, YouTubeErrorReason.INVALID_PARAMETER],
  ])('rejette %s sans rien écrire', async (_label, overrides, reason) => {
    const target = account()
    const { useCase, socialPosts, content } = makeUseCase([target])

    const outcome = await useCase.execute(input(target, overrides))

    expect(outcome.success).toBe(false)
    if (!outcome.success) expect(outcome.error.reason).toBe(reason)
    expect(socialPosts.save).not.toHaveBeenCalled()
    expect(content.publishVideo).not.toHaveBeenCalled()
  })
})

describe('PublishYouTubeUseCase — résolution de la chaîne', () => {
  it('échoue si aucun compte ne correspond', async () => {
    const target = account()
    const { useCase, content } = makeUseCase([target])

    const outcome = await useCase.execute(
      input(target, { accountId: 'inconnu' }),
    )

    expect(outcome.success).toBe(false)
    if (!outcome.success) {
      expect(outcome.error.reason).toBe(YouTubeErrorReason.CHANNEL_NOT_FOUND)
    }
    expect(content.publishVideo).not.toHaveBeenCalled()
  })

  it("refuse le compte d'un autre utilisateur", async () => {
    const target = account()
    const { useCase } = makeUseCase([target])

    const outcome = await useCase.execute(
      input(target, { userId: OTHER_USER }),
    )

    expect(outcome.success).toBe(false)
    if (!outcome.success) {
      expect(outcome.error.reason).toBe(YouTubeErrorReason.CHANNEL_NOT_FOUND)
    }
  })

  it("refuse un compte d'une autre plateforme", async () => {
    const target = account({ platform: 'tiktok' })
    const { useCase } = makeUseCase([target])

    const outcome = await useCase.execute(input(target))

    expect(outcome.success).toBe(false)
    if (!outcome.success) {
      expect(outcome.error.reason).toBe(YouTubeErrorReason.CHANNEL_NOT_FOUND)
    }
  })
})

describe('PublishYouTubeUseCase — scope youtube.upload', () => {
  it('archive UPLOAD_SCOPE_MISSING sans appeler le gateway', async () => {
    const target = account({
      scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    })
    const { useCase, content, tokenService, savedPosts } = makeUseCase([target])

    const outcome = await useCase.execute(input(target))

    expect(outcome.success).toBe(false)
    if (!outcome.success) {
      expect(outcome.error.reason).toBe(YouTubeErrorReason.UPLOAD_SCOPE_MISSING)
      expect(outcome.error.action).toBe('RECONNECT_ACCOUNT')
    }
    expect(content.publishVideo).not.toHaveBeenCalled()
    expect(tokenService.ensureFresh).not.toHaveBeenCalled()
    // L'échec EST archivé.
    expect(lastPost(savedPosts).status).toBe('failed')
    expect(lastPost(savedPosts).platform).toBe('youtube')
    // …et la chaîne est marquée pour reconnexion.
    expect(target.needsReconnect).toBe(true)
  })

  it('accepte un compte dont les scopes ne sont pas connus (aucune présomption)', async () => {
    const target = account({ scopes: [] })
    const { useCase, content } = makeUseCase([target])

    const outcome = await useCase.execute(input(target))

    expect(outcome.success).toBe(true)
    expect(content.publishVideo).toHaveBeenCalled()
  })
})

describe('PublishYouTubeUseCase — token frais', () => {
  it('appelle ensureFresh et transmet le token ACTUALISÉ au gateway', async () => {
    const target = account()
    const { useCase, content, tokenService } = makeUseCase([target])

    await useCase.execute(input(target))

    expect(tokenService.ensureFresh).toHaveBeenCalledWith({
      userId: USER_ID,
      accountId: target.id,
    })
    expect(content.publishVideo.mock.calls[0][0].accessToken).toBe('token-frais')
  })

  it('archive et n’appelle jamais le gateway si le refresh échoue', async () => {
    const target = account()
    const { useCase, content, savedPosts } = makeUseCase([target], {
      ensureFresh: jest.fn().mockRejectedValue(
        new YouTubeTokenError(
          YouTubeTokenErrorCode.YOUTUBE_RECONNECT_REQUIRED,
          'autorisation révoquée',
        ),
      ),
    })

    const outcome = await useCase.execute(input(target))

    expect(outcome.success).toBe(false)
    if (!outcome.success) {
      expect(outcome.error.reason).toBe(YouTubeErrorReason.RECONNECT_REQUIRED)
    }
    expect(content.publishVideo).not.toHaveBeenCalled()
    expect(lastPost(savedPosts).status).toBe('failed')
    expect(target.needsReconnect).toBe(true)
  })
})

describe('PublishYouTubeUseCase — succès', () => {
  it('crée l’historique PENDING AVANT d’appeler le gateway', async () => {
    const target = account()
    const order: string[] = []
    const { useCase } = makeUseCase([target], {
      publishVideo: jest.fn().mockImplementation(async () => {
        order.push('gateway')
        return { videoId: 'yt-video-1', processingState: 'succeeded' }
      }),
    })
    const spy = jest.spyOn(SocialPost, 'createPending')

    await useCase.execute(input(target))
    order.push('fin')

    expect(spy).toHaveBeenCalled()
    expect(order[0]).toBe('gateway')
    spy.mockRestore()
  })

  it('processing → historique reste PENDING, publishId renseigné', async () => {
    const target = account()
    const { useCase, savedPosts } = makeUseCase([target], {
      publishVideo: jest
        .fn()
        .mockResolvedValue({ videoId: 'yt-video-1', processingState: 'processing' }),
    })

    const outcome = await useCase.execute(input(target))

    expect(outcome).toEqual({
      success: true,
      processing: true,
      externalPostId: null,
      publishId: 'yt-video-1',
    })
    const post = lastPost(savedPosts)
    expect(post.status).toBe('pending')
    expect(post.publishId).toBe('yt-video-1')
    expect(post.externalPostId).toBeNull()
    expect(post.publishedAt).toBeNull()
  })

  it('succeeded → PUBLISHED avec externalPostId', async () => {
    const target = account()
    const { useCase, savedPosts } = makeUseCase([target])

    const outcome = await useCase.execute(input(target))

    expect(outcome).toEqual({
      success: true,
      processing: false,
      externalPostId: 'yt-video-1',
      publishId: 'yt-video-1',
    })
    const post = lastPost(savedPosts)
    expect(post.status).toBe('published')
    expect(post.externalPostId).toBe('yt-video-1')
    expect(post.publishId).toBe('yt-video-1')
    expect(post.publishedAt).toBeInstanceOf(Date)
  })

  it('archive le titre et l’URL de la vidéo', async () => {
    const target = account()
    const { useCase, savedPosts } = makeUseCase([target])

    await useCase.execute(input(target))

    const post = lastPost(savedPosts)
    expect(post.caption).toBe('Ma vidéo')
    expect(post.mediaUrl).toBe('https://example.test/uploads/clip.mp4')
    expect(post.accountId).toBe(target.id)
  })

  it('nettoie et dédoublonne les tags, applique les défauts', async () => {
    const target = account()
    const { useCase, content } = makeUseCase([target])

    await useCase.execute(
      input(target, { tags: ['  a ', 'b', 'a', '', '   ', 'b'] }),
    )

    const payload = content.publishVideo.mock.calls[0][0]
    expect(payload.tags).toEqual(['a', 'b'])
    expect(payload.privacyStatus).toBe('private')
    expect(payload.channelId).toBe('UC_channel_1')
  })

  it('omet les tags quand la liste nettoyée est vide', async () => {
    const target = account()
    const { useCase, content } = makeUseCase([target])

    await useCase.execute(input(target, { tags: ['  ', ''] }))

    expect(content.publishVideo.mock.calls[0][0].tags).toBeUndefined()
  })

  it('transmet les options facultatives quand elles sont fournies', async () => {
    const target = account()
    const { useCase, content } = makeUseCase([target])

    await useCase.execute(
      input(target, {
        description: 'Une description',
        categoryId: '22',
        privacyStatus: 'unlisted',
        containsSyntheticMedia: true,
        notifySubscribers: false,
      }),
    )

    expect(content.publishVideo.mock.calls[0][0]).toMatchObject({
      description: 'Une description',
      categoryId: '22',
      privacyStatus: 'unlisted',
      containsSyntheticMedia: true,
      notifySubscribers: false,
      madeForKids: false,
    })
  })
})

describe('PublishYouTubeUseCase — échecs de publication', () => {
  it('adaptateur désactivé → FAILED / PUBLISHING_NOT_CONFIGURED', async () => {
    const target = account()
    const { useCase, savedPosts } = makeUseCase([target], {
      publishVideo: jest.fn().mockRejectedValue(
        new YouTubeContentError({
          serviceErrorCode: 'publishing_not_configured',
          httpStatus: 503,
          message: 'publication désactivée',
        }),
      ),
    })

    const outcome = await useCase.execute(input(target))

    expect(outcome.success).toBe(false)
    if (!outcome.success) {
      expect(outcome.error.reason).toBe(
        YouTubeErrorReason.PUBLISHING_NOT_CONFIGURED,
      )
      expect(outcome.error.retryable).toBe(false)
    }
    const post = lastPost(savedPosts)
    expect(post.status).toBe('failed')
    expect(post.metaReason).toBe(YouTubeErrorReason.PUBLISHING_NOT_CONFIGURED)
    // Une publication non configurée n'est PAS un problème de compte.
    expect(target.needsReconnect).toBe(false)
  })

  it('erreur inconnue → FAILED / UNKNOWN_YOUTUBE_ERROR', async () => {
    const target = account()
    const { useCase, savedPosts } = makeUseCase([target], {
      publishVideo: jest.fn().mockRejectedValue(new Error('surprise')),
    })

    const outcome = await useCase.execute(input(target))

    expect(outcome.success).toBe(false)
    expect(lastPost(savedPosts).metaReason).toBe(
      YouTubeErrorReason.UNKNOWN_YOUTUBE_ERROR,
    )
  })

  it('quota dépassé → FAILED retryable', async () => {
    const target = account()
    const { useCase, savedPosts } = makeUseCase([target], {
      publishVideo: jest.fn().mockRejectedValue({
        response: {
          status: 403,
          data: {
            error: {
              code: 403,
              message: 'quota',
              errors: [{ reason: 'quotaExceeded' }],
            },
          },
        },
      }),
    })

    const outcome = await useCase.execute(input(target))

    expect(outcome.success).toBe(false)
    if (!outcome.success) expect(outcome.error.retryable).toBe(true)
    expect(lastPost(savedPosts).retryable).toBe(true)
  })
})

describe('PublishYouTubeUseCase — hygiène des secrets', () => {
  it("n'expose aucun token dans le résultat ni dans l'historique", async () => {
    const target = account()
    const { useCase, savedPosts } = makeUseCase([target], {
      publishVideo: jest.fn().mockRejectedValue(new Error('échec générique')),
    })

    const outcome = await useCase.execute(input(target))

    const post = lastPost(savedPosts)
    const dump = `${JSON.stringify(outcome)} ${post.caption} ${post.mediaUrl} ${post.errorMessage}`
    expect(dump).not.toContain('token-frais')
    expect(dump).not.toContain('ancien-access-token')
    expect(dump).not.toContain('fake-refresh-token')
  })
})
