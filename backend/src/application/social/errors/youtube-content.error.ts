import { BadGatewayException } from '@nestjs/common'

/// Forme normalisée d'une erreur de publication YouTube, extraite du transport.
/// C'est l'entrée de YouTubeExceptionMapper. Miroir de LinkedInErrorPayload.
export interface YouTubeErrorPayload {
  /// Code logique interne ou dérivé de Google
  /// (ex. `publishing_not_configured`, `upload_failed`, `network_timeout`).
  serviceErrorCode: string
  /// Statut HTTP si disponible (0 sinon).
  httpStatus: number
  /// Motif Google (`reason` d'un item de `error.errors[]`, ex. `quotaExceeded`,
  /// `uploadLimitExceeded`, `youtubeSignupRequired`). Jamais un corps complet.
  googleReason?: string
  message: string
}

/// Erreur levée par un adaptateur de publication YouTube quand un appel échoue.
/// Étend BadGatewayException (502 par défaut), comme LinkedInContentError.
///
/// ⚠️ Ne doit JAMAIS transporter : access token, refresh token, URL de session
/// d'upload, corps de la vidéo, client_secret ni en-tête Authorization.
export class YouTubeContentError extends BadGatewayException {
  constructor(readonly youtube: YouTubeErrorPayload) {
    super(
      `Échec YouTube Data API (${youtube.serviceErrorCode}): ${youtube.message}`,
    )
    this.name = 'YouTubeContentError'
  }
}

/// Forme partielle d'une erreur axios portant une réponse Google.
interface AxiosLikeError {
  code?: string
  message?: string
  response?: {
    status?: number
    data?: {
      error?: {
        code?: number
        message?: string
        status?: string
        errors?: { reason?: string; message?: string }[]
      }
    }
  }
}

function asAxiosLike(error: unknown): AxiosLikeError | null {
  return typeof error === 'object' && error !== null
    ? (error as AxiosLikeError)
    : null
}

/// Codes réseau transitoires (aucune réponse HTTP) → assimilés à un timeout.
const NETWORK_TIMEOUT_CODES = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNABORTED',
])

/// Extraction unique d'un payload YouTube normalisé depuis n'importe quelle
/// erreur : YouTubeContentError, erreur axios Google, timeout réseau, inconnu.
///
/// N'extrait que des champs de diagnostic (statut, `reason`, message) — jamais
/// le corps brut, jamais un en-tête.
export function extractYouTubeErrorPayload(error: unknown): YouTubeErrorPayload {
  if (error instanceof YouTubeContentError) {
    return error.youtube
  }

  const axiosError = asAxiosLike(error)
  const googleError = axiosError?.response?.data?.error
  const status = axiosError?.response?.status ?? googleError?.code
  if (typeof status === 'number' && status > 0) {
    const reason = googleError?.errors?.[0]?.reason
    return {
      serviceErrorCode: reason ?? googleError?.status ?? String(status),
      httpStatus: status,
      ...(reason !== undefined ? { googleReason: reason } : {}),
      message: googleError?.message ?? `Erreur YouTube (HTTP ${status})`,
    }
  }

  const isTimeout =
    (typeof axiosError?.code === 'string' &&
      NETWORK_TIMEOUT_CODES.has(axiosError.code)) ||
    (typeof axiosError?.message === 'string' &&
      /timeout|timed out/i.test(axiosError.message))
  if (isTimeout) {
    return {
      serviceErrorCode: 'network_timeout',
      httpStatus: 0,
      message: axiosError?.message ?? 'Délai dépassé',
    }
  }

  const message = error instanceof Error ? error.message : String(error)
  return { serviceErrorCode: 'unknown', httpStatus: 0, message }
}
