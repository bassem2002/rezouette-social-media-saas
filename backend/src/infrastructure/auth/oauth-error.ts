import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'

/// Codes d'erreur OAuth normalisés, partagés par les flux LinkedIn et YouTube.
/// Le code est stable et exploitable par un client ; le message reste lisible.
/// AUCUN de ces messages ne doit contenir de token, de secret, de code OAuth,
/// de code_verifier ni de `state` complet.
export const OAuthErrorCode = {
  YOUTUBE_NOT_CONFIGURED: 'YOUTUBE_NOT_CONFIGURED',
  OAUTH_STATE_NOT_CONFIGURED: 'OAUTH_STATE_NOT_CONFIGURED',
  INVALID_STATE: 'INVALID_STATE',
  STATE_EXPIRED: 'STATE_EXPIRED',
  PROVIDER_MISMATCH: 'PROVIDER_MISMATCH',
  INVALID_NONCE: 'INVALID_NONCE',
  NONCE_REPLAYED: 'NONCE_REPLAYED',
  PKCE_VERIFIER_NOT_FOUND: 'PKCE_VERIFIER_NOT_FOUND',
  PKCE_VERIFIER_EXPIRED: 'PKCE_VERIFIER_EXPIRED',
  GOOGLE_ACCESS_DENIED: 'GOOGLE_ACCESS_DENIED',
  TOKEN_EXCHANGE_FAILED: 'TOKEN_EXCHANGE_FAILED',
  INVALID_TOKEN_RESPONSE: 'INVALID_TOKEN_RESPONSE',
  CHANNEL_NOT_FOUND: 'CHANNEL_NOT_FOUND',
  YOUTUBE_CHANNEL_FETCH_FAILED: 'YOUTUBE_CHANNEL_FETCH_FAILED',
  MISSING_OAUTH_PARAMETERS: 'MISSING_OAUTH_PARAMETERS',
} as const

export type OAuthErrorCode = (typeof OAuthErrorCode)[keyof typeof OAuthErrorCode]

/// Corps de réponse d'une erreur OAuth. `message` est repris par NestJS comme
/// message de l'exception (HttpException.initMessage), ce qui garde les tests et
/// les logs lisibles sans exposer de donnée sensible.
interface OAuthErrorBody {
  code: OAuthErrorCode
  message: string
}

function body(code: OAuthErrorCode, message: string): OAuthErrorBody {
  return { code, message }
}

/// 503 — l'intégration n'est pas configurée (aucun appel réseau n'est tenté).
export function oauthUnavailable(
  code: OAuthErrorCode,
  message: string,
): ServiceUnavailableException {
  return new ServiceUnavailableException(body(code, message))
}

/// 400 — paramètre OAuth invalide, expiré, rejoué ou manquant.
export function oauthBadRequest(
  code: OAuthErrorCode,
  message: string,
): BadRequestException {
  return new BadRequestException(body(code, message))
}

/// 401 — échange de code ou réponse de token refusée par le fournisseur.
export function oauthUnauthorized(
  code: OAuthErrorCode,
  message: string,
): UnauthorizedException {
  return new UnauthorizedException(body(code, message))
}

/// 404 — le compte autorisé n'expose aucune cible publiable.
export function oauthNotFound(
  code: OAuthErrorCode,
  message: string,
): NotFoundException {
  return new NotFoundException(body(code, message))
}

/// 502 — le fournisseur a répondu de façon inexploitable côté lecture.
export function oauthBadGateway(
  code: OAuthErrorCode,
  message: string,
): BadGatewayException {
  return new BadGatewayException(body(code, message))
}
