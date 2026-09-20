import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import { TokenStatus } from '../../../domain/social/token-status.enum.js'
import { LinkedInTokenService } from './linkedin-token.service.js'

const DAY_MS = 24 * 60 * 60 * 1000

function makeAccount(tokenExpiresAt: Date | null): SocialAccount {
  return SocialAccount.create({
    userId: 'user-1',
    platform: 'linkedin',
    externalAccountId: 'urn:li:person:abc',
    accountName: 'Jane Doe',
    accessToken: 'AT',
    refreshToken: null,
    tokenExpiresAt,
    scopes: ['openid', 'w_member_social'],
    metadata: { accountType: 'MEMBER' },
  })
}

describe('LinkedInTokenService', () => {
  const service = new LinkedInTokenService()
  const now = new Date('2026-07-24T12:00:00.000Z')

  it('VALID : expiration lointaine (> 7 j)', () => {
    const account = makeAccount(new Date(now.getTime() + 30 * DAY_MS))
    expect(service.getStatus(account, now)).toBe(TokenStatus.VALID)
  })

  it('EXPIRING_SOON : expire dans la fenêtre de 7 j', () => {
    const account = makeAccount(new Date(now.getTime() + 3 * DAY_MS))
    expect(service.getStatus(account, now)).toBe(TokenStatus.EXPIRING_SOON)
  })

  it('EXPIRED : date d’expiration dépassée', () => {
    const account = makeAccount(new Date(now.getTime() - 1 * DAY_MS))
    expect(service.getStatus(account, now)).toBe(TokenStatus.EXPIRED)
  })

  it('RECONNECT_REQUIRED : drapeau prioritaire sur l’expiration', () => {
    const account = makeAccount(new Date(now.getTime() + 30 * DAY_MS))
    account.markNeedsReconnect()
    expect(service.getStatus(account, now)).toBe(TokenStatus.RECONNECT_REQUIRED)
  })
})
