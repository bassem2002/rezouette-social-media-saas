import { BadGatewayException } from '@nestjs/common'

/// Forme normalisée d'une erreur TikTok, extraite du transport (axios/API) :
/// `errorCode` (chaîne TikTok, ex. `access_token_invalid`), statut HTTP éventuel
/// et message lisible. C'est l'entrée de TikTokExceptionMapper.
export interface TikTokErrorPayload {
  /// Code d'erreur logique TikTok (chaîne), ex. `spam_risk_too_many_posts`.
  errorCode: string
  /// Statut HTTP si disponible (0 sinon).
  httpStatus: number
  message: string
}

/// Erreur levée par la passerelle Content Posting quand un appel TikTok échoue.
/// Étend BadGatewayException (HTTP 502 pour les endpoints qui ne passent pas par
/// l'enregistrement d'historique). Porte le payload TikTok normalisé + le
/// `publish_id` éventuel (utile au diagnostic/reconciliation asynchrone).
export class TikTokContentError extends BadGatewayException {
  constructor(
    readonly tiktok: TikTokErrorPayload,
    readonly publishId?: string,
  ) {
    super(`Échec TikTok Content API (${tiktok.errorCode}): ${tiktok.message}`)
    this.name = 'TikTokContentError'
  }
}

/// Forme partielle d'une erreur axios portant une réponse TikTok.
interface AxiosLikeError {
  code?: string
  message?: string
  response?: {
    status?: number
    data?: {
      error?: {
        code?: string
        message?: string
        log_id?: string
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

/// Extraction unique (DRY) d'un payload TikTok normalisé depuis n'importe quelle
/// erreur. Gère : TikTokContentError, erreur API axios (`error.code` chaîne),
/// timeout/abort réseau, inconnu.
export function extractTikTokErrorPayload(error: unknown): TikTokErrorPayload {
  if (error instanceof TikTokContentError) {
    return error.tiktok
  }

  const axiosError = asAxiosLike(error)
  const apiError = axiosError?.response?.data?.error
  if (apiError && typeof apiError.code === 'string' && apiError.code !== 'ok') {
    return {
      errorCode: apiError.code,
      httpStatus: axiosError?.response?.status ?? 0,
      message: apiError.message ?? 'Erreur TikTok inconnue',
    }
  }

  const isTimeout =
    (typeof axiosError?.code === 'string' &&
      NETWORK_TIMEOUT_CODES.has(axiosError.code)) ||
    (typeof axiosError?.message === 'string' &&
      /timeout|timed out/i.test(axiosError.message))
  if (isTimeout) {
    return {
      errorCode: 'network_timeout',
      httpStatus: 0,
      message: axiosError?.message ?? 'Délai dépassé',
    }
  }

  const message = error instanceof Error ? error.message : String(error)
  return { errorCode: 'unknown', httpStatus: 0, message }
}
