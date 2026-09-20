import { BadGatewayException } from '@nestjs/common'

/// Forme normalisée d'une erreur Meta, extraite du transport (axios/Graph) :
/// `code`/`subcode` Graph + message lisible. C'est l'entrée de MetaExceptionMapper.
export interface MetaErrorPayload {
  code: number
  subcode?: number
  message: string
}

/// Erreur levée par la passerelle Graph quand un appel Meta échoue. Étend
/// BadGatewayException pour préserver le comportement HTTP 502 des endpoints qui
/// ne passent pas par le PublicationRecorder (test-post, debug profil). Porte en
/// plus le payload Meta normalisé pour classification par MetaExceptionMapper.
export class MetaGraphError extends BadGatewayException {
  constructor(readonly meta: MetaErrorPayload) {
    super(`Échec Graph API Meta (code ${meta.code}): ${meta.message}`)
    this.name = 'MetaGraphError'
  }
}

/// Forme partielle d'une erreur axios portant une réponse Graph.
interface AxiosLikeError {
  code?: string
  message?: string
  response?: {
    data?: {
      error?: {
        message?: string
        code?: number
        error_subcode?: number
        error_user_msg?: string
      }
    }
  }
}

function asAxiosLike(error: unknown): AxiosLikeError | null {
  return typeof error === 'object' && error !== null
    ? (error as AxiosLikeError)
    : null
}

/// Extraction unique (DRY) d'un payload Meta normalisé depuis n'importe quelle
/// erreur. Gère : MetaGraphError, erreur Graph axios, timeout réseau, inconnu.
/// - réponse Graph `error.code`/`error_subcode` → tels quels
/// - timeout/abort réseau → code -2
/// - sinon → code 1 (UNKNOWN_META_ERROR)
export function extractMetaErrorPayload(error: unknown): MetaErrorPayload {
  if (error instanceof MetaGraphError) {
    return error.meta
  }

  const axiosError = asAxiosLike(error)
  const graphError = axiosError?.response?.data?.error
  if (graphError && typeof graphError.code === 'number') {
    return {
      code: graphError.code,
      subcode: graphError.error_subcode,
      message:
        graphError.error_user_msg ?? graphError.message ?? 'Erreur Meta inconnue',
    }
  }

  const isTimeout =
    axiosError?.code === 'ECONNABORTED' ||
    (typeof axiosError?.message === 'string' &&
      /timeout|timed out/i.test(axiosError.message))
  if (isTimeout) {
    return { code: -2, message: axiosError?.message ?? 'Délai dépassé' }
  }

  const message = error instanceof Error ? error.message : String(error)
  return { code: 1, message }
}
