import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { TokenStatus } from '../../../domain/social/token-status.enum.js'
import type { RefreshedYouTubeToken } from '../../auth/ports/youtube-token.gateway.js'
import {
  YouTubeTokenError,
  YouTubeTokenErrorCode,
} from '../errors/youtube-token.error.js'
import { YouTubeTokenService } from './youtube-token.service.js'
import { YOUTUBE_CREDENTIAL_GROUP_KEY } from './youtube-credential-group.js'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const SKEW_SECONDS = 600
const NOW = new Date('2026-07-31T12:00:00.000Z')

function inSeconds(seconds: number): Date {
  return new Date(NOW.getTime() + seconds * 1000)
}

function makeAccount(overrides: {
  channelId?: string
  expiresAt?: Date | null
  refreshToken?: string | null
  groupId?: string | null
  scopes?: string[]
  platform?: 'youtube' | 'tiktok'
}): SocialAccount {
  const groupId = overrides.groupId === undefined ? 'group-1' : overrides.groupId
  return SocialAccount.create({
    userId: USER_ID,
    platform: overrides.platform ?? 'youtube',
    externalAccountId: overrides.channelId ?? 'UC_channel_1',
    accountName: 'Zernio Channel',
    accessToken: 'ancien-access-token',
    refreshToken:
      overrides.refreshToken === undefined
        ? 'fake-refresh-token'
        : overrides.refreshToken,
    tokenExpiresAt:
      overrides.expiresAt === undefined ? inSeconds(3600) : overrides.expiresAt,
    scopes: overrides.scopes ?? ['https://www.googleapis.com/auth/youtube.upload'],
    metadata: {
      thumbnailUrl: 'https://img.test/high.jpg',
      ...(groupId ? { [YOUTUBE_CREDENTIAL_GROUP_KEY]: groupId } : {}),
    },
  })
}

/// Repository en mémoire — aucune base, aucun réseau.
function makeRepository(accounts: SocialAccount[]): SocialAccountRepository & {
  saved: SocialAccount[]
} {
  const saved: SocialAccount[] = []
  return {
    saved,
    findById: jest
      .fn()
      .mockImplementation(async (id: string) =>
        accounts.find((a) => a.id === id) ?? null,
      ),
    findByUserId: jest.fn().mockImplementation(async () => accounts),
    findByExternalAccount: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation(async (account: SocialAccount) => {
      saved.push(account)
    }),
  }
}

function refreshed(
  overrides: Partial<RefreshedYouTubeToken> = {},
): RefreshedYouTubeToken {
  return {
    accessToken: 'nouveau-access-token',
    refreshToken: null,
    tokenExpiresAt: inSeconds(3600),
    scopes: null,
    ...overrides,
  }
}

function makeService(
  accounts: SocialAccount[],
  gatewayImpl: Partial<{
    refreshAccessToken: jest.Mock
  }> = {},
) {
  const repository = makeRepository(accounts)
  const gateway = {
    assertConfigured: jest.fn(),
    refreshAccessToken:
      gatewayImpl.refreshAccessToken ?? jest.fn().mockResolvedValue(refreshed()),
  }
  const config = {
    getOrThrow: () => ({ tokenRefreshSkewSeconds: SKEW_SECONDS }),
  } as never
  return {
    service: new YouTubeTokenService(repository, gateway, config),
    repository,
    gateway,
  }
}

