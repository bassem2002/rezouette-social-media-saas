import { Injectable } from '@nestjs/common'
import { TikTokErrorReason } from '../../../domain/social/errors/tiktok-error-reason.enum.js'
import {
  extractTikTokErrorPayload,
  type TikTokErrorPayload,
} from '../errors/tiktok-content.error.js'
import type { MappedPublicationError } from './mapped-publication-error.js'

/// Action recommandée au consommateur face à une erreur TikTok (vocabulaire
/// aligné sur MetaErrorAction pour une présentation homogène).
export enum TikTokErrorAction {
  REFRESH_TOKEN = 'REFRESH_TOKEN',
  RECONNECT_ACCOUNT = 'RECONNECT_ACCOUNT',
  REVIEW_PERMISSIONS = 'REVIEW_PERMISSIONS',
  WAIT_OR_RECONNECT = 'WAIT_OR_RECONNECT',
  FIX_REQUEST = 'FIX_REQUEST',
  RETRY_LATER = 'RETRY_LATER',
  CONTACT_SUPPORT = 'CONTACT_SUPPORT',
}

/// Table de correspondance code TikTok → classification. Les codes proviennent
/// de la Content Posting API (chaînes). On les regroupe par famille de raison.
const CODE_RULES: {
  match: (code: string) => boolean
  reason: TikTokErrorReason
  retryable: boolean
  action: TikTokErrorAction
}[] = [
  {
    match: (c) => c.includes('access_token') || c.includes('token_invalid'),
    reason: TikTokErrorReason.TOKEN_EXPIRED,
    retryable: false,
    action: TikTokErrorAction.REFRESH_TOKEN,
  },
  {
    match: (c) => c.includes('scope') || c.includes('permission'),
    reason: TikTokErrorReason.PERMISSION_DENIED,
    retryable: false,
    action: TikTokErrorAction.REVIEW_PERMISSIONS,
  },
  {
    match: (c) => c.includes('rate_limit'),
    reason: TikTokErrorReason.RATE_LIMITED,
    retryable: true,
    action: TikTokErrorAction.RETRY_LATER,
  },
  {
    match: (c) => c.includes('spam') || c.includes('banned'),
    reason: TikTokErrorReason.SPAM_RISK,
    retryable: false,
    action: TikTokErrorAction.WAIT_OR_RECONNECT,
  },
  {
    match: (c) =>
      c.includes('file') ||
      c.includes('format') ||
      c.includes('video') ||
      c.includes('url_ownership') ||
      c.includes('privacy') ||
      c.includes('frame_rate') ||
      c.includes('duration') ||
      c.includes('picture_size'),
    reason: TikTokErrorReason.INVALID_MEDIA,
    retryable: false,
    action: TikTokErrorAction.FIX_REQUEST,
  },
  {
    match: (c) => c.includes('publish_failed') || c.includes('processing'),
    reason: TikTokErrorReason.PUBLISH_FAILED,
    retryable: true,
    action: TikTokErrorAction.RETRY_LATER,
  },
  {
    match: (c) => c.includes('timeout'),
    reason: TikTokErrorReason.TIMEOUT,
    retryable: true,
    action: TikTokErrorAction.RETRY_LATER,
  },
]

/// Point UNIQUE de traduction des erreurs TikTok Content API en erreurs métier.
/// Toute la logique de classification (code → raison/action/retryable) vit ici :
/// aucun autre composant n'interprète les codes TikTok. Équivalent TikTok de
/// MetaExceptionMapper — produit le même contrat générique MappedPublicationError.
@Injectable()
export class TikTokExceptionMapper {
  /// Transforme n'importe quelle erreur (axios, TikTokContentError, timeout) en
  /// erreur métier standardisée.
  map(error: unknown): MappedPublicationError {
    return this.classify(extractTikTokErrorPayload(error))
  }

  /// Message lisible extrait de l'erreur (pour l'historique et le client).
  describe(error: unknown): string {
    return extractTikTokErrorPayload(error).message
  }

  /// Erreur normalisée pour le blocage en amont quand le token est expiré et
  /// non rafraîchissable (refresh token invalide) : reconnexion requise.
  forReconnectRequired(): MappedPublicationError {
    return {
      code: 401,
      reason: TikTokErrorReason.RECONNECT_REQUIRED,
      retryable: false,
      action: TikTokErrorAction.RECONNECT_ACCOUNT,
    }
  }

  private classify(payload: TikTokErrorPayload): MappedPublicationError {
    const code = payload.errorCode.toLowerCase()
    const rule = CODE_RULES.find((r) => r.match(code))
    if (rule) {
      return {
        code: payload.httpStatus,
        reason: rule.reason,
        retryable: rule.retryable,
        action: rule.action,
      }
    }
    return {
      code: payload.httpStatus,
      reason: TikTokErrorReason.UNKNOWN_TIKTOK_ERROR,
      retryable: false,
      action: TikTokErrorAction.CONTACT_SUPPORT,
    }
  }
}
