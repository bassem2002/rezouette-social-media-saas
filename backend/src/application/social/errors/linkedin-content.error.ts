import { BadGatewayException } from '@nestjs/common'

/// Forme normalisée d'une erreur LinkedIn, extraite du transport (axios/API) :
/// code logique (serviceErrorCode LinkedIn ou dérivé), statut HTTP et message
/// lisible. C'est l'entrée de LinkedInExceptionMapper.
export interface LinkedInErrorPayload {
  /// Code logique LinkedIn (serviceErrorCode) ou marqueur interne
  /// (ex. `publishing_not_configured`, `media_upload_failed`, `network_timeout`).
  serviceErrorCode: string
  /// Statut HTTP si disponible (0 sinon).
  httpStatus: number
  message: string
}

/// Erreur levée par un adaptateur de publication LinkedIn quand un appel échoue.
/// Étend BadGatewayException (502 par défaut). Porte le payload LinkedIn normalisé.
export class LinkedInContentError extends BadGatewayException {
  constructor(readonly linkedin: LinkedInErrorPayload) {
    super(
      `Échec LinkedIn Content API (${linkedin.serviceErrorCode}): ${linkedin.message}`,
    )
    this.name = 'LinkedInContentError'
  }
}

/// Forme partielle d'une erreur axios portant une réponse LinkedIn.
interface AxiosLikeError {
  code?: string
  message?: string
  response?: {
    status?: number
    data?: {
      message?: string
      serviceErrorCode?: number | string
      code?: string
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

/// Extraction unique (DRY) d'un payload LinkedIn normalisé depuis n'importe quelle
/// erreur : LinkedInContentError, erreur API axios (status + message), timeout
/// réseau, inconnu. Ne lit jamais d'en-tête Authorization (aucun secret).
export function extractLinkedInErrorPayload(error: unknown): LinkedInErrorPayload {
  if (error instanceof LinkedInContentError) {
    return error.linkedin
  }

  const axiosError = asAxiosLike(error)
  const data = axiosError?.response?.data
  const status = axiosError?.response?.status
  if (typeof status === 'number' && status > 0) {
    return {
      serviceErrorCode: String(data?.serviceErrorCode ?? data?.code ?? status),
      httpStatus: status,
      message: data?.message ?? `Erreur LinkedIn (HTTP ${status})`,
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
