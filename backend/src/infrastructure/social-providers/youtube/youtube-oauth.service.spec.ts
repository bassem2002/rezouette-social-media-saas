import {
  BadGatewayException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { of, throwError } from 'rxjs'
import { YouTubeOAuthService } from './youtube-oauth.service.js'
import type { YouTubeConfig } from '../../../config/youtube.config.js'
import type { OAuthSecurityConfig } from '../../../config/oauth-security.config.js'

const EMPTY_YOUTUBE: YouTubeConfig = {
  clientId: '',
  clientSecret: '',
  redirectUri: '',
  scopes: [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
  ],
  oauthAuthorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  oauthTokenUrl: 'https://oauth2.googleapis.com/token',
  apiBaseUrl: 'https://www.googleapis.com/youtube/v3',
  uploadBaseUrl: 'https://www.googleapis.com/upload/youtube/v3',
  publishingEnabled: false,
  reconcileIntervalMs: 60_000,
}

/// Credentials FICTIFS — aucun secret réel dans les tests.
const FULL_YOUTUBE: YouTubeConfig = {
  ...EMPTY_YOUTUBE,
  clientId: 'fake-client-id.apps.googleusercontent.com',
  clientSecret: 'fake-client-secret',
  redirectUri: 'https://app.example.test/api/v1/auth/youtube/callback',
}

const SECURITY_OK: OAuthSecurityConfig = {
  stateSecret: 'fake-hmac-secret',
  stateTtlSeconds: 600,
}
const SECURITY_EMPTY: OAuthSecurityConfig = { stateSecret: '', stateTtlSeconds: 600 }

function makeService(
  youtube: YouTubeConfig = FULL_YOUTUBE,
  security: OAuthSecurityConfig = SECURITY_OK,
) {
  const http = { post: jest.fn(), get: jest.fn() }
  const config = {
    getOrThrow: (key: string) => (key === 'youtube' ? youtube : security),
  } as never
  return { service: new YouTubeOAuthService(http as never, config), http }
}

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      expires_in: 3599,
      token_type: 'Bearer',
      scope:
        'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      ...overrides,
    },
  }
}

function channelItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'UC_channel_1',
    snippet: {
      title: 'Zernio Channel',
      customUrl: '@zernio',
      thumbnails: {
        default: { url: 'https://img.test/default.jpg' },
        medium: { url: 'https://img.test/medium.jpg' },
        high: { url: 'https://img.test/high.jpg' },
      },
    },
    contentDetails: { relatedPlaylists: { uploads: 'UU_uploads_1' } },
    statistics: {
      subscriberCount: '1234',
      videoCount: '42',
      hiddenSubscriberCount: false,
    },
    ...overrides,
  }
}

