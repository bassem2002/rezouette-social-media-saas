import frontendConfig, {
  DEFAULT_FRONTEND_BASE_URL,
  DEFAULT_OAUTH_CALLBACK_PATH,
  isFrontendRedirectConfigured,
  type FrontendConfig,
} from './frontend.config.js'

/// `registerAs` renvoie une factory : on l'invoque directement pour lire la
/// config telle que Nest la produirait, sans démarrer de module.
function load(env: Record<string, string | undefined>): FrontendConfig {
  const saved = { ...process.env }
  try {
    for (const key of ['FRONTEND_URL', 'OAUTH_FRONTEND_CALLBACK_PATH']) {
      delete process.env[key]
    }
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) process.env[key] = value
    }
    return frontendConfig()
  } finally {
    process.env = saved
  }
}

describe('frontend.config — origine par défaut', () => {
  it('vaut le port Angular 4200, pas celui du front React gelé', () => {
    expect(DEFAULT_FRONTEND_BASE_URL).toBe('http://localhost:4200')
  })

  it('retombe sur 4200 quand FRONTEND_URL est absente', () => {
    expect(load({}).baseUrl).toBe('http://localhost:4200')
  })

  it.each(['', '   '])(
    'retombe sur 4200 quand FRONTEND_URL est vide (%p)',
    (value) => {
      expect(load({ FRONTEND_URL: value }).baseUrl).toBe(
        'http://localhost:4200',
      )
    },
  )

  it('conserve une origine explicite valide', () => {
    expect(load({ FRONTEND_URL: 'https://app.zernio.test' }).baseUrl).toBe(
      'https://app.zernio.test',
    )
  })

  it('conserve un port explicite différent du défaut', () => {
    expect(load({ FRONTEND_URL: 'http://localhost:5173' }).baseUrl).toBe(
      'http://localhost:5173',
    )
  })

  it('retire les slashs finaux pour éviter un double slash', () => {
    expect(load({ FRONTEND_URL: 'http://localhost:4200///' }).baseUrl).toBe(
      'http://localhost:4200',
    )
  })
})

describe('frontend.config — chemin de callback', () => {
  it('retombe sur /accounts quand la variable est absente', () => {
    expect(load({}).oauthCallbackPath).toBe(DEFAULT_OAUTH_CALLBACK_PATH)
  })

  it('honore un chemin explicite', () => {
    expect(
      load({ OAUTH_FRONTEND_CALLBACK_PATH: '/settings/accounts' })
        .oauthCallbackPath,
    ).toBe('/settings/accounts')
  })
})

describe('isFrontendRedirectConfigured', () => {
  it('accepte le défaut Angular', () => {
    expect(
      isFrontendRedirectConfigured({
        baseUrl: DEFAULT_FRONTEND_BASE_URL,
        oauthCallbackPath: '/accounts',
      }),
    ).toBe(true)
  })

  it.each(['http://localhost:4200', 'https://app.zernio.test'])(
    'accepte une origine http(s) (%s)',
    (baseUrl) => {
      expect(
        isFrontendRedirectConfigured({ baseUrl, oauthCallbackPath: '/x' }),
      ).toBe(true)
    },
  )

  // Une URL inexploitable DÉSACTIVE la redirection (repli JSON) plutôt que de
  // produire une cible douteuse : c'est le comportement sûr attendu.
  it.each([
    '',
    'localhost:4200',
    'not a url',
    'ftp://localhost:4200',
    'javascript:alert(1)',
    'file:///etc/passwd',
  ])('désactive la redirection pour une origine invalide (%p)', (baseUrl) => {
    expect(
      isFrontendRedirectConfigured({ baseUrl, oauthCallbackPath: '/x' }),
    ).toBe(false)
  })
})
