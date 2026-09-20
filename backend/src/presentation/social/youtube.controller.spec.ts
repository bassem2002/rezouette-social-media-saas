import { ServiceUnavailableException } from '@nestjs/common'
import { YouTubeController } from './youtube.controller.js'
import { GetYouTubeAccountsUseCase } from '../../application/social/use-cases/get-youtube-accounts.use-case.js'
import { GetYouTubeTokenStatusUseCase } from '../../application/social/use-cases/get-youtube-token-status.use-case.js'
import { YouTubeTokenService } from '../../application/social/services/youtube-token.service.js'
import { YOUTUBE_CREDENTIAL_GROUP_KEY } from '../../application/social/services/youtube-credential-group.js'
import { SocialAccount } from '../../domain/social-account/entities/social-account.entity.js'
import type { SocialAccountRepository } from '../../domain/social-account/repositories/social-account.repository.js'
import { TokenStatus } from '../../domain/social/token-status.enum.js'
import type { YouTubeConfig } from '../../config/youtube.config.js'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const SKEW_SECONDS = 600

const EMPTY_YOUTUBE = {
  clientId: '',
  clientSecret: '',
  redirectUri: '',
  publishingEnabled: false,
  tokenRefreshSkewSeconds: SKEW_SECONDS,
} as YouTubeConfig

/// Configuré, mais publication DÉSACTIVÉE (défaut sûr).
const FULL_YOUTUBE = {
  ...EMPTY_YOUTUBE,
  clientId: 'fake-client-id',
  clientSecret: 'fake-client-secret',
  redirectUri: 'https://app.example.test/callback',
} as YouTubeConfig

/// Configuré ET publication activée par feature flag.
const PUBLISHING_YOUTUBE = {
  ...FULL_YOUTUBE,
  publishingEnabled: true,
} as YouTubeConfig

function youtubeAccount(overrides: {
  channelId?: string
  expiresIn?: number | null
  refreshToken?: string | null
  platform?: 'youtube' | 'facebook'
}): SocialAccount {
  const expiresIn = overrides.expiresIn === undefined ? 3600 : overrides.expiresIn
  return SocialAccount.create({
    userId: USER_ID,
    platform: overrides.platform ?? 'youtube',
    externalAccountId: overrides.channelId ?? 'UC_channel_1',
    accountName: 'Zernio Channel',
    accessToken: 'fake-access-token',
    refreshToken:
      overrides.refreshToken === undefined
        ? 'fake-refresh-token'
        : overrides.refreshToken,
    tokenExpiresAt: expiresIn === null ? null : new Date(Date.now() + expiresIn * 1000),
    scopes: ['https://www.googleapis.com/auth/youtube.upload'],
    metadata: {
      thumbnailUrl: 'https://img.test/high.jpg',
      uploadsPlaylistId: 'UU_uploads_1',
      [YOUTUBE_CREDENTIAL_GROUP_KEY]: 'group-secret-interne',
    },
  })
}

function makeController(
  accounts: SocialAccount[],
  youtube: YouTubeConfig = FULL_YOUTUBE,
) {
  const repository: SocialAccountRepository = {
    findById: jest.fn(),
    findByUserId: jest.fn().mockResolvedValue(accounts),
    findByExternalAccount: jest.fn(),
    save: jest.fn(),
  }
  const gateway = { assertConfigured: jest.fn(), refreshAccessToken: jest.fn() }
  const config = { getOrThrow: () => youtube } as never
  const tokenService = new YouTubeTokenService(repository, gateway, config)
  const publishYouTube = {
    execute: jest.fn().mockResolvedValue({
      success: true,
      processing: true,
      externalPostId: null,
      publishId: 'yt-video-1',
    }),
  }

  return {
    controller: new YouTubeController(
      config,
      new GetYouTubeAccountsUseCase(repository),
      new GetYouTubeTokenStatusUseCase(repository, tokenService),
      publishYouTube as never,
    ),
    repository,
    gateway,
    publishYouTube,
  }
}

const PUBLISH_BODY = {
  userId: USER_ID,
  accountId: '11111111-1111-1111-1111-111111111111',
  videoUrl: 'https://example.test/uploads/clip.mp4',
  title: 'Ma vidéo',
  madeForKids: false,
} as never

