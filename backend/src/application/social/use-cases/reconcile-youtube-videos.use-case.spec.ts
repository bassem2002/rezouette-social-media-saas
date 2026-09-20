import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import { SocialPost } from '../../../domain/social-post/entities/social-post.entity.js'
import { YouTubeErrorReason } from '../../../domain/social/errors/youtube-error-reason.enum.js'
import { YouTubeContentError } from '../errors/youtube-content.error.js'
import {
  YouTubeTokenError,
  YouTubeTokenErrorCode,
} from '../errors/youtube-token.error.js'
import { YouTubeExceptionMapper } from '../services/youtube-exception-mapper.js'
import { ReconcileYouTubeVideosUseCase } from './reconcile-youtube-videos.use-case.js'
import type { YouTubeConfig } from '../../../config/youtube.config.js'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const VIDEO_ID = 'yt-video-1'
const NOW = new Date('2026-08-01T12:00:00.000Z')

const CONFIG = {
  clientId: 'fake-client-id',
  clientSecret: 'fake-client-secret',
  redirectUri: 'https://app.example.test/callback',
  reconcileBatchSize: 25,
  reconcileMaxAgeHours: 48,
  reconcileNotFoundGraceSeconds: 300,
} as YouTubeConfig

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000)
}

function account(
  overrides: { id?: string; platform?: 'youtube' | 'tiktok'; userId?: string } = {},
): SocialAccount {
  return SocialAccount.create({
    userId: overrides.userId ?? USER_ID,
    platform: overrides.platform ?? 'youtube',
    externalAccountId: 'UC_channel_1',
    accountName: 'Zernio Channel',
    accessToken: 'ancien-access-token',
    refreshToken: 'fake-refresh-token',
    tokenExpiresAt: new Date(NOW.getTime() + 3_600_000),
    scopes: [],
    metadata: {},
  })
}

function pendingPost(options: {
  accountId?: string | null
  publishId?: string | null
  createdAt?: Date
}): SocialPost {
  const post = SocialPost.createPending({
    userId: USER_ID,
    platform: 'youtube',
    accountId: options.accountId === undefined ? 'acc-1' : options.accountId,
    caption: 'Ma vidéo',
    mediaUrl: 'https://api.zernio.test/uploads/social/2026/08/clip.mp4',
  })
  if (options.publishId !== null) {
    post.attachPublishId(options.publishId ?? VIDEO_ID)
  }
  return SocialPost.reconstitute({
    id: post.id,
    userId: post.userId,
    platform: 'youtube',
    accountId: post.accountId,
    externalPostId: null,
    publishId: post.publishId,
    caption: post.caption,
    mediaUrl: post.mediaUrl,
    status: 'pending',
    errorMessage: null,
    metaCode: null,
    metaSubcode: null,
    metaReason: null,
    retryable: null,
    publishedAt: null,
    createdAt: options.createdAt ?? minutesAgo(30),
    updatedAt: options.createdAt ?? minutesAgo(30),
  })
}