describe('YouTubeOAuthService', () => {
  describe('garde de configuration (aucun appel réseau)', () => {
    it('lève 503 YOUTUBE_NOT_CONFIGURED sans credentials', () => {
      const { service, http } = makeService(EMPTY_YOUTUBE)

      expect(() => service.assertConfigured()).toThrow(ServiceUnavailableException)
      expect(http.post).not.toHaveBeenCalled()
      expect(http.get).not.toHaveBeenCalled()
    })

    it('lève 503 OAUTH_STATE_NOT_CONFIGURED sans secret de state', () => {
      const { service, http } = makeService(FULL_YOUTUBE, SECURITY_EMPTY)

      try {
        service.assertConfigured()
        throw new Error('aurait dû lever')
      } catch (err) {
        const response = (err as ServiceUnavailableException).getResponse()
        expect(response).toMatchObject({ code: 'OAUTH_STATE_NOT_CONFIGURED' })
      }
      expect(http.post).not.toHaveBeenCalled()
    })

    it("buildAuthorizationUrl() n'émet aucune requête quand non configuré", () => {
      const { service, http } = makeService(EMPTY_YOUTUBE)

      expect(() =>
        service.buildAuthorizationUrl({ state: 's', codeChallenge: 'c' }),
      ).toThrow(ServiceUnavailableException)
      expect(http.get).not.toHaveBeenCalled()
    })

    it("exchangeCodeAndFetchChannels() n'émet aucune requête quand non configuré", async () => {
      const { service, http } = makeService(EMPTY_YOUTUBE)

      await expect(
        service.exchangeCodeAndFetchChannels({
          code: 'c',
          codeVerifier: 'v',
        }),
      ).rejects.toThrow(ServiceUnavailableException)
      expect(http.post).not.toHaveBeenCalled()
      expect(http.get).not.toHaveBeenCalled()
    })
  })

  describe("URL d'autorisation", () => {
    it('contient tous les paramètres attendus', () => {
      const { service } = makeService()
      const url = new URL(
        service.buildAuthorizationUrl({
          state: 'the-state',
          codeChallenge: 'the-challenge',
        }),
      )

      expect(url.origin + url.pathname).toBe(
        'https://accounts.google.com/o/oauth2/v2/auth',
      )
      expect(url.searchParams.get('client_id')).toBe(FULL_YOUTUBE.clientId)
      expect(url.searchParams.get('redirect_uri')).toBe(FULL_YOUTUBE.redirectUri)
      expect(url.searchParams.get('response_type')).toBe('code')
      expect(url.searchParams.get('state')).toBe('the-state')
      expect(url.searchParams.get('access_type')).toBe('offline')
      expect(url.searchParams.get('include_granted_scopes')).toBe('true')
      expect(url.searchParams.get('prompt')).toBe('consent')
      expect(url.searchParams.get('code_challenge')).toBe('the-challenge')
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    })

    it('joint les scopes par des espaces', () => {
      const { service } = makeService()
      const url = new URL(
        service.buildAuthorizationUrl({ state: 's', codeChallenge: 'c' }),
      )

      expect(url.searchParams.get('scope')).toBe(
        'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      )
    })

    it('ne demande aucun scope d’identité (openid/email/profile)', () => {
      const { service } = makeService()
      const url = new URL(
        service.buildAuthorizationUrl({ state: 's', codeChallenge: 'c' }),
      )
      const scope = url.searchParams.get('scope') ?? ''

      expect(scope).not.toContain('openid')
      expect(scope).not.toContain('email')
      expect(scope).not.toContain('profile')
    })

    it('ne transporte jamais le code_verifier', () => {
      const { service } = makeService()
      const url = service.buildAuthorizationUrl({
        state: 's',
        codeChallenge: 'the-challenge',
      })

      expect(url).not.toContain('code_verifier')
    })
  })

  describe('échange du code', () => {
    it('poste en x-www-form-urlencoded avec le code_verifier', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse()))
      http.get.mockReturnValue(of({ data: { items: [channelItem()] } }))

      await service.exchangeCodeAndFetchChannels({
        code: 'the-code',
        codeVerifier: 'the-verifier',
      })

      const [url, body, options] = http.post.mock.calls[0]
      expect(url).toBe('https://oauth2.googleapis.com/token')
      expect(options.headers['Content-Type']).toBe(
        'application/x-www-form-urlencoded',
      )
      const params = new URLSearchParams(body as string)
      expect(params.get('code')).toBe('the-code')
      expect(params.get('code_verifier')).toBe('the-verifier')
      expect(params.get('grant_type')).toBe('authorization_code')
      expect(params.get('client_id')).toBe(FULL_YOUTUBE.clientId)
      expect(params.get('client_secret')).toBe(FULL_YOUTUBE.clientSecret)
      expect(params.get('redirect_uri')).toBe(FULL_YOUTUBE.redirectUri)
    })

    it('calcule tokenExpiresAt à partir de expires_in', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse({ expires_in: 3600 })))
      http.get.mockReturnValue(of({ data: { items: [channelItem()] } }))

      const before = Date.now()
      const [channel] = await service.exchangeCodeAndFetchChannels({
        code: 'c',
        codeVerifier: 'v',
      })

      // L'horodatage est calculé APRÈS `before` : le delta vaut expires_in plus
      // le temps écoulé pendant l'appel (quelques ms tout au plus).
      const delta = channel.tokenExpiresAt.getTime() - before
      expect(delta).toBeGreaterThanOrEqual(3_600_000)
      expect(delta).toBeLessThan(3_605_000)
    })

    it('accepte une réponse sans refresh_token (refreshToken null)', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse({ refresh_token: undefined })))
      http.get.mockReturnValue(of({ data: { items: [channelItem()] } }))

      const [channel] = await service.exchangeCodeAndFetchChannels({
        code: 'c',
        codeVerifier: 'v',
      })

      expect(channel.refreshToken).toBeNull()
      expect(channel.accessToken).toBe('fake-access-token')
    })

    it('rejette une réponse sans access_token', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse({ access_token: undefined })))

      await expect(
        service.exchangeCodeAndFetchChannels({ code: 'c', codeVerifier: 'v' }),
      ).rejects.toThrow(UnauthorizedException)
      expect(http.get).not.toHaveBeenCalled()
    })

    it.each([
      ['absent', undefined],
      ['nul', 0],
      ['négatif', -10],
      ['non numérique', 'bientôt'],
    ])('rejette un expires_in %s', async (_label, expiresIn) => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse({ expires_in: expiresIn })))

      await expect(
        service.exchangeCodeAndFetchChannels({ code: 'c', codeVerifier: 'v' }),
      ).rejects.toThrow(UnauthorizedException)
      expect(http.get).not.toHaveBeenCalled()
    })

    it('rejette un token_type non Bearer', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse({ token_type: 'mac' })))

      await expect(
        service.exchangeCodeAndFetchChannels({ code: 'c', codeVerifier: 'v' }),
      ).rejects.toThrow(/Bearer/i)
    })

    it('rejette une réponse portant un champ error', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of({ data: { error: 'invalid_grant' } }))

      try {
        await service.exchangeCodeAndFetchChannels({ code: 'c', codeVerifier: 'v' })
        throw new Error('aurait dû lever')
      } catch (err) {
        const response = (err as UnauthorizedException).getResponse()
        expect(response).toMatchObject({ code: 'TOKEN_EXCHANGE_FAILED' })
      }
    })

    it("n'expose aucun secret quand l'échange échoue en réseau", async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(
        throwError(() => ({
          response: {
            status: 400,
            data: { error: 'invalid_grant', access_token: 'ne-doit-pas-fuiter' },
          },
        })),
      )

      try {
        await service.exchangeCodeAndFetchChannels({
          code: 'the-code',
          codeVerifier: 'the-verifier',
        })
        throw new Error('aurait dû lever')
      } catch (err) {
        const dump = `${(err as Error).message} ${JSON.stringify(
          (err as UnauthorizedException).getResponse(),
        )}`
        expect(dump).not.toContain('ne-doit-pas-fuiter')
        expect(dump).not.toContain('the-verifier')
        expect(dump).not.toContain('the-code')
        expect(dump).not.toContain('fake-client-secret')
      }
    })
  })

  /// Diagnostic de l'échec d'échange : la réponse publique reste volontairement
  /// opaque (`TOKEN_EXCHANGE_FAILED`), donc seule la journalisation interne
  /// permet d'identifier la cause. Elle doit être précise ET sans fuite.
  describe('diagnostic interne de l’échec d’échange', () => {
    /// Capture les logs SANS les afficher : un test ne doit pas recracher en
    /// sortie ce qu'il vérifie être absent.
    function captureLogs() {
      const lines: string[] = []
      const spy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation((message: unknown) => {
          lines.push(String(message))
        })
      return { lines, restore: () => spy.mockRestore() }
    }

    async function failExchangeWith(rejection: unknown) {
      const { service, http } = makeService()
      http.post.mockReturnValue(throwError(() => rejection))
      const { lines, restore } = captureLogs()
      try {
        await expect(
          service.exchangeCodeAndFetchChannels({
            code: 'the-code',
            codeVerifier: 'the-verifier',
          }),
        ).rejects.toThrow(UnauthorizedException)
        return { lines: lines.join('\n'), http }
      } finally {
        restore()
      }
    }

    function httpError(
      status: number,
      error: string,
      errorDescription?: string,
    ) {
      return { response: { status, data: { error, error_description: errorDescription } } }
    }

    it.each([
      [401, 'invalid_client', 'The OAuth client was not found.'],
      [400, 'invalid_grant', 'Bad Request'],
      [400, 'redirect_uri_mismatch', 'Bad Request'],
      [400, 'invalid_request', 'Missing required parameter: code_verifier'],
    ])(
      'journalise le statut, le code et la description (%s %s)',
      async (status, error, description) => {
        const { lines } = await failExchangeWith(
          httpError(status, error, description),
        )

        expect(lines).toContain('Échange code → token')
        expect(lines).toContain(`HTTP ${status}`)
        expect(lines).toContain(error)
        expect(lines).toContain(description)
      },
    )

    it('journalise le code seul quand Google n’envoie pas de description', async () => {
      const { lines } = await failExchangeWith(httpError(400, 'invalid_grant'))

      expect(lines).toContain('HTTP 400 (invalid_grant)')
    })

    it('nomme l’étape défaillante', async () => {
      const { lines } = await failExchangeWith(httpError(401, 'invalid_client'))

      expect(lines).toMatch(/Échange code → token Google échoué/)
    })

    it('journalise une réponse non JSON sans en exposer le corps', async () => {
      const { lines } = await failExchangeWith({
        response: {
          status: 502,
          data: '<html><body>Proxy Error — token=ne-doit-pas-fuiter</body></html>',
        },
      })

      expect(lines).toContain('HTTP 502')
      expect(lines).toContain('erreur non détaillée')
      expect(lines).not.toContain('ne-doit-pas-fuiter')
      expect(lines).not.toContain('<html>')
    })

    it.each([
      ['timeout', 'ECONNABORTED'],
      ['DNS', 'ENOTFOUND'],
      ['connexion refusée', 'ECONNREFUSED'],
    ])('journalise un échec réseau %s sans réponse HTTP', async (_l, code) => {
      const { lines } = await failExchangeWith(
        Object.assign(new Error('timeout of 0ms exceeded'), { code }),
      )

      expect(lines).toContain(`sans réponse HTTP (${code})`)
    })

    it('borne une description anormalement longue', async () => {
      const { lines } = await failExchangeWith(
        httpError(400, 'invalid_grant', 'A'.repeat(5000)),
      )

      expect(lines.length).toBeLessThan(600)
      expect(lines).toContain('…')
    })

    it('neutralise les caractères de contrôle d’une description', async () => {
      const { lines } = await failExchangeWith(
        httpError(400, 'invalid_grant', 'ligne1\n\r\tligne2 fin'),
      )

      expect(lines).toContain('ligne1 ligne2 fin')
    })

    it('ne journalise ni code OAuth, ni verifier, ni secret, ni token', async () => {
      const { lines } = await failExchangeWith({
        response: {
          status: 400,
          data: {
            error: 'invalid_grant',
            error_description: 'Bad Request',
            access_token: 'token-ne-doit-pas-fuiter',
            refresh_token: 'refresh-ne-doit-pas-fuiter',
          },
        },
      })

      expect(lines).not.toContain('the-code')
      expect(lines).not.toContain('the-verifier')
      expect(lines).not.toContain('fake-client-secret')
      expect(lines).not.toContain('token-ne-doit-pas-fuiter')
      expect(lines).not.toContain('refresh-ne-doit-pas-fuiter')
    })

    it('n’appelle le token endpoint qu’UNE seule fois sur échec', async () => {
      const { http } = await failExchangeWith(httpError(400, 'invalid_grant'))

      expect(http.post).toHaveBeenCalledTimes(1)
      expect(http.get).not.toHaveBeenCalled()
    })

    it('n’appelle le token endpoint qu’UNE seule fois sur succès', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse()))
      http.get.mockReturnValue(of({ data: { items: [channelItem()] } }))

      await service.exchangeCodeAndFetchChannels({ code: 'c', codeVerifier: 'v' })

      expect(http.post).toHaveBeenCalledTimes(1)
    })

    it('joint la description à un corps 200 porteur d’un champ error', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(
        of({
          data: { error: 'invalid_grant', error_description: 'Malformed auth code.' },
        }),
      )
      const { lines, restore } = captureLogs()

      try {
        await expect(
          service.exchangeCodeAndFetchChannels({ code: 'c', codeVerifier: 'v' }),
        ).rejects.toThrow(UnauthorizedException)
        expect(lines.join('\n')).toContain('invalid_grant — Malformed auth code.')
      } finally {
        restore()
      }
    })
  })

  /// Le redirect_uri est LA cause n°1 d'échec d'échange : Google exige qu'il
  /// soit identique à celui de l'autorisation, au caractère près.
  describe('cohérence du redirect_uri', () => {
    it('envoie exactement la même valeur à l’autorisation et à l’échange', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse()))
      http.get.mockReturnValue(of({ data: { items: [channelItem()] } }))

      const authUrl = new URL(
        service.buildAuthorizationUrl({ state: 's', codeChallenge: 'ch' }),
      )
      await service.exchangeCodeAndFetchChannels({ code: 'c', codeVerifier: 'v' })

      const sentAtExchange = new URLSearchParams(
        http.post.mock.calls[0][1] as string,
      ).get('redirect_uri')

      expect(sentAtExchange).toBe(authUrl.searchParams.get('redirect_uri'))
      expect(sentAtExchange).toBe(FULL_YOUTUBE.redirectUri)
      // Ni slash final ajouté, ni ré-encodage.
      expect(sentAtExchange?.endsWith('/')).toBe(false)
    })

    it('n’altère pas un code contenant des caractères réservés', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse()))
      http.get.mockReturnValue(of({ data: { items: [channelItem()] } }))
      const code = '4/0AVMBsJi-x_y+z/w=='

      await service.exchangeCodeAndFetchChannels({ code, codeVerifier: 'v' })

      const params = new URLSearchParams(http.post.mock.calls[0][1] as string)
      expect(params.get('code')).toBe(code)
    })
  })

  describe('scopes accordés', () => {
    it('persiste les scopes réellement retournés', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(
        of(
          tokenResponse({
            scope: 'https://www.googleapis.com/auth/youtube.readonly',
          }),
        ),
      )
      http.get.mockReturnValue(of({ data: { items: [channelItem()] } }))

      const [channel] = await service.exchangeCodeAndFetchChannels({
        code: 'c',
        codeVerifier: 'v',
      })

      // upload N'A PAS été accordé : on ne prétend pas le contraire.
      expect(channel.scopes).toEqual([
        'https://www.googleapis.com/auth/youtube.readonly',
      ])
    })

    it('retombe sur les scopes demandés si la réponse n’en fournit pas', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse({ scope: undefined })))
      http.get.mockReturnValue(of({ data: { items: [channelItem()] } }))

      const [channel] = await service.exchangeCodeAndFetchChannels({
        code: 'c',
        codeVerifier: 'v',
      })

      expect(channel.scopes).toEqual(FULL_YOUTUBE.scopes)
    })
  })

  describe('channels.list', () => {
    it('interroge mine=true avec les bons paramètres et un en-tête Bearer', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse()))
      http.get.mockReturnValue(of({ data: { items: [channelItem()] } }))

      await service.exchangeCodeAndFetchChannels({ code: 'c', codeVerifier: 'v' })

      const [url, options] = http.get.mock.calls[0]
      expect(url).toBe('https://www.googleapis.com/youtube/v3/channels')
      expect(options.params).toEqual({
        part: 'id,snippet,contentDetails,statistics',
        mine: 'true',
        maxResults: '50',
      })
      expect(options.headers.Authorization).toBe('Bearer fake-access-token')
      // Le token ne doit PAS être passé en query string.
      expect(JSON.stringify(options.params)).not.toContain('fake-access-token')
    })

    it('mappe une chaîne complète', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse()))
      http.get.mockReturnValue(of({ data: { items: [channelItem()] } }))

      const channels = await service.exchangeCodeAndFetchChannels({
        code: 'c',
        codeVerifier: 'v',
      })

      expect(channels).toHaveLength(1)
      expect(channels[0].channelId).toBe('UC_channel_1')
      expect(channels[0].channelTitle).toBe('Zernio Channel')
      expect(channels[0].metadata).toEqual({
        thumbnailUrl: 'https://img.test/high.jpg',
        customUrl: '@zernio',
        uploadsPlaylistId: 'UU_uploads_1',
        subscriberCount: '1234',
        videoCount: '42',
        hiddenSubscriberCount: false,
      })
    })

    it('mappe plusieurs chaînes (compte de marque)', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse()))
      http.get.mockReturnValue(
        of({
          data: {
            items: [
              channelItem(),
              // Deuxième chaîne volontairement dépouillée : ni miniatures, ni
              // playlist d'uploads, ni statistiques.
              channelItem({
                id: 'UC_channel_2',
                snippet: { title: 'Deuxième chaîne' },
                contentDetails: {},
                statistics: {},
              }),
            ],
          },
        }),
      )

      const channels = await service.exchangeCodeAndFetchChannels({
        code: 'c',
        codeVerifier: 'v',
      })

      expect(channels.map((c) => c.channelId)).toEqual([
        'UC_channel_1',
        'UC_channel_2',
      ])
      expect(channels[1].channelTitle).toBe('Deuxième chaîne')
      // Champs absents ⇒ clés absentes des metadata (pas de `undefined` persisté).
      expect(channels[1].metadata).toEqual({})
      // Chaque chaîne reçoit les mêmes tokens que le compte autorisé.
      expect(channels[1].accessToken).toBe('fake-access-token')
      expect(channels[1].refreshToken).toBe('fake-refresh-token')
    })

    it('applique la cascade de miniatures high → medium → default', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse()))
      http.get.mockReturnValue(
        of({
          data: {
            items: [
              channelItem({
                snippet: {
                  title: 'Sans high',
                  thumbnails: {
                    default: { url: 'https://img.test/default.jpg' },
                    medium: { url: 'https://img.test/medium.jpg' },
                  },
                },
              }),
            ],
          },
        }),
      )

      const [channel] = await service.exchangeCodeAndFetchChannels({
        code: 'c',
        codeVerifier: 'v',
      })

      expect(channel.metadata.thumbnailUrl).toBe('https://img.test/medium.jpg')
    })

    it('retombe sur default quand seule celle-ci existe', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse()))
      http.get.mockReturnValue(
        of({
          data: {
            items: [
              channelItem({
                snippet: {
                  title: 'Sans high ni medium',
                  thumbnails: { default: { url: 'https://img.test/default.jpg' } },
                },
              }),
            ],
          },
        }),
      )

      const [channel] = await service.exchangeCodeAndFetchChannels({
        code: 'c',
        codeVerifier: 'v',
      })

      expect(channel.metadata.thumbnailUrl).toBe('https://img.test/default.jpg')
    })

    it('retombe sur l’id quand la chaîne n’a pas de titre', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse()))
      http.get.mockReturnValue(
        of({ data: { items: [{ id: 'UC_sans_titre' }] } }),
      )

      const [channel] = await service.exchangeCodeAndFetchChannels({
        code: 'c',
        codeVerifier: 'v',
      })

      expect(channel.channelTitle).toBe('UC_sans_titre')
      expect(channel.metadata).toEqual({})
    })

    it('lève CHANNEL_NOT_FOUND sur une liste vide', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse()))
      http.get.mockReturnValue(of({ data: { items: [] } }))

      try {
        await service.exchangeCodeAndFetchChannels({ code: 'c', codeVerifier: 'v' })
        throw new Error('aurait dû lever')
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException)
        expect((err as NotFoundException).getResponse()).toMatchObject({
          code: 'CHANNEL_NOT_FOUND',
        })
      }
    })

    it('lève CHANNEL_NOT_FOUND quand items est absent', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse()))
      http.get.mockReturnValue(of({ data: {} }))

      await expect(
        service.exchangeCodeAndFetchChannels({ code: 'c', codeVerifier: 'v' }),
      ).rejects.toThrow(NotFoundException)
    })

    it('lève YOUTUBE_CHANNEL_FETCH_FAILED sur échec de lecture', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse()))
      http.get.mockReturnValue(
        throwError(() => ({ response: { status: 403, data: { error: 'forbidden' } } })),
      )

      try {
        await service.exchangeCodeAndFetchChannels({ code: 'c', codeVerifier: 'v' })
        throw new Error('aurait dû lever')
      } catch (err) {
        expect(err).toBeInstanceOf(BadGatewayException)
        expect((err as BadGatewayException).getResponse()).toMatchObject({
          code: 'YOUTUBE_CHANNEL_FETCH_FAILED',
        })
      }
    })

    it("n'expose aucun token dans l'erreur de lecture", async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(tokenResponse()))
      http.get.mockReturnValue(
        throwError(() => ({
          response: { status: 401, data: { error: 'invalid', token: 'fake-access-token' } },
        })),
      )

      try {
        await service.exchangeCodeAndFetchChannels({ code: 'c', codeVerifier: 'v' })
        throw new Error('aurait dû lever')
      } catch (err) {
        const dump = `${(err as Error).message} ${JSON.stringify(
          (err as BadGatewayException).getResponse(),
        )}`
        expect(dump).not.toContain('fake-access-token')
      }
    })
  })
})