describe('YouTubeController — GET /social/youtube/accounts', () => {
  it('renvoie une liste vide quand aucune chaîne n’est connectée', async () => {
    const { controller } = makeController([])

    await expect(controller.accounts(USER_ID)).resolves.toEqual([])
  })

  it('renvoie une chaîne connectée', async () => {
    const account = youtubeAccount({})
    const { controller } = makeController([account])

    const [view] = await controller.accounts(USER_ID)

    expect(view.id).toBe(account.id)
    expect(view.externalAccountId).toBe('UC_channel_1')
    expect(view.accountName).toBe('Zernio Channel')
    expect(view.platform).toBe('youtube')
    expect(view.status).toBe('ACTIVE')
    expect(view.needsReconnect).toBe(false)
    expect(view.scopes).toEqual([
      'https://www.googleapis.com/auth/youtube.upload',
    ])
  })

  it('renvoie plusieurs chaînes', async () => {
    const { controller } = makeController([
      youtubeAccount({ channelId: 'UC_1' }),
      youtubeAccount({ channelId: 'UC_2' }),
    ])

    const views = await controller.accounts(USER_ID)

    expect(views.map((v) => v.externalAccountId)).toEqual(['UC_1', 'UC_2'])
  })

  it('exclut les comptes des autres plateformes', async () => {
    const { controller } = makeController([
      youtubeAccount({ channelId: 'UC_1' }),
      youtubeAccount({ channelId: 'page-fb', platform: 'facebook' }),
    ])

    const views = await controller.accounts(USER_ID)

    expect(views).toHaveLength(1)
    expect(views[0].platform).toBe('youtube')
  })

  it('n’expose AUCUN token ni l’identifiant de groupe', async () => {
    const { controller } = makeController([youtubeAccount({})])

    const views = await controller.accounts(USER_ID)

    const dump = JSON.stringify(views)
    expect(dump).not.toContain('fake-access-token')
    expect(dump).not.toContain('fake-refresh-token')
    expect(dump).not.toContain('group-secret-interne')
    expect(dump).not.toContain(YOUTUBE_CREDENTIAL_GROUP_KEY)
    // Les métadonnées utiles restent exposées.
    expect(views[0].metadata).toEqual({
      thumbnailUrl: 'https://img.test/high.jpg',
      uploadsPlaylistId: 'UU_uploads_1',
    })
  })

  it('lève 503 quand YouTube n’est pas configuré', async () => {
    const { controller, repository } = makeController([], EMPTY_YOUTUBE)

    await expect(controller.accounts(USER_ID)).rejects.toThrow(
      ServiceUnavailableException,
    )
    expect(repository.findByUserId).not.toHaveBeenCalled()
  })

  it('n’effectue aucun appel réseau', async () => {
    const { controller, gateway } = makeController([youtubeAccount({})])

    await controller.accounts(USER_ID)

    expect(gateway.refreshAccessToken).not.toHaveBeenCalled()
  })
})