describe('YouTubeTokenService — statut passif', () => {
  it('VALID quand le token expire bien au-delà de la marge', () => {
    const account = makeAccount({ expiresAt: inSeconds(3600) })
    const { service, gateway } = makeService([account])

    expect(service.getStatus(account, NOW)).toBe(TokenStatus.VALID)
    expect(gateway.refreshAccessToken).not.toHaveBeenCalled()
  })

  it('EXPIRING_SOON dans la marge de rafraîchissement', () => {
    const account = makeAccount({ expiresAt: inSeconds(SKEW_SECONDS - 60) })
    const { service } = makeService([account])

    expect(service.getStatus(account, NOW)).toBe(TokenStatus.EXPIRING_SOON)
  })

  it('EXPIRED quand la date est dépassée', () => {
    const account = makeAccount({ expiresAt: inSeconds(-1) })
    const { service } = makeService([account])

    expect(service.getStatus(account, NOW)).toBe(TokenStatus.EXPIRED)
  })

  it('RECONNECT_REQUIRED quand needsReconnect est levé', () => {
    const account = makeAccount({})
    account.markNeedsReconnect()
    const { service } = makeService([account])

    expect(service.getStatus(account, NOW)).toBe(TokenStatus.RECONNECT_REQUIRED)
  })

  it('RECONNECT_REQUIRED sans refresh token (le token d’1 h ne sera jamais renouvelé)', () => {
    const account = makeAccount({ refreshToken: null })
    const { service } = makeService([account])

    expect(service.getStatus(account, NOW)).toBe(TokenStatus.RECONNECT_REQUIRED)
  })

  it('RECONNECT_REQUIRED quand l’expiration est inconnue', () => {
    const account = makeAccount({ expiresAt: null })
    const { service } = makeService([account])

    expect(service.getStatus(account, NOW)).toBe(TokenStatus.RECONNECT_REQUIRED)
  })

  it('RECONNECT_REQUIRED quand le compte est révoqué', () => {
    const account = makeAccount({})
    account.revoke()
    const { service } = makeService([account])

    expect(service.getStatus(account, NOW)).toBe(TokenStatus.RECONNECT_REQUIRED)
  })

  it('EXPIRED prime sur EXPIRING_SOON, needsReconnect prime sur tout', () => {
    const expired = makeAccount({ expiresAt: inSeconds(-10) })
    const { service } = makeService([expired])
    expect(service.getStatus(expired, NOW)).toBe(TokenStatus.EXPIRED)

    expired.markNeedsReconnect()
    expect(service.getStatus(expired, NOW)).toBe(TokenStatus.RECONNECT_REQUIRED)
  })

  it('est strictement passif : aucune écriture, aucun appel réseau', () => {
    const account = makeAccount({ expiresAt: inSeconds(-1) })
    const { service, repository, gateway } = makeService([account])

    service.getStatus(account, NOW)

    expect(repository.save).not.toHaveBeenCalled()
    expect(gateway.refreshAccessToken).not.toHaveBeenCalled()
  })
})

