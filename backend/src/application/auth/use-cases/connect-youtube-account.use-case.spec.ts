import { ConnectYouTubeAccountUseCase } from './connect-youtube-account.use-case.js'
import type { ConnectedYouTubeChannel } from '../ports/youtube-oauth.gateway.js'
import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import { YouTubeTokenErrorCode } from '../../social/errors/youtube-token.error.js'
import { YOUTUBE_CREDENTIAL_GROUP_KEY } from '../../social/services/youtube-credential-group.js'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const EXPIRES_AT = new Date('2099-01-01T10:00:00.000Z')

function channel(
  overrides: Partial<ConnectedYouTubeChannel> = {},
): ConnectedYouTubeChannel {
  return {
    channelId: 'UC_channel_1',
    channelTitle: 'Zernio Channel',
    accessToken: 'fake-access-token',
    refreshToken: 'fake-refresh-token',
    tokenExpiresAt: EXPIRES_AT,
    scopes: ['https://www.googleapis.com/auth/youtube.upload'],
    metadata: { thumbnailUrl: 'https://img.test/high.jpg', videoCount: '42' },
    ...overrides,
  }
}

function existingAccount(
  overrides: Partial<Parameters<typeof SocialAccount.create>[0]> = {},
): SocialAccount {
  return SocialAccount.create({
    userId: USER_ID,
    platform: 'youtube',
    externalAccountId: 'UC_channel_1',
    accountName: 'Ancien nom',
    accessToken: 'ancien-access-token',
    refreshToken: 'ancien-refresh-token',
    tokenExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    metadata: { thumbnailUrl: 'https://img.test/ancienne.jpg' },
    ...overrides,
  })
}

function makeUseCase(
  channels: ConnectedYouTubeChannel[],
  existing: SocialAccount | null = null,
  allExisting?: SocialAccount[],
) {
  const gateway = {
    assertConfigured: jest.fn(),
    buildAuthorizationUrl: jest.fn(),
    exchangeCodeAndFetchChannels: jest.fn().mockResolvedValue(channels),
  }
  const known = allExisting ?? (existing ? [existing] : [])
  const repository = {
    findById: jest.fn(),
    findByUserId: jest.fn().mockResolvedValue(known),
    findByExternalAccount: jest
      .fn()
      .mockImplementation(async (_userId: string, _platform: string, externalId: string) =>
        known.find((a) => a.externalAccountId === externalId) ?? null,
      ),
    save: jest.fn().mockResolvedValue(undefined),
  }
  return {
    useCase: new ConnectYouTubeAccountUseCase(gateway, repository),
    gateway,
    repository,
  }
}

/// Dernier compte passé à save().
function savedAccount(repository: { save: jest.Mock }, index = 0): SocialAccount {
  return repository.save.mock.calls[index][0] as SocialAccount
}

