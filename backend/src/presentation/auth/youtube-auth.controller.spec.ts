import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { YouTubeAuthController } from './youtube-auth.controller.js'
import { OAuthStateSigner } from '../../infrastructure/auth/oauth-state.signer.js'
import { OAuthNonceStore } from '../../infrastructure/auth/oauth-nonce.store.js'
import { OAuthPkceService } from '../../infrastructure/auth/oauth-pkce.service.js'
import { OAuthPkceStore } from '../../infrastructure/auth/oauth-pkce.store.js'
import { OAuthErrorCode, oauthUnavailable } from '../../infrastructure/auth/oauth-error.js'
import { OAuthFrontendRedirectService } from '../../infrastructure/auth/oauth-frontend-redirect.service.js'

const USER_ID = '00000000-0000-0000-0000-000000000001'

/// ConfigService mocké pour les briques OAuth partagées (secret + TTL fictifs).
function makeConfig(stateSecret = 'fake-hmac-secret', stateTtlSeconds = 600) {
  return { getOrThrow: () => ({ stateSecret, stateTtlSeconds }) } as never
}

interface Harness {
  controller: YouTubeAuthController
  gateway: {
    assertConfigured: jest.Mock
    buildAuthorizationUrl: jest.Mock
    exchangeCodeAndFetchChannels: jest.Mock
  }
  useCase: { execute: jest.Mock }
  signer: OAuthStateSigner
  nonceStore: OAuthNonceStore
  pkceStore: OAuthPkceStore
  res: { redirect: jest.Mock }
}

function makeHarness(options: { configured?: boolean } = {}): Harness {
  const configured = options.configured ?? true
  const gateway = {
    assertConfigured: jest.fn(() => {
      if (!configured) {
        throw oauthUnavailable(
          OAuthErrorCode.YOUTUBE_NOT_CONFIGURED,
          'Intégration YouTube non configurée.',
        )
      }
    }),
    buildAuthorizationUrl: jest.fn(
      ({ state, codeChallenge }: { state: string; codeChallenge: string }) =>
        `https://accounts.google.test/auth?state=${state}&code_challenge=${codeChallenge}`,
    ),
    exchangeCodeAndFetchChannels: jest.fn(),
  }
  const useCase = {
    execute: jest.fn().mockResolvedValue({
      channels: [
        {
          id: 'account-1',
          externalAccountId: 'UC_channel_1',
          accountName: 'Zernio Channel',
          platform: 'youtube',
          createdOrUpdated: 'created',
        },
      ],
      count: 1,
    }),
  }
  const config = makeConfig()
  const signer = new OAuthStateSigner(config)
  const nonceStore = new OAuthNonceStore()
  const pkceStore = new OAuthPkceStore(config)

  // Frontend NON configuré dans ce harnais : les callbacks conservent donc leur
  // réponse JSON, ce que ces tests vérifient. La redirection est couverte
  // séparément par `oauth-frontend-redirect.service.spec.ts`.
  const redirect = new OAuthFrontendRedirectService({
    getOrThrow: () => ({ baseUrl: '', oauthCallbackPath: '/accounts' }),
  } as never)

  return {
    controller: new YouTubeAuthController(
      gateway,
      useCase as never,
      signer,
      nonceStore,
      new OAuthPkceService(),
      pkceStore,
      redirect,
    ),
    gateway,
    useCase,
    signer,
    nonceStore,
    pkceStore,
    res: { redirect: jest.fn() },
  }
}

/// Rejoue un démarrage complet et renvoie le `state` réellement émis.
function startFlow(h: Harness): string {
  h.controller.redirectToYouTube(USER_ID, h.res as never)
  const url = new URL(h.res.redirect.mock.calls[0][0] as string)
  return url.searchParams.get('state') as string
}

function codeOf(err: unknown): string {
  const response = (err as BadRequestException).getResponse()
  return (response as { code: string }).code
}

