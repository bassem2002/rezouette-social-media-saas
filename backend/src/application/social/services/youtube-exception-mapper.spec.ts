import { YouTubeErrorReason } from '../../../domain/social/errors/youtube-error-reason.enum.js'
import { YouTubeContentError } from '../errors/youtube-content.error.js'
import {
  YouTubeTokenError,
  YouTubeTokenErrorCode,
} from '../errors/youtube-token.error.js'
import {
  YouTubeErrorAction,
  YouTubeExceptionMapper,
} from './youtube-exception-mapper.js'

const mapper = new YouTubeExceptionMapper()

/// Erreur axios Google réaliste : `error.errors[0].reason` porte le motif.
function googleError(
  status: number,
  reason?: string,
  message = 'Erreur Google',
): unknown {
  return {
    response: {
      status,
      data: {
        error: {
          code: status,
          message,
          ...(reason ? { errors: [{ reason, message }] } : {}),
        },
      },
    },
  }
}

describe('YouTubeExceptionMapper — adaptateur désactivé', () => {
  it('publishing_not_configured → PUBLISHING_NOT_CONFIGURED, non retryable', () => {
    const error = new YouTubeContentError({
      serviceErrorCode: 'publishing_not_configured',
      httpStatus: 503,
      message: 'désactivé',
    })

    expect(mapper.map(error)).toEqual({
      code: 503,
      reason: YouTubeErrorReason.PUBLISHING_NOT_CONFIGURED,
      retryable: false,
      action: YouTubeErrorAction.CONFIGURE_PUBLISHING,
    })
  })
})

describe('YouTubeExceptionMapper — erreurs de token', () => {
  it.each([
    [
      YouTubeTokenErrorCode.YOUTUBE_RECONNECT_REQUIRED,
      YouTubeErrorReason.RECONNECT_REQUIRED,
      false,
      YouTubeErrorAction.RECONNECT_ACCOUNT,
    ],
    [
      YouTubeTokenErrorCode.YOUTUBE_REFRESH_TOKEN_MISSING,
      YouTubeErrorReason.REFRESH_TOKEN_MISSING,
      false,
      YouTubeErrorAction.RECONNECT_ACCOUNT,
    ],
    [
      YouTubeTokenErrorCode.YOUTUBE_ACCOUNT_NOT_FOUND,
      YouTubeErrorReason.CHANNEL_NOT_FOUND,
      false,
      YouTubeErrorAction.FIX_REQUEST,
    ],
    [
      YouTubeTokenErrorCode.YOUTUBE_NOT_CONFIGURED,
      YouTubeErrorReason.PUBLISHING_NOT_CONFIGURED,
      false,
      YouTubeErrorAction.CONFIGURE_PUBLISHING,
    ],
  ])('%s → %s', (code, reason, retryable, action) => {
    const mapped = mapper.map(new YouTubeTokenError(code, 'message'))

    expect(mapped.reason).toBe(reason)
    expect(mapped.retryable).toBe(retryable)
    expect(mapped.action).toBe(action)
  })

  it('refresh transitoire → TOKEN_EXPIRED retryable', () => {
    const mapped = mapper.map(
      new YouTubeTokenError(
        YouTubeTokenErrorCode.YOUTUBE_TOKEN_REFRESH_FAILED,
        'incident',
        true,
      ),
    )

    expect(mapped.reason).toBe(YouTubeErrorReason.TOKEN_EXPIRED)
    expect(mapped.retryable).toBe(true)
    expect(mapped.action).toBe(YouTubeErrorAction.RETRY_LATER)
  })

  it('réponse de refresh invalide → UNKNOWN_YOUTUBE_ERROR non retryable', () => {
    const mapped = mapper.map(
      new YouTubeTokenError(
        YouTubeTokenErrorCode.YOUTUBE_INVALID_REFRESH_RESPONSE,
        'inexploitable',
      ),
    )

    expect(mapped.reason).toBe(YouTubeErrorReason.UNKNOWN_YOUTUBE_ERROR)
    expect(mapped.retryable).toBe(false)
  })

  it('describe() renvoie le message de l’erreur de token', () => {
    expect(
      mapper.describe(
        new YouTubeTokenError(
          YouTubeTokenErrorCode.YOUTUBE_RECONNECT_REQUIRED,
          'autorisation révoquée',
        ),
      ),
    ).toBe('autorisation révoquée')
  })
})

