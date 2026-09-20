import { LinkedInContentError } from '../../../application/social/errors/linkedin-content.error.js'
import {
  DisabledLinkedInContentService,
  linkedinContentGatewayProvider,
} from './linkedin-content.factory.js'
import { LINKEDIN_CONTENT_GATEWAY } from '../../../application/social/ports/linkedin-content.gateway.js'

const rest = { __kind: 'rest' } as never
const ugc = { __kind: 'ugc' } as never
const disabled = new DisabledLinkedInContentService()

function select(mode: 'disabled' | 'rest' | 'ugc') {
  const config = { getOrThrow: () => ({ publishApi: mode }) } as never
  // useFactory(config, rest, ugc, disabled)
  return (linkedinContentGatewayProvider as { useFactory: (...a: unknown[]) => unknown })
    .useFactory(config, rest, ugc, disabled)
}

describe('linkedinContentGatewayProvider (sélection rest/ugc/disabled)', () => {
  it('expose le Symbol du port', () => {
    expect(
      (linkedinContentGatewayProvider as { provide: symbol }).provide,
    ).toBe(LINKEDIN_CONTENT_GATEWAY)
  })

  it('mode rest → service REST', () => {
    expect(select('rest')).toBe(rest)
  })

  it('mode ugc → service UGC', () => {
    expect(select('ugc')).toBe(ugc)
  })

  it('mode disabled (défaut) → service Disabled', () => {
    expect(select('disabled')).toBe(disabled)
  })
})

describe('DisabledLinkedInContentService', () => {
  it('rejette toute publication avec publishing_not_configured (aucun réseau)', async () => {
    await expect(
      disabled.publishText({} as never),
    ).rejects.toBeInstanceOf(LinkedInContentError)
    await expect(disabled.publishImage({} as never)).rejects.toMatchObject({
      linkedin: { serviceErrorCode: 'publishing_not_configured' },
    })
  })
})