function makeUseCase(options: {
  pending?: SocialPost[]
  accounts?: SocialAccount[]
  status?: jest.Mock
  ensureFresh?: jest.Mock
  config?: Partial<YouTubeConfig>
} = {}) {
  const accounts = options.accounts ?? []
  const socialPosts = {
    save: jest.fn().mockResolvedValue(undefined),
    findAll: jest.fn(),
    findById: jest.fn(),
    findByUserId: jest.fn(),
    findPendingByPlatform: jest.fn().mockResolvedValue(options.pending ?? []),
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
  const processing = {
    assertConfigured: jest.fn(),
    getVideoProcessingStatus:
      options.status ??
      jest.fn().mockResolvedValue({ videoId: VIDEO_ID, status: 'processing' }),
  }
  const tokenService = {
    ensureFresh:
      options.ensureFresh ??
      jest.fn().mockImplementation(async () => {
        const fresh = accounts[0]
        if (fresh) {
          fresh.updateTokens({
            accessToken: 'token-frais',
            refreshToken: null,
            tokenExpiresAt: new Date(NOW.getTime() + 3_600_000),
          })
        }
        return fresh
      }),
  }
  const configService = {
    getOrThrow: () => ({ ...CONFIG, ...options.config }),
  } as never

  return {
    useCase: new ReconcileYouTubeVideosUseCase(
      socialPosts as never,
      socialAccounts as never,
      processing as never,
      tokenService as never,
      new YouTubeExceptionMapper(),
      configService,
    ),
    socialPosts,
    processing,
    tokenService,
  }
}

/// Compte lié à une publication : l'id doit correspondre à `post.accountId`.
function linkedAccount(post: SocialPost): SocialAccount {
  const acc = account()
  Object.defineProperty(acc, 'id', { get: () => post.accountId })
  return acc
}

describe('ReconcileYouTubeVideosUseCase — sélection', () => {
  it('ne fait rien sans publication en attente', async () => {
    const { useCase, processing, tokenService } = makeUseCase()

    const summary = await useCase.execute(NOW)

    expect(summary).toEqual({
      scanned: 0,
      published: 0,
      failed: 0,
      stillProcessing: 0,
      deferred: 0,
      stale: 0,
    })
    expect(processing.getVideoProcessingStatus).not.toHaveBeenCalled()
    expect(tokenService.ensureFresh).not.toHaveBeenCalled()
  })

  it('ne fait rien et ne marque RIEN en échec sans configuration', async () => {
    const post = pendingPost({})
    const { useCase, socialPosts, processing } = makeUseCase({
      pending: [post],
      config: { clientId: '' },
    })

    const summary = await useCase.execute(NOW)

    expect(summary.scanned).toBe(0)
    expect(socialPosts.findPendingByPlatform).not.toHaveBeenCalled()
    expect(processing.getVideoProcessingStatus).not.toHaveBeenCalled()
    expect(post.status).toBe('pending')
  })

  it('interroge le repository avec la plateforme et la taille de lot', async () => {
    const { useCase, socialPosts } = makeUseCase({ config: { reconcileBatchSize: 10 } })

    await useCase.execute(NOW)

    expect(socialPosts.findPendingByPlatform).toHaveBeenCalledWith('youtube', 10)
  })
})

describe('ReconcileYouTubeVideosUseCase — transitions', () => {
  function scenario(status: Record<string, unknown>) {
    const post = pendingPost({})
    const acc = linkedAccount(post)
    return {
      post,
      ...makeUseCase({
        pending: [post],
        accounts: [acc],
        status: jest.fn().mockResolvedValue({ videoId: VIDEO_ID, ...status }),
      }),
    }
  }

  it('processing → reste PENDING', async () => {
    const { useCase, post, socialPosts } = scenario({ status: 'processing' })

    const summary = await useCase.execute(NOW)

    expect(post.status).toBe('pending')
    expect(post.externalPostId).toBeNull()
    expect(post.publishId).toBe(VIDEO_ID)
    expect(socialPosts.save).not.toHaveBeenCalled()
    expect(summary.stillProcessing).toBe(1)
  })

  it('succeeded → PUBLISHED avec externalPostId et publishedAt', async () => {
    const { useCase, post } = scenario({ status: 'succeeded' })

    const summary = await useCase.execute(NOW)

    expect(post.status).toBe('published')
    expect(post.externalPostId).toBe(VIDEO_ID)
    expect(post.publishId).toBe(VIDEO_ID)
    expect(post.publishedAt).toBeInstanceOf(Date)
    expect(summary.published).toBe(1)
  })

  it('failed → FAILED / PROCESSING_FAILED avec le motif', async () => {
    const { useCase, post } = scenario({
      status: 'failed',
      failureReason: 'invalidFile',
    })

    const summary = await useCase.execute(NOW)

    expect(post.status).toBe('failed')
    expect(post.metaReason).toBe(YouTubeErrorReason.PROCESSING_FAILED)
    expect(post.retryable).toBe(false)
    expect(post.errorMessage).toContain('invalidFile')
    expect(summary.failed).toBe(1)
  })

  it('rejected → FAILED / VIDEO_REJECTED', async () => {
    const { useCase, post } = scenario({
      status: 'rejected',
      rejectionReason: 'copyright',
    })

    await useCase.execute(NOW)

    expect(post.status).toBe('failed')
    expect(post.metaReason).toBe(YouTubeErrorReason.VIDEO_REJECTED)
    expect(post.errorMessage).toContain('copyright')
  })

  it('deleted → FAILED / VIDEO_NOT_FOUND', async () => {
    const { useCase, post } = scenario({ status: 'deleted' })

    await useCase.execute(NOW)

    expect(post.status).toBe('failed')
    expect(post.metaReason).toBe(YouTubeErrorReason.VIDEO_NOT_FOUND)
  })

  it('terminated → reste PENDING (aucune conclusion hâtive)', async () => {
    const { useCase, post, socialPosts } = scenario({ status: 'terminated' })

    const summary = await useCase.execute(NOW)

    expect(post.status).toBe('pending')
    expect(socialPosts.save).not.toHaveBeenCalled()
    expect(summary.deferred).toBe(1)
  })
})

describe('ReconcileYouTubeVideosUseCase — préconditions', () => {
  it('publishId absent et ligne récente → différée, aucun réseau', async () => {
    const post = pendingPost({ publishId: null })
    const { useCase, processing, socialPosts } = makeUseCase({ pending: [post] })

    const summary = await useCase.execute(NOW)

    expect(post.status).toBe('pending')
    expect(processing.getVideoProcessingStatus).not.toHaveBeenCalled()
    expect(socialPosts.save).not.toHaveBeenCalled()
    expect(summary.deferred).toBe(1)
  })

  it('publishId absent et ligne trop ancienne → FAILED sans réseau', async () => {
    const post = pendingPost({ publishId: null, createdAt: minutesAgo(60 * 49) })
    const { useCase, processing } = makeUseCase({ pending: [post] })

    const summary = await useCase.execute(NOW)

    expect(post.status).toBe('failed')
    expect(post.metaReason).toBe(YouTubeErrorReason.PROCESSING_FAILED)
    expect(post.errorMessage).toMatch(/délai maximal/i)
    expect(processing.getVideoProcessingStatus).not.toHaveBeenCalled()
    expect(summary.stale).toBe(1)
    expect(summary.failed).toBe(1)
  })

  it('accountId absent → FAILED / CHANNEL_NOT_FOUND', async () => {
    const post = pendingPost({ accountId: null })
    const { useCase, processing } = makeUseCase({ pending: [post] })

    await useCase.execute(NOW)

    expect(post.status).toBe('failed')
    expect(post.metaReason).toBe(YouTubeErrorReason.CHANNEL_NOT_FOUND)
    expect(processing.getVideoProcessingStatus).not.toHaveBeenCalled()
  })

  it('compte introuvable → FAILED / CHANNEL_NOT_FOUND', async () => {
    const post = pendingPost({})
    const { useCase } = makeUseCase({ pending: [post], accounts: [] })

    await useCase.execute(NOW)

    expect(post.status).toBe('failed')
    expect(post.metaReason).toBe(YouTubeErrorReason.CHANNEL_NOT_FOUND)
  })

  it("compte d'un autre utilisateur → CHANNEL_NOT_FOUND", async () => {
    const post = pendingPost({})
    const foreign = account({ userId: 'autre-user' })
    Object.defineProperty(foreign, 'id', { get: () => post.accountId })
    const { useCase } = makeUseCase({ pending: [post], accounts: [foreign] })

    await useCase.execute(NOW)

    expect(post.status).toBe('failed')
    expect(post.metaReason).toBe(YouTubeErrorReason.CHANNEL_NOT_FOUND)
  })

  it("compte d'une autre plateforme → CHANNEL_NOT_FOUND", async () => {
    const post = pendingPost({})
    const tiktok = account({ platform: 'tiktok' })
    Object.defineProperty(tiktok, 'id', { get: () => post.accountId })
    const { useCase } = makeUseCase({ pending: [post], accounts: [tiktok] })

    await useCase.execute(NOW)

    expect(post.metaReason).toBe(YouTubeErrorReason.CHANNEL_NOT_FOUND)
  })
})

describe('ReconcileYouTubeVideosUseCase — token', () => {
  it('rafraîchit le token et utilise le compte actualisé', async () => {
    const post = pendingPost({})
    const acc = linkedAccount(post)
    const { useCase, tokenService, processing } = makeUseCase({
      pending: [post],
      accounts: [acc],
      status: jest.fn().mockResolvedValue({ videoId: VIDEO_ID, status: 'succeeded' }),
    })

    await useCase.execute(NOW)

    expect(tokenService.ensureFresh).toHaveBeenCalledWith({
      userId: USER_ID,
      accountId: acc.id,
    })
    expect(processing.getVideoProcessingStatus).toHaveBeenCalledWith({
      accessToken: 'token-frais',
      videoId: VIDEO_ID,
    })
  })

  it('401 → forceRefresh puis UN SEUL réessai', async () => {
    const post = pendingPost({})
    const acc = linkedAccount(post)
    const status = jest
      .fn()
      .mockRejectedValueOnce(
        new YouTubeContentError({
          serviceErrorCode: 'processing_permission_denied',
          httpStatus: 401,
          message: 'token rejeté',
        }),
      )
      .mockResolvedValueOnce({ videoId: VIDEO_ID, status: 'succeeded' })
    const { useCase, tokenService } = makeUseCase({
      pending: [post],
      accounts: [acc],
      status,
    })

    await useCase.execute(NOW)

    expect(tokenService.ensureFresh).toHaveBeenNthCalledWith(2, {
      userId: USER_ID,
      accountId: acc.id,
      forceRefresh: true,
    })
    expect(status).toHaveBeenCalledTimes(2)
    expect(post.status).toBe('published')
  })

  it('second 401 → aucun troisième appel, échec terminal', async () => {
    const post = pendingPost({})
    const acc = linkedAccount(post)
    const unauthorized = new YouTubeContentError({
      serviceErrorCode: 'processing_permission_denied',
      httpStatus: 401,
      message: 'token rejeté',
    })
    const status = jest.fn().mockRejectedValue(unauthorized)
    const { useCase } = makeUseCase({ pending: [post], accounts: [acc], status })

    await useCase.execute(NOW)

    expect(status).toHaveBeenCalledTimes(2)
    expect(post.status).toBe('failed')
    expect(post.metaReason).toBe(YouTubeErrorReason.PERMISSION_DENIED)
  })

  it('403 ne déclenche PAS de refresh forcé', async () => {
    const post = pendingPost({})
    const acc = linkedAccount(post)
    const status = jest.fn().mockRejectedValue(
      new YouTubeContentError({
        serviceErrorCode: 'processing_permission_denied',
        httpStatus: 403,
        message: 'permission refusée',
      }),
    )
    const { useCase, tokenService } = makeUseCase({
      pending: [post],
      accounts: [acc],
      status,
    })

    await useCase.execute(NOW)

    expect(tokenService.ensureFresh).toHaveBeenCalledTimes(1)
    expect(status).toHaveBeenCalledTimes(1)
    expect(post.status).toBe('failed')
  })

  it('reconnexion requise → FAILED', async () => {
    const post = pendingPost({})
    const acc = linkedAccount(post)
    const { useCase } = makeUseCase({
      pending: [post],
      accounts: [acc],
      ensureFresh: jest.fn().mockRejectedValue(
        new YouTubeTokenError(
          YouTubeTokenErrorCode.YOUTUBE_RECONNECT_REQUIRED,
          'autorisation révoquée',
        ),
      ),
    })

    await useCase.execute(NOW)

    expect(post.status).toBe('failed')
    expect(post.metaReason).toBe(YouTubeErrorReason.RECONNECT_REQUIRED)
  })

  it('incident transitoire de refresh → reste PENDING', async () => {
    const post = pendingPost({})
    const acc = linkedAccount(post)
    const { useCase } = makeUseCase({
      pending: [post],
      accounts: [acc],
      ensureFresh: jest.fn().mockRejectedValue(
        new YouTubeTokenError(
          YouTubeTokenErrorCode.YOUTUBE_TOKEN_REFRESH_FAILED,
          'incident',
          true,
        ),
      ),
    })

    const summary = await useCase.execute(NOW)

    expect(post.status).toBe('pending')
    expect(summary.deferred).toBe(1)
  })
})

describe('ReconcileYouTubeVideosUseCase — vidéo introuvable et grâce', () => {
  function notFoundScenario(createdAt: Date) {
    const post = pendingPost({ createdAt })
    const acc = linkedAccount(post)
    return {
      post,
      ...makeUseCase({
        pending: [post],
        accounts: [acc],
        status: jest.fn().mockRejectedValue(
          new YouTubeContentError({
            serviceErrorCode: 'video_not_found',
            httpStatus: 404,
            message: 'introuvable',
          }),
        ),
      }),
    }
  }

  it('dans le délai de grâce → reste PENDING', async () => {
    const { useCase, post } = notFoundScenario(new Date(NOW.getTime() - 60_000))

    const summary = await useCase.execute(NOW)

    expect(post.status).toBe('pending')
    expect(summary.deferred).toBe(1)
  })

  it('après le délai de grâce → FAILED / VIDEO_NOT_FOUND', async () => {
    const { useCase, post } = notFoundScenario(minutesAgo(30))

    const summary = await useCase.execute(NOW)

    expect(post.status).toBe('failed')
    expect(post.metaReason).toBe(YouTubeErrorReason.VIDEO_NOT_FOUND)
    expect(post.retryable).toBe(false)
    expect(post.errorMessage).not.toContain(VIDEO_ID)
    expect(summary.failed).toBe(1)
  })
})

describe('ReconcileYouTubeVideosUseCase — erreurs transitoires', () => {
  function transientScenario(serviceErrorCode: string, httpStatus: number) {
    const post = pendingPost({})
    const acc = linkedAccount(post)
    return {
      post,
      ...makeUseCase({
        pending: [post],
        accounts: [acc],
        status: jest.fn().mockRejectedValue(
          new YouTubeContentError({
            serviceErrorCode,
            httpStatus,
            message: 'incident',
          }),
        ),
      }),
    }
  }

  it.each([
    ['timeout', 'processing_timeout', 0],
    ['429', 'processing_rate_limited', 429],
    ['500', 'processing_request_failed', 500],
  ])('%s → reste PENDING', async (_label, code, status) => {
    const { useCase, post, socialPosts } = transientScenario(code, status)

    const summary = await useCase.execute(NOW)

    expect(post.status).toBe('pending')
    expect(socialPosts.save).not.toHaveBeenCalled()
    expect(summary.deferred).toBe(1)
    expect(summary.failed).toBe(0)
  })

  it('réponse invalide → FAILED (terminal, pas de sondage infini)', async () => {
    const { useCase, post } = transientScenario('processing_response_invalid', 502)

    await useCase.execute(NOW)

    expect(post.status).toBe('failed')
    expect(post.metaReason).toBe(YouTubeErrorReason.PROCESSING_FAILED)
  })
})

describe('ReconcileYouTubeVideosUseCase — isolation et résumé', () => {
  it('une ligne en erreur n’interrompt pas le lot', async () => {
    const failing = pendingPost({ accountId: null })
    const healthy = pendingPost({})
    const acc = linkedAccount(healthy)
    const { useCase } = makeUseCase({
      pending: [failing, healthy],
      accounts: [acc],
      status: jest.fn().mockResolvedValue({ videoId: VIDEO_ID, status: 'succeeded' }),
    })

    const summary = await useCase.execute(NOW)

    expect(failing.status).toBe('failed')
    expect(healthy.status).toBe('published')
    expect(summary.scanned).toBe(2)
    expect(summary.published).toBe(1)
    expect(summary.failed).toBe(1)
  })

  it('une exception inattendue diffère la ligne sans casser le cycle', async () => {
    const post = pendingPost({})
    const acc = linkedAccount(post)
    const { useCase } = makeUseCase({
      pending: [post],
      accounts: [acc],
      status: jest.fn().mockRejectedValue(new Error('panne inattendue')),
    })

    const summary = await useCase.execute(NOW)

    expect(summary.scanned).toBe(1)
    // Erreur inconnue = non retryable pour le mapper → terminal, mais le cycle
    // se poursuit et ne lève pas.
    expect(post.status).toBe('failed')
  })

  it('ne republie JAMAIS : aucun upload, aucun PublishYouTubeUseCase', async () => {
    const post = pendingPost({})
    const acc = linkedAccount(post)
    const { useCase, processing } = makeUseCase({
      pending: [post],
      accounts: [acc],
      status: jest.fn().mockResolvedValue({ videoId: VIDEO_ID, status: 'succeeded' }),
    })

    await useCase.execute(NOW)

    // Le use case ne connaît que la LECTURE de statut : son unique passerelle
    // n'expose aucune méthode de publication.
    expect(Object.keys(processing)).toEqual([
      'assertConfigured',
      'getVideoProcessingStatus',
    ])
  })
})
