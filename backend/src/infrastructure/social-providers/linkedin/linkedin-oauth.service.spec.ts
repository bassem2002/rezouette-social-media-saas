import { ServiceUnavailableException } from '@nestjs/common'
import { LinkedInOAuthService } from './linkedin-oauth.service.js'
import type { LinkedInConfig } from '../../../config/linkedin.config.js'

const EMPTY_CONFIG: LinkedInConfig = {
  clientId: '',
  clientSecret: '',
  redirectUri: '',
  scopes: ['openid', 'profile', 'email', 'w_member_social'],
  oauthBaseUrl: 'https://www.linkedin.com/oauth/v2',
  apiBaseUrl: 'https://api.linkedin.com',
  stateSecret: '',
}

const FULL_CONFIG: LinkedInConfig = {
  ...EMPTY_CONFIG,
  clientId: 'client-123',
  clientSecret: 'secret',
  redirectUri: 'https://app.example/api/v1/auth/linkedin/callback',
  stateSecret: 'hmac-secret',
}

function makeService(config: LinkedInConfig) {
  const http = { post: jest.fn(), get: jest.fn() } as never
  const configService = { getOrThrow: () => config } as never
  const oidc = { verify: jest.fn(), setKeyResolver: jest.fn() } as never
  return new LinkedInOAuthService(http, configService, oidc)
}

describe('LinkedInOAuthService — non fail-fast (503 sans credentials)', () => {
  it('assertConfigured() lève 503 avec le message attendu quand non configuré', () => {
    const service = makeService(EMPTY_CONFIG)
    expect(() => service.assertConfigured()).toThrow(ServiceUnavailableException)
    expect(() => service.assertConfigured()).toThrow(
      'LinkedIn integration is not configured.',
    )
  })

  it('buildAuthorizationUrl() lève 503 quand non configuré (aucun appel réseau)', () => {
    const service = makeService(EMPTY_CONFIG)
    expect(() => service.buildAuthorizationUrl('state', 'nonce')).toThrow(
      ServiceUnavailableException,
    )
  })

  it('buildAuthorizationUrl() construit une URL LinkedIn correcte quand configuré', () => {
    const service = makeService(FULL_CONFIG)
    const url = new URL(service.buildAuthorizationUrl('the-state', 'the-nonce'))

    expect(url.origin + url.pathname).toBe(
      'https://www.linkedin.com/oauth/v2/authorization',
    )
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('client-123')
    expect(url.searchParams.get('scope')).toBe(
      'openid profile email w_member_social',
    )
    expect(url.searchParams.get('state')).toBe('the-state')
    expect(url.searchParams.get('nonce')).toBe('the-nonce')
  })
})