describe('YouTubeExceptionMapper — erreurs Google', () => {
  it('401 → TOKEN_EXPIRED, reconnexion', () => {
    const mapped = mapper.map(googleError(401, 'authError'))

    expect(mapped.reason).toBe(YouTubeErrorReason.TOKEN_EXPIRED)
    expect(mapped.action).toBe(YouTubeErrorAction.RECONNECT_ACCOUNT)
  })

  it('403 insufficientPermissions → UPLOAD_SCOPE_MISSING', () => {
    expect(mapper.map(googleError(403, 'insufficientPermissions')).reason).toBe(
      YouTubeErrorReason.UPLOAD_SCOPE_MISSING,
    )
  })

  it('403 youtubeSignupRequired → CHANNEL_NOT_FOUND', () => {
    expect(mapper.map(googleError(403, 'youtubeSignupRequired')).reason).toBe(
      YouTubeErrorReason.CHANNEL_NOT_FOUND,
    )
  })

  it('403 autre → PERMISSION_DENIED', () => {
    expect(mapper.map(googleError(403, 'forbidden')).reason).toBe(
      YouTubeErrorReason.PERMISSION_DENIED,
    )
  })

  it.each(['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded'])(
    '%s → QUOTA_EXCEEDED, retryable le lendemain',
    (reason) => {
      const mapped = mapper.map(googleError(403, reason))

      expect(mapped.reason).toBe(YouTubeErrorReason.QUOTA_EXCEEDED)
      expect(mapped.retryable).toBe(true)
      expect(mapped.action).toBe(YouTubeErrorAction.RETRY_TOMORROW)
    },
  )

  it('uploadLimitExceeded → DAILY_UPLOAD_LIMIT, non retryable', () => {
    const mapped = mapper.map(googleError(403, 'uploadLimitExceeded'))

    expect(mapped.reason).toBe(YouTubeErrorReason.DAILY_UPLOAD_LIMIT)
    expect(mapped.retryable).toBe(false)
    expect(mapped.action).toBe(YouTubeErrorAction.RETRY_TOMORROW)
  })

  it('429 → RATE_LIMITED, retryable', () => {
    const mapped = mapper.map(googleError(429))

    expect(mapped.reason).toBe(YouTubeErrorReason.RATE_LIMITED)
    expect(mapped.retryable).toBe(true)
  })

  it('404 → CHANNEL_NOT_FOUND', () => {
    expect(mapper.map(googleError(404)).reason).toBe(
      YouTubeErrorReason.CHANNEL_NOT_FOUND,
    )
  })

  it('400 invalidTitle → INVALID_TITLE', () => {
    expect(mapper.map(googleError(400, 'invalidTitle')).reason).toBe(
      YouTubeErrorReason.INVALID_TITLE,
    )
  })

  it('400 invalidCategoryId → INVALID_CATEGORY', () => {
    expect(mapper.map(googleError(400, 'invalidCategoryId')).reason).toBe(
      YouTubeErrorReason.INVALID_CATEGORY,
    )
  })

  it('400 mediaBodyRequired → INVALID_VIDEO', () => {
    expect(mapper.map(googleError(400, 'mediaBodyRequired')).reason).toBe(
      YouTubeErrorReason.INVALID_VIDEO,
    )
  })

  it('400 générique → INVALID_PARAMETER', () => {
    expect(mapper.map(googleError(400, 'badRequest', 'requête')).reason).toBe(
      YouTubeErrorReason.INVALID_PARAMETER,
    )
  })

  it('500 → UPLOAD_FAILED, retryable', () => {
    const mapped = mapper.map(googleError(500))

    expect(mapped.reason).toBe(YouTubeErrorReason.UPLOAD_FAILED)
    expect(mapped.retryable).toBe(true)
  })

  it('timeout réseau → TIMEOUT, retryable', () => {
    const mapped = mapper.map({ code: 'ETIMEDOUT', message: 'timeout of 0ms' })

    expect(mapped.reason).toBe(YouTubeErrorReason.TIMEOUT)
    expect(mapped.retryable).toBe(true)
  })

  it('upload_failed → UPLOAD_FAILED retryable', () => {
    const mapped = mapper.map(
      new YouTubeContentError({
        serviceErrorCode: 'upload_failed',
        httpStatus: 502,
        message: 'transfert interrompu',
      }),
    )

    expect(mapped.reason).toBe(YouTubeErrorReason.UPLOAD_FAILED)
    expect(mapped.retryable).toBe(true)
  })

  it('upload_session_expired → UPLOAD_SESSION_EXPIRED retryable', () => {
    const mapped = mapper.map(
      new YouTubeContentError({
        serviceErrorCode: 'upload_session_expired',
        httpStatus: 410,
        message: 'session expirée',
      }),
    )

    expect(mapped.reason).toBe(YouTubeErrorReason.UPLOAD_SESSION_EXPIRED)
    expect(mapped.retryable).toBe(true)
  })

  it('erreur inconnue → UNKNOWN_YOUTUBE_ERROR', () => {
    const mapped = mapper.map(new Error('surprise'))

    expect(mapped.reason).toBe(YouTubeErrorReason.UNKNOWN_YOUTUBE_ERROR)
    expect(mapped.retryable).toBe(false)
    expect(mapped.action).toBe(YouTubeErrorAction.CONTACT_SUPPORT)
  })
})

describe('YouTubeExceptionMapper — hygiène', () => {
  it('ne renvoie jamais le corps brut de la réponse Google', () => {
    const error = {
      response: {
        status: 403,
        data: {
          error: {
            code: 403,
            message: 'refusé',
            errors: [{ reason: 'forbidden' }],
          },
          access_token: 'ne-doit-pas-fuiter',
        },
      },
    }

    const dump = JSON.stringify(mapper.map(error))
    expect(dump).not.toContain('ne-doit-pas-fuiter')
    expect(dump).not.toContain('response')
  })

  it('préconditions : helpers dédiés', () => {
    expect(mapper.forUploadScopeMissing().reason).toBe(
      YouTubeErrorReason.UPLOAD_SCOPE_MISSING,
    )
    expect(mapper.forChannelNotFound().reason).toBe(
      YouTubeErrorReason.CHANNEL_NOT_FOUND,
    )
    expect(mapper.forInvalidParameter().reason).toBe(
      YouTubeErrorReason.INVALID_PARAMETER,
    )
    expect(
      mapper.forInvalidParameter(YouTubeErrorReason.INVALID_VIDEO).reason,
    ).toBe(YouTubeErrorReason.INVALID_VIDEO)
  })
})
