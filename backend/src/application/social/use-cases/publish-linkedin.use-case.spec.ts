import { NotFoundException } from '@nestjs/common'
import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import { PublishLinkedInUseCase } from './publish-linkedin.use-case.js'
import { LinkedInTokenService } from '../services/linkedin-token.service.js'
import { LinkedInExceptionMapper } from '../services/linkedin-exception-mapper.js'
import { DisabledLinkedInContentService } from '../../../infrastructure/social-providers/linkedin/linkedin-content.factory.js'
import { LinkedInErrorReason } from '../../../domain/social/errors/linkedin-error-reason.enum.js'

const DAY = 24 * 60 * 60 * 1000

function makeAccount(expiresInMs = 30 * DAY): SocialAccount {
  return SocialAccount.create({
    userId: 'user-1',
    platform: 'linkedin',
    externalAccountId: 'urn:li:person:abc',
    accountName: 'Jane Doe',
    accessToken: 'AT',
    refreshToken: null,
    tokenExpiresAt: new Date(Date.now() + expiresInMs),
    scopes: ['openid', 'w_member_social'],
    metadata: { accountType: 'MEMBER' },
  })
}

function makeDeps(account: SocialAccount | null) {
  const accounts = account ? [account] : []
  const socialAccounts = {
    findById: jest.fn(),
    findByUserId: jest.fn().mockResolvedValue(accounts),
    findByExternalAccount: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  }
  const socialPosts = {
    save: jest.fn().mockResolvedValue(undefined),
    findAll: jest.fn(),
    findById: jest.fn(),
    findByUserId: jest.fn(),
  }
  return { socialAccounts, socialPosts }
}

function makeGateway() {
  return {
    publishText: jest.fn().mockResolvedValue({ postUrn: 'urn:li:share:1' }),
    publishArticle: jest.fn().mockResolvedValue({ postUrn: 'urn:li:share:2' }),
    publishImage: jest.fn().mockResolvedValue({ postUrn: 'urn:li:share:3' }),
  }
}