describe('YouTubeTokenService — ensureFresh', () => {
  it('ne rafraîchit pas un token encore largement valide', async () => {
    const account = makeAccount({ expiresAt: inSeconds(3600) })
    const { service, gateway, repository } = makeService([account])

    const result = await service.ensureFresh({
      userId: USER_ID,
      accountId: account.id,
      now: NOW,
    })

    expect(gateway.refreshAccessToken).not.toHaveBeenCalled()
    expect(repository.save).not.toHaveBeenCalled()
    expect(result.accessToken).toBe('ancien-access-token')
  })

  it('rafraîchit un token qui entre dans la marge', async () => {
    const account = makeAccount({ expiresAt: inSeconds(SKEW_SECONDS - 30) })
    const { service, gateway } = makeService([account])

    await service.ensureFresh({ userId: USER_ID, accountId: account.id, now: NOW })

    expect(gateway.refreshAccessToken).toHaveBeenCalledWith('fake-refresh-token')
    expect(account.accessToken).toBe('nouveau-access-token')
  })

  it('rafraîchit un token expiré', async () => {
    const account = makeAccount({ expiresAt: inSeconds(-60) })
    const { service, gateway } = makeService([account])

    await service.ensureFresh({ userId: USER_ID, accountId: account.id, now: NOW })

    expect(gateway.refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it('échoue si le compte est introuvable', async () => {
    const { service } = makeService([makeAccount({})])

    await expect(
      service.ensureFresh({ userId: USER_ID, accountId: 'inconnu', now: NOW }),
    ).rejects.toMatchObject({
      code: YouTubeTokenErrorCode.YOUTUBE_ACCOUNT_NOT_FOUND,
    })
  })

  it('ignore un compte d’une autre plateforme portant le même id', async () => {
    const tiktok = makeAccount({ platform: 'tiktok' })
    const { service } = makeService([tiktok])

    await expect(
      service.ensureFresh({ userId: USER_ID, accountId: tiktok.id, now: NOW }),
    ).rejects.toMatchObject({
      code: YouTubeTokenErrorCode.YOUTUBE_ACCOUNT_NOT_FOUND,
    })
  })

  it('échoue sans refresh token, sans appeler Google', async () => {
    const account = makeAccount({
      refreshToken: null,
      expiresAt: inSeconds(-60),
    })
    const { service, gateway } = makeService([account])

    await expect(
      service.ensureFresh({ userId: USER_ID, accountId: account.id, now: NOW }),
    ).rejects.toMatchObject({
      code: YouTubeTokenErrorCode.YOUTUBE_REFRESH_TOKEN_MISSING,
    })
    expect(gateway.refreshAccessToken).not.toHaveBeenCalled()
  })

  it('refuse d’emblée un compte déjà marqué needsReconnect', async () => {
    const account = makeAccount({ expiresAt: inSeconds(-60) })
    account.markNeedsReconnect()
    const { service, gateway } = makeService([account])

    await expect(
      service.ensureFresh({ userId: USER_ID, accountId: account.id, now: NOW }),
    ).rejects.toMatchObject({
      code: YouTubeTokenErrorCode.YOUTUBE_RECONNECT_REQUIRED,
    })
    expect(gateway.refreshAccessToken).not.toHaveBeenCalled()
  })
})

describe('YouTubeTokenService — synchronisation du groupe', () => {
  it('applique les nouveaux credentials à TOUTES les chaînes du groupe', async () => {
    const a = makeAccount({ channelId: 'UC_1', expiresAt: inSeconds(-60) })
    const b = makeAccount({ channelId: 'UC_2', expiresAt: inSeconds(-60) })
    const { service, repository } = makeService([a, b])

    await service.ensureFresh({ userId: USER_ID, accountId: a.id, now: NOW })

    expect(repository.save).toHaveBeenCalledTimes(2)
    expect(a.accessToken).toBe('nouveau-access-token')
    expect(b.accessToken).toBe('nouveau-access-token')
    expect(b.tokenExpiresAt).toEqual(inSeconds(3600))
  })

  it('ne touche pas une chaîne d’un autre groupe', async () => {
    const a = makeAccount({ channelId: 'UC_1', expiresAt: inSeconds(-60) })
    const autre = makeAccount({ channelId: 'UC_9', groupId: 'group-2' })
    const { service, repository } = makeService([a, autre])

    await service.ensureFresh({ userId: USER_ID, accountId: a.id, now: NOW })

    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(autre.accessToken).toBe('ancien-access-token')
  })

  it('traite seul un compte hérité sans identifiant de groupe', async () => {
    const legacy = makeAccount({
      channelId: 'UC_legacy',
      groupId: null,
      expiresAt: inSeconds(-60),
    })
    const autre = makeAccount({ channelId: 'UC_2' })
    const { service, repository } = makeService([legacy, autre])

    await service.ensureFresh({ userId: USER_ID, accountId: legacy.id, now: NOW })

    // Aucune fusion arbitraire : seul le compte visé est mis à jour…
    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(autre.accessToken).toBe('ancien-access-token')
    // …et il reçoit désormais un identifiant de groupe (migration progressive).
    expect(legacy.metadata?.[YOUTUBE_CREDENTIAL_GROUP_KEY]).toEqual(
      expect.any(String),
    )
  })

  it('préserve les autres métadonnées lors de la synchronisation', async () => {
    const account = makeAccount({ expiresAt: inSeconds(-60) })
    const { service } = makeService([account])

    await service.ensureFresh({ userId: USER_ID, accountId: account.id, now: NOW })

    expect(account.metadata?.['thumbnailUrl']).toBe('https://img.test/high.jpg')
    expect(account.metadata?.[YOUTUBE_CREDENTIAL_GROUP_KEY]).toBe('group-1')
  })

  it('conserve le refresh token quand Google n’en renvoie pas', async () => {
    const account = makeAccount({ expiresAt: inSeconds(-60) })
    const { service } = makeService([account])

    await service.ensureFresh({ userId: USER_ID, accountId: account.id, now: NOW })

    expect(account.refreshToken).toBe('fake-refresh-token')
  })

  it('applique un refresh token renouvelé (rotation)', async () => {
    const account = makeAccount({ expiresAt: inSeconds(-60) })
    const { service } = makeService([account], {
      refreshAccessToken: jest
        .fn()
        .mockResolvedValue(refreshed({ refreshToken: 'refresh-token-tourne' })),
    })

    await service.ensureFresh({ userId: USER_ID, accountId: account.id, now: NOW })

    expect(account.refreshToken).toBe('refresh-token-tourne')
  })

  it('conserve les scopes quand la réponse n’en fournit pas', async () => {
    const account = makeAccount({
      expiresAt: inSeconds(-60),
      scopes: ['https://www.googleapis.com/auth/youtube.upload'],
    })
    const { service } = makeService([account])

    await service.ensureFresh({ userId: USER_ID, accountId: account.id, now: NOW })

    expect(account.scopes).toEqual([
      'https://www.googleapis.com/auth/youtube.upload',
    ])
  })

  it('applique les scopes renvoyés, même réduits', async () => {
    const account = makeAccount({ expiresAt: inSeconds(-60) })
    const { service } = makeService([account], {
      refreshAccessToken: jest.fn().mockResolvedValue(
        refreshed({
          scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
        }),
      ),
    })

    await service.ensureFresh({ userId: USER_ID, accountId: account.id, now: NOW })

    // upload retiré par Google : on ne prétend pas le contraire.
    expect(account.scopes).toEqual([
      'https://www.googleapis.com/auth/youtube.readonly',
    ])
  })

  it('renseigne lastRefreshAt et réactive le compte', async () => {
    const account = makeAccount({ expiresAt: inSeconds(-60) })
    const { service } = makeService([account])

    await service.ensureFresh({ userId: USER_ID, accountId: account.id, now: NOW })

    expect(account.lastRefreshAt).toBeInstanceOf(Date)
    expect(account.status).toBe('active')
    expect(account.needsReconnect).toBe(false)
  })
})

describe('YouTubeTokenService — erreurs de refresh', () => {
  it('invalid_grant : marque TOUT le groupe en reconnexion', async () => {
    const a = makeAccount({ channelId: 'UC_1', expiresAt: inSeconds(-60) })
    const b = makeAccount({ channelId: 'UC_2', expiresAt: inSeconds(-60) })
    const { service } = makeService([a, b], {
      refreshAccessToken: jest.fn().mockRejectedValue(
        new YouTubeTokenError(
          YouTubeTokenErrorCode.YOUTUBE_RECONNECT_REQUIRED,
          'révoqué',
        ),
      ),
    })

    await expect(
      service.ensureFresh({ userId: USER_ID, accountId: a.id, now: NOW }),
    ).rejects.toMatchObject({
      code: YouTubeTokenErrorCode.YOUTUBE_RECONNECT_REQUIRED,
    })

    expect(a.needsReconnect).toBe(true)
    expect(b.needsReconnect).toBe(true)
    // Les tokens ne sont pas effacés : l'état reste diagnosticable.
    expect(a.accessToken).toBe('ancien-access-token')
    expect(a.refreshToken).toBe('fake-refresh-token')
  })

  it('erreur réseau : ne marque PAS le groupe, préserve les credentials', async () => {
    const a = makeAccount({ channelId: 'UC_1', expiresAt: inSeconds(-60) })
    const b = makeAccount({ channelId: 'UC_2', expiresAt: inSeconds(-60) })
    const { service, repository } = makeService([a, b], {
      refreshAccessToken: jest.fn().mockRejectedValue(
        new YouTubeTokenError(
          YouTubeTokenErrorCode.YOUTUBE_TOKEN_REFRESH_FAILED,
          'incident',
          true,
        ),
      ),
    })

    await expect(
      service.ensureFresh({ userId: USER_ID, accountId: a.id, now: NOW }),
    ).rejects.toMatchObject({
      code: YouTubeTokenErrorCode.YOUTUBE_TOKEN_REFRESH_FAILED,
    })

    expect(a.needsReconnect).toBe(false)
    expect(b.needsReconnect).toBe(false)
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('erreur de configuration : ne marque PAS le compte utilisateur', async () => {
    const account = makeAccount({ expiresAt: inSeconds(-60) })
    const { service, repository } = makeService([account], {
      refreshAccessToken: jest.fn().mockRejectedValue(
        new YouTubeTokenError(
          YouTubeTokenErrorCode.YOUTUBE_NOT_CONFIGURED,
          'credentials application refusés',
        ),
      ),
    })

    await expect(
      service.ensureFresh({ userId: USER_ID, accountId: account.id, now: NOW }),
    ).rejects.toMatchObject({
      code: YouTubeTokenErrorCode.YOUTUBE_NOT_CONFIGURED,
    })
    expect(account.needsReconnect).toBe(false)
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('réponse invalide : n’écrase aucun token existant', async () => {
    const account = makeAccount({ expiresAt: inSeconds(-60) })
    const { service } = makeService([account], {
      refreshAccessToken: jest.fn().mockRejectedValue(
        new YouTubeTokenError(
          YouTubeTokenErrorCode.YOUTUBE_INVALID_REFRESH_RESPONSE,
          'réponse inexploitable',
        ),
      ),
    })

    await expect(
      service.ensureFresh({ userId: USER_ID, accountId: account.id, now: NOW }),
    ).rejects.toMatchObject({
      code: YouTubeTokenErrorCode.YOUTUBE_INVALID_REFRESH_RESPONSE,
    })
    expect(account.accessToken).toBe('ancien-access-token')
    expect(account.needsReconnect).toBe(false)
  })
})

describe('YouTubeTokenService — single-flight', () => {
  /// Promesse contrôlée : permet de faire se chevaucher deux appels.
  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  it('deux appels concurrents du même groupe → un seul appel token endpoint', async () => {
    const a = makeAccount({ channelId: 'UC_1', expiresAt: inSeconds(-60) })
    const b = makeAccount({ channelId: 'UC_2', expiresAt: inSeconds(-60) })
    const gate = deferred<RefreshedYouTubeToken>()
    const refreshAccessToken = jest.fn().mockReturnValue(gate.promise)
    const { service } = makeService([a, b], { refreshAccessToken })

    const first = service.ensureFresh({
      userId: USER_ID,
      accountId: a.id,
      now: NOW,
    })
    const second = service.ensureFresh({
      userId: USER_ID,
      accountId: b.id,
      now: NOW,
    })

    gate.resolve(refreshed())
    await Promise.all([first, second])

    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(a.accessToken).toBe('nouveau-access-token')
    expect(b.accessToken).toBe('nouveau-access-token')
  })

  it('des groupes distincts se rafraîchissent indépendamment', async () => {
    const a = makeAccount({ channelId: 'UC_1', expiresAt: inSeconds(-60) })
    const b = makeAccount({
      channelId: 'UC_9',
      groupId: 'group-2',
      expiresAt: inSeconds(-60),
    })
    const refreshAccessToken = jest.fn().mockResolvedValue(refreshed())
    const { service } = makeService([a, b], { refreshAccessToken })

    await Promise.all([
      service.ensureFresh({ userId: USER_ID, accountId: a.id, now: NOW }),
      service.ensureFresh({ userId: USER_ID, accountId: b.id, now: NOW }),
    ])

    expect(refreshAccessToken).toHaveBeenCalledTimes(2)
  })

  it('partage l’échec avec les appels concurrents', async () => {
    const a = makeAccount({ channelId: 'UC_1', expiresAt: inSeconds(-60) })
    const b = makeAccount({ channelId: 'UC_2', expiresAt: inSeconds(-60) })
    const gate = deferred<RefreshedYouTubeToken>()
    const refreshAccessToken = jest.fn().mockReturnValue(gate.promise)
    const { service } = makeService([a, b], { refreshAccessToken })

    const first = service.ensureFresh({
      userId: USER_ID,
      accountId: a.id,
      now: NOW,
    })
    const second = service.ensureFresh({
      userId: USER_ID,
      accountId: b.id,
      now: NOW,
    })
    gate.reject(
      new YouTubeTokenError(
        YouTubeTokenErrorCode.YOUTUBE_TOKEN_REFRESH_FAILED,
        'incident',
        true,
      ),
    )

    await expect(first).rejects.toMatchObject({
      code: YouTubeTokenErrorCode.YOUTUBE_TOKEN_REFRESH_FAILED,
    })
    await expect(second).rejects.toMatchObject({
      code: YouTubeTokenErrorCode.YOUTUBE_TOKEN_REFRESH_FAILED,
    })
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it('purge la Map après un échec : le tour suivant réessaie', async () => {
    const account = makeAccount({ expiresAt: inSeconds(-60) })
    const refreshAccessToken = jest
      .fn()
      .mockRejectedValueOnce(
        new YouTubeTokenError(
          YouTubeTokenErrorCode.YOUTUBE_TOKEN_REFRESH_FAILED,
          'incident',
          true,
        ),
      )
      .mockResolvedValueOnce(refreshed())
    const { service } = makeService([account], { refreshAccessToken })

    await expect(
      service.ensureFresh({ userId: USER_ID, accountId: account.id, now: NOW }),
    ).rejects.toThrow()

    // Aucune promesse rejetée n'est resservie : un nouvel appel est bien émis.
    await service.ensureFresh({
      userId: USER_ID,
      accountId: account.id,
      now: NOW,
    })

    expect(refreshAccessToken).toHaveBeenCalledTimes(2)
    expect(account.accessToken).toBe('nouveau-access-token')
  })

  it('purge la Map après un succès', async () => {
    const account = makeAccount({ expiresAt: inSeconds(-60) })
    const refreshAccessToken = jest.fn().mockResolvedValue(refreshed())
    const { service } = makeService([account], { refreshAccessToken })

    await service.ensureFresh({ userId: USER_ID, accountId: account.id, now: NOW })
    // Le token vient d'être renouvelé : plus aucun refresh n'est nécessaire.
    await service.ensureFresh({ userId: USER_ID, accountId: account.id, now: NOW })

    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
  })
})