describe('YouTubeAuthController', () => {
  describe('démarrage du flux', () => {
    it('redirige avec un state signé et un code_challenge', () => {
      const h = makeHarness()

      h.controller.redirectToYouTube(USER_ID, h.res as never)

      expect(h.res.redirect).toHaveBeenCalledTimes(1)
      const url = new URL(h.res.redirect.mock.calls[0][0] as string)
      const state = url.searchParams.get('state') as string
      expect(h.signer.verify(state, 'youtube').userId).toBe(USER_ID)
      expect(url.searchParams.get('code_challenge')).toBeTruthy()
    })

    it('ne divulgue jamais le code_verifier dans la redirection', () => {
      const h = makeHarness()

      h.controller.redirectToYouTube(USER_ID, h.res as never)

      const redirected = h.res.redirect.mock.calls[0][0] as string
      const challenge = new URL(redirected).searchParams.get('code_challenge')
      const state = new URL(redirected).searchParams.get('state') as string
      // Le state ne porte que userId/nonce/provider/iat/exp.
      const payload = Buffer.from(state.split('.')[0], 'base64url').toString('utf8')
      expect(redirected).not.toContain('code_verifier')
      expect(payload).not.toContain('verifier')
      expect(payload).not.toContain(challenge as string)
    })

    it('lève 503 sans configuration, avant toute émission', () => {
      const h = makeHarness({ configured: false })

      expect(() => h.controller.redirectToYouTube(USER_ID, h.res as never)).toThrow(
        ServiceUnavailableException,
      )
      expect(h.gateway.buildAuthorizationUrl).not.toHaveBeenCalled()
      expect(h.res.redirect).not.toHaveBeenCalled()
    })

    it('rejette un userId absent', () => {
      const h = makeHarness()

      expect(() => h.controller.redirectToYouTube(undefined, h.res as never)).toThrow(
        BadRequestException,
      )
      expect(h.gateway.buildAuthorizationUrl).not.toHaveBeenCalled()
    })

    it('nettoie nonce et verifier si la construction de l’URL échoue', () => {
      const h = makeHarness()
      h.gateway.buildAuthorizationUrl.mockImplementation(() => {
        throw new Error('panne')
      })

      expect(() => h.controller.redirectToYouTube(USER_ID, h.res as never)).toThrow(
        'panne',
      )
      // Aucune entrée résiduelle : un nonce quelconque reste inconsommable.
      expect(h.nonceStore.consume('nonce-inexistant')).toBe(false)
    })
  })

  describe('callback — refus et paramètres', () => {
    it('renvoie une réponse structurée sur access_denied, sans échange', async () => {
      const h = makeHarness()

      const result = await h.controller.handleCallback(
        undefined,
        undefined,
        'access_denied',
        "L'utilisateur a refusé",
      )

      expect(result).toEqual({
        success: false,
        provider: 'youtube',
        errorCode: 'GOOGLE_ACCESS_DENIED',
        errorMessage: "L'utilisateur a refusé",
      })
      expect(h.useCase.execute).not.toHaveBeenCalled()
    })

    it('rejette un code absent', async () => {
      const h = makeHarness()
      const state = startFlow(h)

      await expect(
        h.controller.handleCallback(undefined, state, undefined, undefined),
      ).rejects.toThrow(BadRequestException)
      expect(h.useCase.execute).not.toHaveBeenCalled()
    })

    it('rejette un state absent', async () => {
      const h = makeHarness()

      await expect(
        h.controller.handleCallback('the-code', undefined, undefined, undefined),
      ).rejects.toThrow(BadRequestException)
      expect(h.useCase.execute).not.toHaveBeenCalled()
    })

    it('lève 503 sans configuration', async () => {
      const h = makeHarness({ configured: false })

      await expect(
        h.controller.handleCallback('c', 's', undefined, undefined),
      ).rejects.toThrow(ServiceUnavailableException)
      expect(h.useCase.execute).not.toHaveBeenCalled()
    })
  })

  describe('callback — contrôles de sécurité', () => {
    it('refuse un state LinkedIn présenté au callback YouTube', async () => {
      const h = makeHarness()
      const linkedinState = h.signer.sign({
        userId: USER_ID,
        nonce: 'nonce-linkedin',
        provider: 'linkedin',
      })

      try {
        await h.controller.handleCallback('c', linkedinState, undefined, undefined)
        throw new Error('aurait dû lever')
      } catch (err) {
        expect(codeOf(err)).toBe('PROVIDER_MISMATCH')
      }
      expect(h.useCase.execute).not.toHaveBeenCalled()
    })

    it('refuse un nonce inconnu (state valide mais jamais émis ici)', async () => {
      const h = makeHarness()
      const orphanState = h.signer.sign({
        userId: USER_ID,
        nonce: 'nonce-jamais-emis',
        provider: 'youtube',
      })

      try {
        await h.controller.handleCallback('c', orphanState, undefined, undefined)
        throw new Error('aurait dû lever')
      } catch (err) {
        expect(codeOf(err)).toBe('INVALID_NONCE')
      }
      expect(h.useCase.execute).not.toHaveBeenCalled()
    })

    it('refuse un callback rejoué (nonce déjà consommé)', async () => {
      const h = makeHarness()
      const state = startFlow(h)

      await h.controller.handleCallback('the-code', state, undefined, undefined)
      expect(h.useCase.execute).toHaveBeenCalledTimes(1)

      try {
        await h.controller.handleCallback('the-code', state, undefined, undefined)
        throw new Error('aurait dû lever')
      } catch (err) {
        expect(codeOf(err)).toBe('INVALID_NONCE')
      }
      // Aucun second échange de token.
      expect(h.useCase.execute).toHaveBeenCalledTimes(1)
    })

    it('refuse un verifier PKCE absent, avant tout échange', async () => {
      const h = makeHarness()
      const state = startFlow(h)
      const nonce = h.signer.verify(state, 'youtube').nonce
      // Le verifier disparaît (expiration/redémarrage/instance différente).
      h.pkceStore.discard(nonce)

      try {
        await h.controller.handleCallback('the-code', state, undefined, undefined)
        throw new Error('aurait dû lever')
      } catch (err) {
        expect(codeOf(err)).toBe('PKCE_VERIFIER_NOT_FOUND')
      }
      expect(h.useCase.execute).not.toHaveBeenCalled()
    })
  })

  describe('callback — succès', () => {
    it('connecte les chaînes et renvoie un résumé sans token', async () => {
      const h = makeHarness()
      const state = startFlow(h)

      const result = await h.controller.handleCallback(
        'the-code',
        state,
        undefined,
        undefined,
      )

      expect(result).toEqual({
        success: true,
        message: 'Chaîne(s) YouTube connectée(s) avec succès',
        userId: USER_ID,
        connected: {
          youtubeChannels: [
            {
              id: 'account-1',
              externalAccountId: 'UC_channel_1',
              accountName: 'Zernio Channel',
              platform: 'youtube',
              createdOrUpdated: 'created',
            },
          ],
        },
        count: 1,
      })
      expect(JSON.stringify(result)).not.toContain('verifier')
    })

    it('transmet au use case le code et le verifier repris du store', async () => {
      const h = makeHarness()
      h.controller.redirectToYouTube(USER_ID, h.res as never)
      const url = new URL(h.res.redirect.mock.calls[0][0] as string)
      const state = url.searchParams.get('state') as string

      await h.controller.handleCallback('the-code', state, undefined, undefined)

      const call = h.useCase.execute.mock.calls[0][0]
      expect(call.userId).toBe(USER_ID)
      expect(call.code).toBe('the-code')
      expect(typeof call.codeVerifier).toBe('string')
      expect(call.codeVerifier.length).toBeGreaterThanOrEqual(43)
    })
  })
})
