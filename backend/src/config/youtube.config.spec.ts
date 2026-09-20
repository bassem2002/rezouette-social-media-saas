import youtubeConfig, {
  YOUTUBE_DEFAULT_API_BASE_URL,
  YOUTUBE_DEFAULT_OAUTH_AUTHORIZATION_URL,
  YOUTUBE_DEFAULT_OAUTH_TOKEN_URL,
  YOUTUBE_DEFAULT_RECONCILE_INTERVAL_MS,
  YOUTUBE_DEFAULT_SCOPES,
  YOUTUBE_DEFAULT_TOKEN_REFRESH_SKEW_SECONDS,
  YOUTUBE_DEFAULT_UPLOAD_BASE_URL,
  isYouTubeConfigured,
  isYouTubePublishingEnabled,
  type YouTubeConfig,
} from './youtube.config.js'

/// Toutes les clés lues par la config — remises à zéro avant chaque test pour
/// qu'un `.env` local (ou une variable de CI) ne fausse jamais le résultat.
const YOUTUBE_ENV_KEYS = [
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'YOUTUBE_REDIRECT_URI',
  'YOUTUBE_SCOPES',
  'YOUTUBE_OAUTH_AUTHORIZATION_URL',
  'YOUTUBE_OAUTH_TOKEN_URL',
  'YOUTUBE_API_BASE_URL',
  'YOUTUBE_UPLOAD_BASE_URL',
  'YOUTUBE_PUBLISHING_ENABLED',
  'YOUTUBE_RECONCILE_INTERVAL_MS',
  'YOUTUBE_TOKEN_REFRESH_SKEW_SECONDS',
] as const

/// Credentials FICTIFS — aucun secret réel dans les tests.
const FAKE_CREDENTIALS = {
  YOUTUBE_CLIENT_ID: 'fake-client-id.apps.googleusercontent.com',
  YOUTUBE_CLIENT_SECRET: 'fake-client-secret',
  YOUTUBE_REDIRECT_URI: 'https://example.test/api/v1/auth/youtube/callback',
} as const

/// Charge la config avec l'environnement fourni (les clés absentes restent vides).
function load(env: Partial<Record<string, string>> = {}): YouTubeConfig {
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value
  }
  return youtubeConfig()
}