describe('YouTubeController — GET /social/youtube/token-status', () => {
  it('renvoie une liste vide quand aucune chaîne n’est connectée', async () => {
    const { controller } = makeController([])

    await expect(controller.tokenStatus(USER_ID)).resolves.toEqual({
      accounts: [],
    })
  })

  it('renvoie le statut de plusieurs chaînes', async () => {
    const { controller } = makeController([
      youtubeAccount({ channelId: 'UC_1', expiresIn: 3600 }),
      youtubeAccount({ channelId: 'UC_2', expiresIn: SKEW_SECONDS - 60 }),
    ])

    const { accounts } = await controller.tokenStatus(USER_ID)

    expect(accounts).toHaveLength(2)
    expect(accounts[0].status).toBe(TokenStatus.VALID)
    expect(accounts[1].status).toBe(TokenStatus.EXPIRING_SOON)
    expect(accounts[0].channelId).toBe('UC_1')
  })

  it('signale EXPIRED et RECONNECT_REQUIRED', async () => {
    const expired = youtubeAccount({ channelId: 'UC_1', expiresIn: -60 })
    const sansRefresh = youtubeAccount({
      channelId: 'UC_2',
      refreshToken: null,
    })
    const { controller } = makeController([expired, sansRefresh])

    const { accounts } = await controller.tokenStatus(USER_ID)

    expect(accounts[0].status).toBe(TokenStatus.EXPIRED)
    expect(accounts[1].status).toBe(TokenStatus.RECONNECT_REQUIRED)
    expect(accounts[1].hasRefreshToken).toBe(false)
    expect(accounts[0].hasRefreshToken).toBe(true)
  })

  it('sérialise expiresAt en ISO et accepte null', async () => {
    const { controller } = makeController([
      youtubeAccount({ channelId: 'UC_1' }),
      youtubeAccount({ channelId: 'UC_2', expiresIn: null }),
    ])

    const { accounts } = await controller.tokenStatus(USER_ID)

    expect(accounts[0].expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(accounts[1].expiresAt).toBeNull()
  })

  it('n’expose aucun token', async () => {
    const { controller } = makeController([youtubeAccount({})])

    const dump = JSON.stringify(await controller.tokenStatus(USER_ID))

    expect(dump).not.toContain('fake-access-token')
    expect(dump).not.toContain('fake-refresh-token')
    expect(dump).not.toContain('group-secret-interne')
  })

  it('lève 503 quand YouTube n’est pas configuré', async () => {
    const { controller, repository } = makeController([], EMPTY_YOUTUBE)

    await expect(controller.tokenStatus(USER_ID)).rejects.toThrow(
      ServiceUnavailableException,
    )
    expect(repository.findByUserId).not.toHaveBeenCalled()
  })

  it('est strictement passif : aucun refresh, aucune écriture', async () => {
    const { controller, gateway, repository } = makeController([
      youtubeAccount({ expiresIn: -3600 }),
    ])

    await controller.tokenStatus(USER_ID)

    expect(gateway.refreshAccessToken).not.toHaveBeenCalled()
    expect(repository.save).not.toHaveBeenCalled()
  })
})

describe('YouTubeController — POST /social/youtube/publish', () => {
  it('lève 503 quand YouTube n’est pas configuré', async () => {
    const { controller, publishYouTube } = makeController([], EMPTY_YOUTUBE)

    await expect(controller.publish(PUBLISH_BODY)).rejects.toThrow(
      ServiceUnavailableException,
    )
    expect(publishYouTube.execute).not.toHaveBeenCalled()
  })

  it('lève 503 quand la publication est désactivée par feature flag', async () => {
    const { controller, publishYouTube } = makeController([], FULL_YOUTUBE)

    await expect(controller.publish(PUBLISH_BODY)).rejects.toThrow(
      /YOUTUBE_PUBLISHING_ENABLED=false/,
    )
    // Aucun historique, aucun refresh, aucun gateway : rien n'est déclenché.
    expect(publishYouTube.execute).not.toHaveBeenCalled()
  })

  it('appelle le use case quand la publication est activée', async () => {
    const { controller, publishYouTube } = makeController([], PUBLISHING_YOUTUBE)

    await controller.publish(PUBLISH_BODY)

    expect(publishYouTube.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        accountId: '11111111-1111-1111-1111-111111111111',
        videoUrl: 'https://example.test/uploads/clip.mp4',
        title: 'Ma vidéo',
        madeForKids: false,
      }),
    )
  })

  it('projette un succès « en traitement » sans externalPostId', async () => {
    const { controller } = makeController([], PUBLISHING_YOUTUBE)

    const response = await controller.publish(PUBLISH_BODY)

    expect(response).toEqual({
      success: true,
      platform: 'youtube',
      processing: true,
      publishId: 'yt-video-1',
      externalPostId: null,
    })
  })

  it('projette un échec métier avec son diagnostic normalisé', async () => {
    const { controller, publishYouTube } = makeController([], PUBLISHING_YOUTUBE)
    publishYouTube.execute.mockResolvedValue({
      success: false,
      error: {
        code: 503,
        reason: 'PUBLISHING_NOT_CONFIGURED',
        retryable: false,
        action: 'CONFIGURE_PUBLISHING',
      },
      message: 'publication désactivée',
    })

    const response = await controller.publish(PUBLISH_BODY)

    expect(response).toEqual({
      success: false,
      platform: 'youtube',
      error: 'publication désactivée',
      reason: 'PUBLISHING_NOT_CONFIGURED',
      retryable: false,
      action: 'CONFIGURE_PUBLISHING',
    })
  })

  it('ne transmet ni n’expose aucun token', async () => {
    const { controller, publishYouTube } = makeController(
      [youtubeAccount({})],
      PUBLISHING_YOUTUBE,
    )

    const response = await controller.publish(PUBLISH_BODY)

    const sent = JSON.stringify(publishYouTube.execute.mock.calls[0][0])
    const received = JSON.stringify(response)
    expect(sent).not.toContain('fake-access-token')
    expect(sent).not.toContain('fake-refresh-token')
    expect(received).not.toContain('fake-access-token')
    expect(received).not.toContain('fake-refresh-token')
  })
})