describe('ConnectYouTubeAccountUseCase', () => {
  describe('première connexion', () => {
    it('crée un SocialAccount YOUTUBE avec la chaîne', async () => {
      const { useCase, repository } = makeUseCase([channel()])

      const result = await useCase.execute({
        userId: USER_ID,
        code: 'the-code',
        codeVerifier: 'the-verifier',
      })

      expect(repository.save).toHaveBeenCalledTimes(1)
      const account = savedAccount(repository)
      expect(account.platform).toBe('youtube')
      expect(account.externalAccountId).toBe('UC_channel_1')
      expect(account.accountName).toBe('Zernio Channel')
      expect(account.accessToken).toBe('fake-access-token')
      expect(account.refreshToken).toBe('fake-refresh-token')
      expect(account.tokenExpiresAt).toEqual(EXPIRES_AT)
      expect(account.scopes).toEqual([
        'https://www.googleapis.com/auth/youtube.upload',
      ])
      expect(account.status).toBe('active')
      expect(account.needsReconnect).toBe(false)
      // Métadonnées de chaîne + rattachement au groupe de credentials (CP 4).
      expect(account.metadata).toEqual({
        thumbnailUrl: 'https://img.test/high.jpg',
        videoCount: '42',
        [YOUTUBE_CREDENTIAL_GROUP_KEY]: expect.any(String),
      })
      expect(result.count).toBe(1)
      expect(result.channels[0].createdOrUpdated).toBe('created')
    })

    it('persiste null quand Google ne fournit aucun refresh token', async () => {
      const { useCase, repository } = makeUseCase([
        channel({ refreshToken: null }),
      ])

      await useCase.execute({ userId: USER_ID, code: 'c', codeVerifier: 'v' })

      // Aucun refresh token n'est fabriqué : l'état réel est conservé.
      expect(savedAccount(repository).refreshToken).toBeNull()
    })

    it('crée un compte par chaîne (compte de marque)', async () => {
      const { useCase, repository } = makeUseCase([
        channel(),
        channel({ channelId: 'UC_channel_2', channelTitle: 'Deuxième' }),
      ])

      const result = await useCase.execute({
        userId: USER_ID,
        code: 'c',
        codeVerifier: 'v',
      })

      expect(repository.save).toHaveBeenCalledTimes(2)
      expect(savedAccount(repository, 0).externalAccountId).toBe('UC_channel_1')
      expect(savedAccount(repository, 1).externalAccountId).toBe('UC_channel_2')
      expect(result.count).toBe(2)
    })
  })

  describe('reconnexion', () => {
    it('met à jour le compte existant sans créer de doublon', async () => {
      const existing = existingAccount()
      const { useCase, repository } = makeUseCase([channel()], existing)

      const result = await useCase.execute({
        userId: USER_ID,
        code: 'c',
        codeVerifier: 'v',
      })

      expect(repository.save).toHaveBeenCalledTimes(1)
      expect(savedAccount(repository).id).toBe(existing.id)
      expect(result.channels[0].createdOrUpdated).toBe('updated')
    })

    it('met à jour access token, expiration, nom, scopes et metadata', async () => {
      const existing = existingAccount()
      const { useCase, repository } = makeUseCase([channel()], existing)

      await useCase.execute({ userId: USER_ID, code: 'c', codeVerifier: 'v' })

      const account = savedAccount(repository)
      expect(account.accessToken).toBe('fake-access-token')
      expect(account.tokenExpiresAt).toEqual(EXPIRES_AT)
      expect(account.accountName).toBe('Zernio Channel')
      expect(account.scopes).toEqual([
        'https://www.googleapis.com/auth/youtube.upload',
      ])
      expect(account.metadata).toEqual({
        thumbnailUrl: 'https://img.test/high.jpg',
        videoCount: '42',
        [YOUTUBE_CREDENTIAL_GROUP_KEY]: expect.any(String),
      })
      expect(account.status).toBe('active')
      expect(account.needsReconnect).toBe(false)
    })

    it('remplace le refresh token quand Google en renvoie un nouveau', async () => {
      const existing = existingAccount()
      const { useCase, repository } = makeUseCase(
        [channel({ refreshToken: 'nouveau-refresh-token' })],
        existing,
      )

      await useCase.execute({ userId: USER_ID, code: 'c', codeVerifier: 'v' })

      expect(savedAccount(repository).refreshToken).toBe('nouveau-refresh-token')
    })

    it('CONSERVE le refresh token existant quand Google n’en renvoie pas', async () => {
      const existing = existingAccount()
      const { useCase, repository } = makeUseCase(
        [channel({ refreshToken: null })],
        existing,
      )

      await useCase.execute({ userId: USER_ID, code: 'c', codeVerifier: 'v' })

      // Règle critique : jamais d'écrasement par null.
      expect(savedAccount(repository).refreshToken).toBe('ancien-refresh-token')
    })

    it('réactive un compte marqué needsReconnect', async () => {
      const existing = existingAccount()
      existing.markNeedsReconnect()
      existing.markExpired()
      const { useCase, repository } = makeUseCase([channel()], existing)

      await useCase.execute({ userId: USER_ID, code: 'c', codeVerifier: 'v' })

      expect(savedAccount(repository).needsReconnect).toBe(false)
      expect(savedAccount(repository).status).toBe('active')
    })

    it('recherche le compte par (userId, youtube, channelId)', async () => {
      const { useCase, repository } = makeUseCase([channel()])

      await useCase.execute({ userId: USER_ID, code: 'c', codeVerifier: 'v' })

      expect(repository.findByExternalAccount).toHaveBeenCalledWith(
        USER_ID,
        'youtube',
        'UC_channel_1',
      )
    })
  })

  describe('groupe de credentials', () => {
    it('attribue un même groupe à toutes les chaînes d’un consentement', async () => {
      const { useCase, repository } = makeUseCase([
        channel(),
        channel({ channelId: 'UC_channel_2', channelTitle: 'Deuxième' }),
      ])

      await useCase.execute({ userId: USER_ID, code: 'c', codeVerifier: 'v' })

      const first = savedAccount(repository, 0).metadata?.[
        YOUTUBE_CREDENTIAL_GROUP_KEY
      ]
      const second = savedAccount(repository, 1).metadata?.[
        YOUTUBE_CREDENTIAL_GROUP_KEY
      ]
      expect(first).toEqual(expect.any(String))
      expect(second).toBe(first)
    })

    it('préserve les autres métadonnées de chaîne', async () => {
      const { useCase, repository } = makeUseCase([channel()])

      await useCase.execute({ userId: USER_ID, code: 'c', codeVerifier: 'v' })

      const metadata = savedAccount(repository).metadata
      expect(metadata?.['thumbnailUrl']).toBe('https://img.test/high.jpg')
      expect(metadata?.['videoCount']).toBe('42')
      expect(metadata?.[YOUTUBE_CREDENTIAL_GROUP_KEY]).toEqual(expect.any(String))
    })

    it('n’est jamais dérivé du refresh token', async () => {
      const { useCase, repository } = makeUseCase([
        channel({ refreshToken: 'refresh-token-tres-reconnaissable' }),
      ])

      await useCase.execute({ userId: USER_ID, code: 'c', codeVerifier: 'v' })

      const groupId = String(
        savedAccount(repository).metadata?.[YOUTUBE_CREDENTIAL_GROUP_KEY],
      )
      expect(groupId).not.toContain('refresh-token-tres-reconnaissable')
      expect(groupId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
    })

    it('réutilise le groupe existant lors d’une reconnexion', async () => {
      const existing = existingAccount({
        metadata: { [YOUTUBE_CREDENTIAL_GROUP_KEY]: 'group-existant' },
      })
      const { useCase, repository } = makeUseCase([channel()], existing)

      await useCase.execute({ userId: USER_ID, code: 'c', codeVerifier: 'v' })

      expect(savedAccount(repository).metadata?.[YOUTUBE_CREDENTIAL_GROUP_KEY]).toBe(
        'group-existant',
      )
    })

    it('étend le groupe existant à une nouvelle chaîne du même consentement', async () => {
      const existing = existingAccount({
        metadata: { [YOUTUBE_CREDENTIAL_GROUP_KEY]: 'group-existant' },
      })
      const { useCase, repository } = makeUseCase(
        [channel(), channel({ channelId: 'UC_channel_2' })],
        null,
        [existing],
      )

      await useCase.execute({ userId: USER_ID, code: 'c', codeVerifier: 'v' })

      expect(savedAccount(repository, 1).metadata?.[YOUTUBE_CREDENTIAL_GROUP_KEY]).toBe(
        'group-existant',
      )
    })

    it('refuse de fusionner deux groupes contradictoires', async () => {
      const a = existingAccount({
        externalAccountId: 'UC_channel_1',
        metadata: { [YOUTUBE_CREDENTIAL_GROUP_KEY]: 'group-A' },
      })
      const b = existingAccount({
        externalAccountId: 'UC_channel_2',
        metadata: { [YOUTUBE_CREDENTIAL_GROUP_KEY]: 'group-B' },
      })
      const { useCase, repository } = makeUseCase(
        [channel(), channel({ channelId: 'UC_channel_2' })],
        null,
        [a, b],
      )

      await expect(
        useCase.execute({ userId: USER_ID, code: 'c', codeVerifier: 'v' }),
      ).rejects.toMatchObject({
        code: YouTubeTokenErrorCode.YOUTUBE_CREDENTIAL_GROUP_CONFLICT,
      })
      // Aucune écriture partielle avant le refus.
      expect(repository.save).not.toHaveBeenCalled()
    })

    it('ignore les groupes de chaînes NON concernées par ce consentement', async () => {
      const autre = existingAccount({
        externalAccountId: 'UC_autre_chaine',
        metadata: { [YOUTUBE_CREDENTIAL_GROUP_KEY]: 'group-sans-rapport' },
      })
      const { useCase, repository } = makeUseCase([channel()], null, [autre])

      await useCase.execute({ userId: USER_ID, code: 'c', codeVerifier: 'v' })

      expect(
        savedAccount(repository).metadata?.[YOUTUBE_CREDENTIAL_GROUP_KEY],
      ).not.toBe('group-sans-rapport')
    })
  })

  describe('résultat retourné', () => {
    it("ne contient AUCUN token ni secret", async () => {
      const { useCase } = makeUseCase([channel()])

      const result = await useCase.execute({
        userId: USER_ID,
        code: 'the-code',
        codeVerifier: 'the-verifier',
      })

      const dump = JSON.stringify(result)
      expect(dump).not.toContain('fake-access-token')
      expect(dump).not.toContain('fake-refresh-token')
      expect(dump).not.toContain('the-code')
      expect(dump).not.toContain('the-verifier')
      expect(result.channels[0]).toEqual({
        id: expect.any(String),
        externalAccountId: 'UC_channel_1',
        accountName: 'Zernio Channel',
        platform: 'youtube',
        createdOrUpdated: 'created',
      })
    })

    it('transmet code et codeVerifier à la passerelle', async () => {
      const { useCase, gateway } = makeUseCase([channel()])

      await useCase.execute({
        userId: USER_ID,
        code: 'the-code',
        codeVerifier: 'the-verifier',
      })

      expect(gateway.exchangeCodeAndFetchChannels).toHaveBeenCalledWith({
        code: 'the-code',
        codeVerifier: 'the-verifier',
      })
    })
  })
})
