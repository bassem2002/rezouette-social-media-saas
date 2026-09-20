import { OAuthFrontendRedirectService } from './oauth-frontend-redirect.service.js'

const FRONTEND = 'https://app.zernio.test'

function makeService(
  baseUrl: string | null = FRONTEND,
  oauthCallbackPath = '/accounts',
) {
  const config = {
    getOrThrow: () => ({ baseUrl: baseUrl ?? '', oauthCallbackPath }),
  } as never
  return new OAuthFrontendRedirectService(config)
}

function params(url: string): URLSearchParams {
  return new URL(url).searchParams
}

describe('OAuthFrontendRedirectService — succès', () => {
  it.each(['youtube', 'linkedin', 'tiktok'] as const)(
    'construit une URL de succès pour %s',
    (provider) => {
      const url = makeService().buildSuccessUrl({ provider }) as string

      expect(url.startsWith(`${FRONTEND}/accounts?`)).toBe(true)
      expect(params(url).get('oauthProvider')).toBe(provider)
      expect(params(url).get('oauthStatus')).toBe('success')
    },
  )

  it('ajoute le nombre de comptes connectés', () => {
    const url = makeService().buildSuccessUrl({
      provider: 'youtube',
      count: 2,
    }) as string

    expect(params(url).get('oauthCount')).toBe('2')
  })

  it.each([0, -1, 1000, Number.NaN, undefined])(
    'ignore un compteur aberrant (%s)',
    (count) => {
      const url = makeService().buildSuccessUrl({
        provider: 'youtube',
        count: count as number,
      }) as string

      expect(params(url).get('oauthCount')).toBeNull()
    },
  )

  it('honore un chemin de callback personnalisé', () => {
    const url = makeService(FRONTEND, '/settings/accounts').buildSuccessUrl({
      provider: 'youtube',
    }) as string

    expect(new URL(url).pathname).toBe('/settings/accounts')
  })
})

describe('OAuthFrontendRedirectService — erreurs', () => {
  it('relaie un code d’erreur connu', () => {
    const url = makeService().buildErrorUrl({
      provider: 'youtube',
      errorCode: 'access_denied',
    }) as string

    expect(params(url).get('oauthStatus')).toBe('error')
    expect(params(url).get('oauthError')).toBe('access_denied')
  })

  it('normalise la casse', () => {
    const url = makeService().buildErrorUrl({
      provider: 'youtube',
      errorCode: 'ACCESS_DENIED',
    }) as string

    expect(params(url).get('oauthError')).toBe('access_denied')
  })

  it.each([
    ['code inconnu', 'quelque_chose_dinvente'],
    ['message brut', 'The user denied access to scope youtube.upload'],
    ['tentative XSS', '<script>alert(1)</script>'],
    ['chaîne vide', ''],
  ])('remplace %s par unknown_error', (_label, errorCode) => {
    const url = makeService().buildErrorUrl({
      provider: 'youtube',
      errorCode,
    }) as string

    expect(params(url).get('oauthError')).toBe('unknown_error')
  })
})

describe('OAuthFrontendRedirectService — frontend non configuré', () => {
  it.each([
    ['absent', ''],
    ['non URL', 'pas-une-url'],
    ['schéma interdit (file)', 'file:///etc/passwd'],
    ['schéma interdit (javascript)', 'javascript:alert(1)'],
  ])('renvoie null quand FRONTEND_URL est %s', (_label, baseUrl) => {
    const service = makeService(baseUrl)

    expect(service.isConfigured()).toBe(false)
    expect(service.buildSuccessUrl({ provider: 'youtube' })).toBeNull()
    expect(
      service.buildErrorUrl({ provider: 'youtube', errorCode: 'access_denied' }),
    ).toBeNull()
  })

  it('accepte http en développement', () => {
    const service = makeService('http://localhost:5173')

    expect(service.isConfigured()).toBe(true)
    expect(service.buildSuccessUrl({ provider: 'youtube' })).toContain(
      'http://localhost:5173/accounts',
    )
  })
})

describe('OAuthFrontendRedirectService — hygiène de l’URL', () => {
  it('n’expose QUE les paramètres autorisés', () => {
    const url = makeService().buildSuccessUrl({
      provider: 'youtube',
      count: 3,
    }) as string

    expect([...params(url).keys()].sort()).toEqual([
      'oauthCount',
      'oauthProvider',
      'oauthStatus',
    ])
  })

  it('ne transporte JAMAIS code, state, token ni verifier', () => {
    const url = `${makeService().buildSuccessUrl({ provider: 'youtube', count: 1 })}
      ${makeService().buildErrorUrl({ provider: 'youtube', errorCode: 'access_denied' })}`

    for (const forbidden of [
      'code=',
      'state=',
      'access_token',
      'refresh_token',
      'code_verifier',
      'client_secret',
      'id_token',
    ]) {
      expect(url).not.toContain(forbidden)
    }
  })

  it('encode les valeurs (aucune injection possible dans la query)', () => {
    const url = makeService().buildErrorUrl({
      provider: 'youtube',
      errorCode: 'a&oauthStatus=success',
    }) as string

    // Le code non reconnu est neutralisé : impossible de forger un faux succès.
    expect(params(url).get('oauthStatus')).toBe('error')
    expect(params(url).get('oauthError')).toBe('unknown_error')
  })

  it.each([
    ['URL absolue', 'https://evil.test/steal'],
    ['protocol-relative', '//evil.test/steal'],
    ['schéma javascript', 'javascript:alert(1)'],
  ])('ne peut pas changer d’origine via un chemin %s', (_label, path) => {
    const url = makeService(FRONTEND, path).buildSuccessUrl({
      provider: 'youtube',
    }) as string

    // Le chemin est ramené au défaut : l'origine reste celle du frontend.
    expect(new URL(url).origin).toBe(FRONTEND)
    expect(new URL(url).pathname).toBe('/accounts')
  })

  it('normalise un chemin sans slash initial', () => {
    const url = makeService(FRONTEND, 'accounts').buildSuccessUrl({
      provider: 'youtube',
    }) as string

    expect(new URL(url).pathname).toBe('/accounts')
  })
})
