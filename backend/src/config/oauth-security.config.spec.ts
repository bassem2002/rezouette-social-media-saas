import oauthSecurityConfig, {
  OAUTH_STATE_DEFAULT_TTL_SECONDS,
  isOAuthSecurityConfigured,
} from './oauth-security.config.js'

const KEYS = ['OAUTH_STATE_SECRET', 'OAUTH_STATE_TTL_SECONDS'] as const

describe('oauth-security.config', () => {
  const snapshot = new Map<string, string | undefined>()

  beforeEach(() => {
    for (const key of KEYS) {
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

  it('se charge sans aucune variable, sans lever (non fail-fast)', () => {
    const config = oauthSecurityConfig()

    expect(config.stateSecret).toBe('')
    expect(config.stateTtlSeconds).toBe(OAUTH_STATE_DEFAULT_TTL_SECONDS)
    expect(isOAuthSecurityConfigured(config)).toBe(false)
  })

  it('considère un secret vide comme non configuré', () => {
    process.env['OAUTH_STATE_SECRET'] = '   '

    expect(isOAuthSecurityConfigured(oauthSecurityConfig())).toBe(false)
  })

  it('considère un secret présent comme configuré', () => {
    process.env['OAUTH_STATE_SECRET'] = 'fake-hmac-secret'

    const config = oauthSecurityConfig()
    expect(config.stateSecret).toBe('fake-hmac-secret')
    expect(isOAuthSecurityConfigured(config)).toBe(true)
  })

  it('accepte un TTL entier strictement positif', () => {
    process.env['OAUTH_STATE_TTL_SECONDS'] = '900'

    expect(oauthSecurityConfig().stateTtlSeconds).toBe(900)
  })

  it.each(['0', '-1', 'abc', '', '   '])(
    'retombe sur 600 pour le TTL invalide "%s"',
    (raw) => {
      process.env['OAUTH_STATE_TTL_SECONDS'] = raw

      expect(oauthSecurityConfig().stateTtlSeconds).toBe(
        OAUTH_STATE_DEFAULT_TTL_SECONDS,
      )
    },
  )

  it('ne génère jamais de secret automatiquement', () => {
    // Deux chargements successifs sans variable : toujours vide, jamais aléatoire.
    expect(oauthSecurityConfig().stateSecret).toBe('')
    expect(oauthSecurityConfig().stateSecret).toBe('')
  })
})