describe('youtube.config', () => {
  const snapshot = new Map<string, string | undefined>()

  beforeEach(() => {
    for (const key of YOUTUBE_ENV_KEYS) {
      snapshot.set(key, process.env[key])
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const [key, value] of snapshot) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    snapshot.clear()
  })

  describe('non fail-fast', () => {
    it('se charge sans aucune variable YouTube, sans lever, avec les défauts', () => {
      const config = load()

      expect(config.clientId).toBe('')
      expect(config.clientSecret).toBe('')
      expect(config.redirectUri).toBe('')
      expect(config.scopes).toEqual([...YOUTUBE_DEFAULT_SCOPES])
      expect(config.oauthAuthorizationUrl).toBe(
        YOUTUBE_DEFAULT_OAUTH_AUTHORIZATION_URL,
      )
      expect(config.oauthTokenUrl).toBe(YOUTUBE_DEFAULT_OAUTH_TOKEN_URL)
      expect(config.apiBaseUrl).toBe(YOUTUBE_DEFAULT_API_BASE_URL)
      expect(config.uploadBaseUrl).toBe(YOUTUBE_DEFAULT_UPLOAD_BASE_URL)
      expect(config.publishingEnabled).toBe(false)
      expect(config.reconcileIntervalMs).toBe(
        YOUTUBE_DEFAULT_RECONCILE_INTERVAL_MS,
      )
      expect(config.tokenRefreshSkewSeconds).toBe(
        YOUTUBE_DEFAULT_TOKEN_REFRESH_SKEW_SECONDS,
      )
      expect(isYouTubeConfigured(config)).toBe(false)
      expect(isYouTubePublishingEnabled(config)).toBe(false)
    })

    it('retombe sur les défauts quand les variables sont présentes mais vides', () => {
      const config = load({
        YOUTUBE_CLIENT_ID: '',
        YOUTUBE_SCOPES: '   ',
        YOUTUBE_API_BASE_URL: '',
        YOUTUBE_UPLOAD_BASE_URL: '',
        YOUTUBE_OAUTH_TOKEN_URL: '',
        YOUTUBE_RECONCILE_INTERVAL_MS: '',
      })

      expect(config.clientId).toBe('')
      expect(config.scopes).toEqual([...YOUTUBE_DEFAULT_SCOPES])
      expect(config.apiBaseUrl).toBe(YOUTUBE_DEFAULT_API_BASE_URL)
      expect(config.uploadBaseUrl).toBe(YOUTUBE_DEFAULT_UPLOAD_BASE_URL)
      expect(config.oauthTokenUrl).toBe(YOUTUBE_DEFAULT_OAUTH_TOKEN_URL)
      expect(config.reconcileIntervalMs).toBe(
        YOUTUBE_DEFAULT_RECONCILE_INTERVAL_MS,
      )
    })
  })

  describe('isYouTubeConfigured', () => {
    it('est vrai avec les trois credentials', () => {
      expect(isYouTubeConfigured(load(FAKE_CREDENTIALS))).toBe(true)
    })

    it.each([
      ['YOUTUBE_CLIENT_ID', 'clientId'],
      ['YOUTUBE_CLIENT_SECRET', 'clientSecret'],
      ['YOUTUBE_REDIRECT_URI', 'redirectUri'],
    ])('est faux quand %s manque', (missingKey) => {
      const env: Record<string, string> = { ...FAKE_CREDENTIALS }
      delete env[missingKey]

      expect(isYouTubeConfigured(load(env))).toBe(false)
    })

    it("n'exige PAS OAUTH_STATE_SECRET à ce stade", () => {
      const previous = process.env['OAUTH_STATE_SECRET']
      delete process.env['OAUTH_STATE_SECRET']
      try {
        expect(isYouTubeConfigured(load(FAKE_CREDENTIALS))).toBe(true)
      } finally {
        if (previous === undefined) delete process.env['OAUTH_STATE_SECRET']
        else process.env['OAUTH_STATE_SECRET'] = previous
      }
    })
  })

  describe('isYouTubePublishingEnabled', () => {
    it('est faux : credentials présents mais publication désactivée', () => {
      const config = load({
        ...FAKE_CREDENTIALS,
        YOUTUBE_PUBLISHING_ENABLED: 'false',
      })

      expect(isYouTubeConfigured(config)).toBe(true)
      expect(config.publishingEnabled).toBe(false)
      expect(isYouTubePublishingEnabled(config)).toBe(false)
    })

    it('est vrai : credentials présents ET publication activée', () => {
      const config = load({
        ...FAKE_CREDENTIALS,
        YOUTUBE_PUBLISHING_ENABLED: 'true',
      })

      expect(isYouTubePublishingEnabled(config)).toBe(true)
    })

    it('est faux : publication activée mais credentials absents', () => {
      const config = load({ YOUTUBE_PUBLISHING_ENABLED: 'true' })

      expect(config.publishingEnabled).toBe(true)
      expect(isYouTubeConfigured(config)).toBe(false)
      expect(isYouTubePublishingEnabled(config)).toBe(false)
    })

    it.each(['true', 'TRUE', ' True ', '1', 'yes', 'on', 'ON'])(
      'interprète "%s" comme activé',
      (raw) => {
        expect(load({ YOUTUBE_PUBLISHING_ENABLED: raw }).publishingEnabled).toBe(
          true,
        )
      },
    )

    it.each(['false', '0', 'no', 'off', 'oui', 'enabled', '', '  '])(
      'interprète "%s" comme désactivé (défaut sûr)',
      (raw) => {
        expect(load({ YOUTUBE_PUBLISHING_ENABLED: raw }).publishingEnabled).toBe(
          false,
        )
      },
    )
  })

  describe('parsing des scopes', () => {
    it('sépare par espaces', () => {
      const config = load({ YOUTUBE_SCOPES: 'scope.a scope.b   scope.c' })

      expect(config.scopes).toEqual(['scope.a', 'scope.b', 'scope.c'])
    })

    it('sépare aussi par virgules (convention tolérée du projet)', () => {
      const config = load({ YOUTUBE_SCOPES: 'scope.a,scope.b, scope.c' })

      expect(config.scopes).toEqual(['scope.a', 'scope.b', 'scope.c'])
    })

    it('supprime les doublons, les valeurs vides et les espaces superflus', () => {
      const config = load({
        YOUTUBE_SCOPES: '  scope.a,,  scope.b  scope.a ,  , scope.b  ',
      })

      expect(config.scopes).toEqual(['scope.a', 'scope.b'])
    })

    it('conserve les scopes par défaut sans doublon', () => {
      const config = load({
        YOUTUBE_SCOPES: `${YOUTUBE_DEFAULT_SCOPES[0]} ${YOUTUBE_DEFAULT_SCOPES[0]}`,
      })

      expect(config.scopes).toEqual([YOUTUBE_DEFAULT_SCOPES[0]])
    })
  })

  describe('intervalle de réconciliation', () => {
    it('accepte un entier strictement positif', () => {
      expect(
        load({ YOUTUBE_RECONCILE_INTERVAL_MS: '15000' }).reconcileIntervalMs,
      ).toBe(15_000)
    })

    it.each(['0', '-1', '-60000', 'abc', 'NaN', '', '   '])(
      'retombe sur 60000 pour la valeur invalide "%s"',
      (raw) => {
        expect(
          load({ YOUTUBE_RECONCILE_INTERVAL_MS: raw }).reconcileIntervalMs,
        ).toBe(YOUTUBE_DEFAULT_RECONCILE_INTERVAL_MS)
      },
    )

    it('tronque une valeur décimale positive', () => {
      expect(
        load({ YOUTUBE_RECONCILE_INTERVAL_MS: '1500.9' }).reconcileIntervalMs,
      ).toBe(1500)
    })
  })

  describe('marge de rafraîchissement du token', () => {
    it('accepte un entier strictement positif', () => {
      expect(
        load({ YOUTUBE_TOKEN_REFRESH_SKEW_SECONDS: '300' })
          .tokenRefreshSkewSeconds,
      ).toBe(300)
    })

    it.each(['0', '-1', '-600', 'abc', '', '   '])(
      'retombe sur 600 pour la valeur invalide "%s"',
      (raw) => {
        expect(
          load({ YOUTUBE_TOKEN_REFRESH_SKEW_SECONDS: raw })
            .tokenRefreshSkewSeconds,
        ).toBe(YOUTUBE_DEFAULT_TOKEN_REFRESH_SKEW_SECONDS)
      },
    )

    it("n'influence ni isYouTubeConfigured ni isYouTubePublishingEnabled", () => {
      const config = load({
        ...FAKE_CREDENTIALS,
        YOUTUBE_PUBLISHING_ENABLED: 'true',
        YOUTUBE_TOKEN_REFRESH_SKEW_SECONDS: 'valeur-absurde',
      })

      expect(config.tokenRefreshSkewSeconds).toBe(
        YOUTUBE_DEFAULT_TOKEN_REFRESH_SKEW_SECONDS,
      )
      expect(isYouTubeConfigured(config)).toBe(true)
      expect(isYouTubePublishingEnabled(config)).toBe(true)
    })
  })

  describe('hygiène des secrets', () => {
    it('les helpers ne renvoient que des booléens (aucune valeur sensible ne transite)', () => {
      const config = load(FAKE_CREDENTIALS)

      expect(typeof isYouTubeConfigured(config)).toBe('boolean')
      expect(typeof isYouTubePublishingEnabled(config)).toBe('boolean')
    })

    it('ne lève aucune exception susceptible de contenir un secret', () => {
      expect(() =>
        load({ ...FAKE_CREDENTIALS, YOUTUBE_RECONCILE_INTERVAL_MS: 'invalide' }),
      ).not.toThrow()
    })
  })
})
