import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import { ConnectLinkedInAccountUseCase } from './connect-linkedin-account.use-case.js'
import type { ConnectedLinkedInMember } from '../ports/linkedin-oauth.gateway.js'

function makeMember(): ConnectedLinkedInMember {
  return {
    platform: 'linkedin',
    externalAccountId: 'urn:li:person:abc',
    accountName: 'Jane Doe',
    accessToken: 'AT-new',
    refreshToken: null,
    tokenExpiresAt: new Date('2026-09-22T12:00:00.000Z'),
    scopes: ['openid', 'profile', 'email', 'w_member_social'],
    metadata: { accountType: 'MEMBER', memberUrn: 'urn:li:person:abc', picture: null },
  }
}

function makeRepo(existing: SocialAccount | null) {
  return {
    findById: jest.fn(),
    findByUserId: jest.fn(),
    findByExternalAccount: jest.fn().mockResolvedValue(existing),
    save: jest.fn().mockResolvedValue(undefined),
  }
}

describe('ConnectLinkedInAccountUseCase (upsert)', () => {
  it('crée un nouveau compte membre quand aucun n’existe', async () => {
    const gateway = {
      assertConfigured: jest.fn(),
      buildAuthorizationUrl: jest.fn(),
      fetchConnectedMember: jest.fn().mockResolvedValue(makeMember()),
    }
    const repo = makeRepo(null)
    const useCase = new ConnectLinkedInAccountUseCase(gateway as never, repo as never)

    const result = await useCase.execute({
      userId: 'user-1',
      code: 'code-1',
      expectedNonce: 'nonce-1',
    })

    expect(gateway.fetchConnectedMember).toHaveBeenCalledWith('code-1', 'nonce-1')
    expect(repo.save).toHaveBeenCalledTimes(1)
    const saved = repo.save.mock.calls[0][0] as SocialAccount
    expect(saved.platform).toBe('linkedin')
    expect(saved.externalAccountId).toBe('urn:li:person:abc')
    expect(saved.refreshToken).toBeNull()
    expect(result.account.id).toBe('urn:li:person:abc')
    expect(result.count).toBe(1)
  })

  it('met à jour les tokens d’un compte existant (pas de doublon)', async () => {
    const existing = SocialAccount.create({
      userId: 'user-1',
      platform: 'linkedin',
      externalAccountId: 'urn:li:person:abc',
      accountName: 'Jane Doe',
      accessToken: 'AT-old',
      refreshToken: null,
      tokenExpiresAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    const gateway = {
      assertConfigured: jest.fn(),
      buildAuthorizationUrl: jest.fn(),
      fetchConnectedMember: jest.fn().mockResolvedValue(makeMember()),
    }
    const repo = makeRepo(existing)
    const useCase = new ConnectLinkedInAccountUseCase(gateway as never, repo as never)

    await useCase.execute({ userId: 'user-1', code: 'c', expectedNonce: 'n' })

    expect(repo.save).toHaveBeenCalledTimes(1)
    const saved = repo.save.mock.calls[0][0] as SocialAccount
    expect(saved).toBe(existing) // même agrégat → pas de nouveau compte
    expect(saved.accessToken).toBe('AT-new') // tokens mis à jour
    expect(saved.isActive).toBe(true)
  })
})
