import { LinkedInExceptionMapper } from './linkedin-exception-mapper.js'
import { LinkedInContentError } from '../errors/linkedin-content.error.js'
import { LinkedInErrorReason } from '../../../domain/social/errors/linkedin-error-reason.enum.js'

function axios(status: number, message: string, serviceErrorCode?: string) {
  return { response: { status, data: { message, serviceErrorCode } } }
}

describe('LinkedInExceptionMapper', () => {
  const mapper = new LinkedInExceptionMapper()

  it('401 → TOKEN_EXPIRED (reconnexion)', () => {
    expect(mapper.map(axios(401, 'Invalid access token')).reason).toBe(
      LinkedInErrorReason.TOKEN_EXPIRED,
    )
  })

  it('403 générique → PERMISSION_DENIED', () => {
    expect(mapper.map(axios(403, 'ACCESS_DENIED: missing scope')).reason).toBe(
      LinkedInErrorReason.PERMISSION_DENIED,
    )
  })

  it('403 endpoint/produit versionné → PRODUCT_NOT_APPROVED', () => {
    expect(
      mapper.map(axios(403, 'Not authorized to access /rest/posts')).reason,
    ).toBe(LinkedInErrorReason.PRODUCT_NOT_APPROVED)
  })

  it('422 média → INVALID_MEDIA ; 422 autre → INVALID_PARAMETER', () => {
    expect(mapper.map(axios(422, 'invalid image asset')).reason).toBe(
      LinkedInErrorReason.INVALID_MEDIA,
    )
    expect(mapper.map(axios(422, 'field length too long')).reason).toBe(
      LinkedInErrorReason.INVALID_PARAMETER,
    )
  })

  it('429 → RATE_LIMITED (retryable)', () => {
    const m = mapper.map(axios(429, 'Too many requests'))
    expect(m.reason).toBe(LinkedInErrorReason.RATE_LIMITED)
    expect(m.retryable).toBe(true)
  })

  it('500 → UNKNOWN_LINKEDIN_ERROR', () => {
    expect(mapper.map(axios(500, 'server error')).reason).toBe(
      LinkedInErrorReason.UNKNOWN_LINKEDIN_ERROR,
    )
  })

  it('LinkedInContentError publishing_not_configured → PUBLISHING_NOT_CONFIGURED', () => {
    const err = new LinkedInContentError({
      serviceErrorCode: 'publishing_not_configured',
      httpStatus: 503,
      message: 'disabled',
    })
    expect(mapper.map(err).reason).toBe(
      LinkedInErrorReason.PUBLISHING_NOT_CONFIGURED,
    )
  })

  it('media_upload_failed → MEDIA_UPLOAD_FAILED', () => {
    const err = new LinkedInContentError({
      serviceErrorCode: 'media_upload_failed',
      httpStatus: 502,
      message: 'upload ko',
    })
    expect(mapper.map(err).reason).toBe(LinkedInErrorReason.MEDIA_UPLOAD_FAILED)
  })

  it('helpers forReconnectRequired / forPublishingNotConfigured', () => {
    expect(mapper.forReconnectRequired().reason).toBe(
      LinkedInErrorReason.RECONNECT_REQUIRED,
    )
    expect(mapper.forPublishingNotConfigured().reason).toBe(
      LinkedInErrorReason.PUBLISHING_NOT_CONFIGURED,
    )
  })
})