describe('YouTubeOAuthService — refreshAccessToken', () => {
  function refreshResponse(overrides: Record<string, unknown> = {}) {
    return {
      data: {
        access_token: 'nouveau-access-token',
        expires_in: 3599,
        token_type: 'Bearer',
        ...overrides,
      },
    }
  }

  describe('garde de configuration', () => {
    it('lève YOUTUBE_NOT_CONFIGURED sans credentials, sans appel réseau', async () => {
      const { service, http } = makeService(EMPTY_YOUTUBE)

      await expect(
        service.refreshAccessToken('fake-refresh-token'),
      ).rejects.toMatchObject({ code: 'YOUTUBE_NOT_CONFIGURED' })
      expect(http.post).not.toHaveBeenCalled()
    })
  })

  describe('requête', () => {
    it('poste le corps minimal exigé par Google', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(refreshResponse()))

      await service.refreshAccessToken('fake-refresh-token')

      const [url, body, options] = http.post.mock.calls[0]
      expect(url).toBe('https://oauth2.googleapis.com/token')
      expect(options.headers['Content-Type']).toBe(
        'application/x-www-form-urlencoded',
      )
      const params = new URLSearchParams(body as string)
      expect(params.get('grant_type')).toBe('refresh_token')
      expect(params.get('refresh_token')).toBe('fake-refresh-token')
      expect(params.get('client_id')).toBe(FULL_YOUTUBE.clientId)
      expect(params.get('client_secret')).toBe(FULL_YOUTUBE.clientSecret)
    })

    it('n’envoie ni redirect_uri, ni code, ni code_verifier, ni scope', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(refreshResponse()))

      await service.refreshAccessToken('fake-refresh-token')

      const params = new URLSearchParams(http.post.mock.calls[0][1] as string)
      expect(params.get('redirect_uri')).toBeNull()
      expect(params.get('code')).toBeNull()
      expect(params.get('code_verifier')).toBeNull()
      expect(params.get('scope')).toBeNull()
    })

    it('n’interroge jamais channels.list', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(refreshResponse()))

      await service.refreshAccessToken('fake-refresh-token')

      expect(http.get).not.toHaveBeenCalled()
    })
  })

  describe('réponse', () => {
    it('renvoie le nouvel access token et son expiration', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(refreshResponse({ expires_in: 3600 })))

      const before = Date.now()
      const result = await service.refreshAccessToken('fake-refresh-token')

      expect(result.accessToken).toBe('nouveau-access-token')
      const delta = result.tokenExpiresAt.getTime() - before
      expect(delta).toBeGreaterThanOrEqual(3_600_000)
      expect(delta).toBeLessThan(3_605_000)
    })

    it('renvoie refreshToken null quand Google n’en fournit pas (= inchangé)', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(refreshResponse()))

      expect(
        (await service.refreshAccessToken('fake-refresh-token')).refreshToken,
      ).toBeNull()
    })

    it('renvoie le refresh token renouvelé en cas de rotation', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(
        of(refreshResponse({ refresh_token: 'refresh-token-tourne' })),
      )

      expect(
        (await service.refreshAccessToken('fake-refresh-token')).refreshToken,
      ).toBe('refresh-token-tourne')
    })

    it('renvoie scopes null quand la réponse n’en contient pas (= inchangés)', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(refreshResponse()))

      expect(
        (await service.refreshAccessToken('fake-refresh-token')).scopes,
      ).toBeNull()
    })

    it('normalise les scopes renvoyés', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(
        of(
          refreshResponse({
            scope:
              'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
          }),
        ),
      )

      expect(
        (await service.refreshAccessToken('fake-refresh-token')).scopes,
      ).toEqual([
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.readonly',
      ])
    })

    it.each([
      ['access_token manquant', { access_token: undefined }],
      ['expires_in absent', { expires_in: undefined }],
      ['expires_in nul', { expires_in: 0 }],
      ['expires_in négatif', { expires_in: -1 }],
      ['expires_in non numérique', { expires_in: 'bientôt' }],
      ['token_type non Bearer', { token_type: 'mac' }],
    ])('rejette une réponse invalide (%s)', async (_label, overrides) => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of(refreshResponse(overrides)))

      await expect(
        service.refreshAccessToken('fake-refresh-token'),
      ).rejects.toMatchObject({ code: 'YOUTUBE_INVALID_REFRESH_RESPONSE' })
    })
  })

  describe('erreurs Google', () => {
    it('invalid_grant → reconnexion requise, non retryable', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of({ data: { error: 'invalid_grant' } }))

      try {
        await service.refreshAccessToken('fake-refresh-token')
        throw new Error('aurait dû lever')
      } catch (err) {
        expect(err).toMatchObject({
          code: 'YOUTUBE_RECONNECT_REQUIRED',
          retryable: false,
        })
      }
    })

    it('invalid_grant renvoyé en HTTP 400 → reconnexion requise (cas réel Google)', async () => {
      const { service, http } = makeService()
      // Google refuse un refresh token révoqué par un 400, donc par un REJET
      // axios : il ne faut surtout pas le confondre avec une panne transitoire.
      http.post.mockReturnValue(
        throwError(() => ({
          response: { status: 400, data: { error: 'invalid_grant' } },
        })),
      )

      await expect(
        service.refreshAccessToken('fake-refresh-token'),
      ).rejects.toMatchObject({
        code: 'YOUTUBE_RECONNECT_REQUIRED',
        retryable: false,
      })
    })

    it('invalid_client renvoyé en HTTP 401 → erreur de configuration', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(
        throwError(() => ({
          response: { status: 401, data: { error: 'invalid_client' } },
        })),
      )

      await expect(
        service.refreshAccessToken('fake-refresh-token'),
      ).rejects.toMatchObject({ code: 'YOUTUBE_NOT_CONFIGURED' })
    })

    it.each(['invalid_client', 'unauthorized_client'])(
      '%s → erreur de configuration, jamais imputée au compte utilisateur',
      async (googleError) => {
        const { service, http } = makeService()
        http.post.mockReturnValue(of({ data: { error: googleError } }))

        await expect(
          service.refreshAccessToken('fake-refresh-token'),
        ).rejects.toMatchObject({
          code: 'YOUTUBE_NOT_CONFIGURED',
          retryable: false,
        })
      },
    )

    it('erreur inconnue → échec retryable, credentials préservés', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(of({ data: { error: 'server_error' } }))

      await expect(
        service.refreshAccessToken('fake-refresh-token'),
      ).rejects.toMatchObject({
        code: 'YOUTUBE_TOKEN_REFRESH_FAILED',
        retryable: true,
      })
    })

    it('incident réseau → échec retryable', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(throwError(() => ({ code: 'ETIMEDOUT' })))

      await expect(
        service.refreshAccessToken('fake-refresh-token'),
      ).rejects.toMatchObject({
        code: 'YOUTUBE_TOKEN_REFRESH_FAILED',
        retryable: true,
      })
    })

    it('HTTP 5xx → échec retryable', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(
        throwError(() => ({ response: { status: 503, data: {} } })),
      )

      await expect(
        service.refreshAccessToken('fake-refresh-token'),
      ).rejects.toMatchObject({ code: 'YOUTUBE_TOKEN_REFRESH_FAILED' })
    })

    it('n’effectue AUCUN retry automatique', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(throwError(() => ({ code: 'ETIMEDOUT' })))

      await expect(
        service.refreshAccessToken('fake-refresh-token'),
      ).rejects.toThrow()
      expect(http.post).toHaveBeenCalledTimes(1)
    })

    it('ne laisse fuir aucun secret dans l’erreur', async () => {
      const { service, http } = makeService()
      http.post.mockReturnValue(
        throwError(() => ({
          response: {
            status: 400,
            data: {
              error: 'invalid_grant',
              refresh_token: 'ne-doit-pas-fuiter',
            },
          },
        })),
      )

      try {
        await service.refreshAccessToken('fake-refresh-token')
        throw new Error('aurait dû lever')
      } catch (err) {
        const dump = (err as Error).message
        expect(dump).not.toContain('ne-doit-pas-fuiter')
        expect(dump).not.toContain('fake-refresh-token')
        expect(dump).not.toContain('fake-client-secret')
      }
    })
  })
})