describe('PublishLinkedInUseCase', () => {
  const tokenService = new LinkedInTokenService()
  const mapper = new LinkedInExceptionMapper()

  it('publie un texte (succès) et écrit l’historique PENDING→PUBLISHED', async () => {
    const account = makeAccount()
    const { socialAccounts, socialPosts } = makeDeps(account)
    const gateway = makeGateway()
    const useCase = new PublishLinkedInUseCase(
      socialAccounts as never, gateway as never, socialPosts as never, tokenService, mapper,
    )

    const outcome = await useCase.execute({ userId: 'user-1', text: 'Bonjour' })

    expect(outcome).toEqual({ success: true, externalPostId: 'urn:li:share:1' })
    expect(gateway.publishText).toHaveBeenCalledTimes(1)
    expect(gateway.publishText.mock.calls[0][0].author).toEqual({
      type: 'MEMBER', urn: 'urn:li:person:abc',
    })
    expect(socialPosts.save).toHaveBeenCalledTimes(2) // PENDING puis PUBLISHED
  })

  it('publie un lien via publishArticle', async () => {
    const { socialAccounts, socialPosts } = makeDeps(makeAccount())
    const gateway = makeGateway()
    const useCase = new PublishLinkedInUseCase(
      socialAccounts as never, gateway as never, socialPosts as never, tokenService, mapper,
    )
    const outcome = await useCase.execute({
      userId: 'user-1', text: 'voir', linkUrl: 'https://zernio.com', linkTitle: 'Z',
    })
    expect(outcome.success).toBe(true)
    expect(gateway.publishArticle).toHaveBeenCalledTimes(1)
    expect(gateway.publishText).not.toHaveBeenCalled()
  })

  it('publie une image via publishImage', async () => {
    const { socialAccounts, socialPosts } = makeDeps(makeAccount())
    const gateway = makeGateway()
    const useCase = new PublishLinkedInUseCase(
      socialAccounts as never, gateway as never, socialPosts as never, tokenService, mapper,
    )
    const outcome = await useCase.execute({
      userId: 'user-1', text: 'photo', imageUrl: 'https://img/x.jpg',
    })
    expect(outcome.success).toBe(true)
    expect(gateway.publishImage).toHaveBeenCalledTimes(1)
  })

  it('token expiré → RECONNECT_REQUIRED, aucun appel gateway, drapeau posé', async () => {
    const account = makeAccount(-1 * DAY) // déjà expiré
    const { socialAccounts, socialPosts } = makeDeps(account)
    const gateway = makeGateway()
    const useCase = new PublishLinkedInUseCase(
      socialAccounts as never, gateway as never, socialPosts as never, tokenService, mapper,
    )

    const outcome = await useCase.execute({ userId: 'user-1', text: 'x' })

    expect(outcome.success).toBe(false)
    if (!outcome.success) {
      expect(outcome.error.reason).toBe(LinkedInErrorReason.RECONNECT_REQUIRED)
    }
    expect(gateway.publishText).not.toHaveBeenCalled()
    expect(account.needsReconnect).toBe(true)
    expect(socialAccounts.save).toHaveBeenCalled()
    expect(socialPosts.save).toHaveBeenCalled() // historique FAILED écrit
  })

  it('publication désactivée (Disabled gateway) → PUBLISHING_NOT_CONFIGURED, sans réseau', async () => {
    const { socialAccounts, socialPosts } = makeDeps(makeAccount())
    const disabled = new DisabledLinkedInContentService()
    const spy = jest.spyOn(disabled, 'publishText')
    const useCase = new PublishLinkedInUseCase(
      socialAccounts as never, disabled, socialPosts as never, tokenService, mapper,
    )

    const outcome = await useCase.execute({ userId: 'user-1', text: 'x' })

    expect(outcome.success).toBe(false)
    if (!outcome.success) {
      expect(outcome.error.reason).toBe(LinkedInErrorReason.PUBLISHING_NOT_CONFIGURED)
    }
    expect(spy).toHaveBeenCalled() // pas de réseau : la garde vient de l'adaptateur
    expect(socialPosts.save).toHaveBeenCalledTimes(2) // PENDING puis FAILED
  })

  it('contenu vide → INVALID_PARAMETER sans résolution de compte', async () => {
    const { socialAccounts, socialPosts } = makeDeps(makeAccount())
    const gateway = makeGateway()
    const useCase = new PublishLinkedInUseCase(
      socialAccounts as never, gateway as never, socialPosts as never, tokenService, mapper,
    )
    const outcome = await useCase.execute({ userId: 'user-1' })
    expect(outcome.success).toBe(false)
    if (!outcome.success) {
      expect(outcome.error.reason).toBe(LinkedInErrorReason.INVALID_PARAMETER)
    }
    expect(socialAccounts.findByUserId).not.toHaveBeenCalled()
  })

  it('aucun compte LinkedIn → NotFoundException', async () => {
    const { socialAccounts, socialPosts } = makeDeps(null)
    const gateway = makeGateway()
    const useCase = new PublishLinkedInUseCase(
      socialAccounts as never, gateway as never, socialPosts as never, tokenService, mapper,
    )
    await expect(useCase.execute({ userId: 'user-1', text: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('erreur gateway 422 média → INVALID_MEDIA, historique FAILED', async () => {
    const { socialAccounts, socialPosts } = makeDeps(makeAccount())
    const gateway = makeGateway()
    gateway.publishText.mockRejectedValueOnce({
      response: { status: 422, data: { message: 'invalid media asset' } },
    })
    const useCase = new PublishLinkedInUseCase(
      socialAccounts as never, gateway as never, socialPosts as never, tokenService, mapper,
    )
    const outcome = await useCase.execute({ userId: 'user-1', text: 'x' })
    expect(outcome.success).toBe(false)
    if (!outcome.success) {
      expect(outcome.error.reason).toBe(LinkedInErrorReason.INVALID_MEDIA)
    }
    expect(socialPosts.save).toHaveBeenCalledTimes(2)
  })
})
