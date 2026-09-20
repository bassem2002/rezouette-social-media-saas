import { Injectable } from '@nestjs/common'
import { LinkedInErrorReason } from '../../../domain/social/errors/linkedin-error-reason.enum.js'
import {
  extractLinkedInErrorPayload,
  type LinkedInErrorPayload,
} from '../errors/linkedin-content.error.js'
import type { MappedPublicationError } from './mapped-publication-error.js'

/// Action recommandée face à une erreur LinkedIn (vocabulaire aligné sur Meta/TikTok
/// pour une présentation homogène).
export enum LinkedInErrorAction {
  RECONNECT_ACCOUNT = 'RECONNECT_ACCOUNT',
  REVIEW_PERMISSIONS = 'REVIEW_PERMISSIONS',
  REQUEST_PRODUCT_ACCESS = 'REQUEST_PRODUCT_ACCESS',
  CONFIGURE_PUBLISHING = 'CONFIGURE_PUBLISHING',
  FIX_REQUEST = 'FIX_REQUEST',
  RETRY_LATER = 'RETRY_LATER',
  CONTACT_SUPPORT = 'CONTACT_SUPPORT',
}

/// Point UNIQUE de traduction des erreurs LinkedIn en erreurs métier normalisées.
/// Toute la classification (statut HTTP / serviceErrorCode → raison/action/retryable)
/// vit ici. Équivalent LinkedIn de MetaExceptionMapper / TikTokExceptionMapper —
/// produit le même contrat générique MappedPublicationError.
@Injectable()
export class LinkedInExceptionMapper {
  /// Transforme n'importe quelle erreur (axios, LinkedInContentError, timeout) en
  /// erreur métier standardisée.
  map(error: unknown): MappedPublicationError {
    return this.classify(extractLinkedInErrorPayload(error))
  }

  /// Message lisible extrait de l'erreur (pour l'historique et le client).
  describe(error: unknown): string {
    return extractLinkedInErrorPayload(error).message
  }

  /// Blocage en amont : token expiré / non rafraîchissable → reconnexion requise
  /// (LinkedIn n'émet pas de refresh token pour une app standard).
  forReconnectRequired(): MappedPublicationError {
    return {
      code: 401,
      reason: LinkedInErrorReason.RECONNECT_REQUIRED,
      retryable: false,
      action: LinkedInErrorAction.RECONNECT_ACCOUNT,
    }
  }

  /// Publication non configurée (LINKEDIN_PUBLISH_API=disabled) — aucun appel réseau.
  forPublishingNotConfigured(): MappedPublicationError {
    return {
      code: 503,
      reason: LinkedInErrorReason.PUBLISHING_NOT_CONFIGURED,
      retryable: false,
      action: LinkedInErrorAction.CONFIGURE_PUBLISHING,
    }
  }

  /// Précondition invalide côté Zernio (ex. aucun contenu à publier).
  forInvalidParameter(): MappedPublicationError {
    return {
      code: 400,
      reason: LinkedInErrorReason.INVALID_PARAMETER,
      retryable: false,
      action: LinkedInErrorAction.FIX_REQUEST,
    }
  }

  private classify(payload: LinkedInErrorPayload): MappedPublicationError {
    const code = payload.serviceErrorCode.toLowerCase()
    const message = payload.message.toLowerCase()
    const http = payload.httpStatus

    if (code === 'publishing_not_configured') {
      return this.forPublishingNotConfigured()
    }
    if (code === 'media_upload_failed') {
      return {
        code: http || 502,
        reason: LinkedInErrorReason.MEDIA_UPLOAD_FAILED,
        retryable: true,
        action: LinkedInErrorAction.RETRY_LATER,
      }
    }
    if (code === 'network_timeout' || message.includes('timeout')) {
      return {
        code: http || 0,
        reason: LinkedInErrorReason.TIMEOUT,
        retryable: true,
        action: LinkedInErrorAction.RETRY_LATER,
      }
    }

    if (http === 401) {
      return {
        code: 401,
        reason: LinkedInErrorReason.TOKEN_EXPIRED,
        retryable: false,
        action: LinkedInErrorAction.RECONNECT_ACCOUNT,
      }
    }
    if (http === 403) {
      // 403 lié à l'endpoint/produit versionné non provisionné vs scope manquant.
      if (
        message.includes('/rest/posts') ||
        message.includes('versioned') ||
        message.includes('product') ||
        message.includes('not been provisioned')
      ) {
        return {
          code: 403,
          reason: LinkedInErrorReason.PRODUCT_NOT_APPROVED,
          retryable: false,
          action: LinkedInErrorAction.REQUEST_PRODUCT_ACCESS,
        }
      }
      return {
        code: 403,
        reason: LinkedInErrorReason.PERMISSION_DENIED,
        retryable: false,
        action: LinkedInErrorAction.REVIEW_PERMISSIONS,
      }
    }
    if (http === 429) {
      return {
        code: 429,
        reason: LinkedInErrorReason.RATE_LIMITED,
        retryable: true,
        action: LinkedInErrorAction.RETRY_LATER,
      }
    }
    if (http === 422) {
      if (
        message.includes('media') ||
        message.includes('image') ||
        message.includes('asset')
      ) {
        return {
          code: 422,
          reason: LinkedInErrorReason.INVALID_MEDIA,
          retryable: false,
          action: LinkedInErrorAction.FIX_REQUEST,
        }
      }
      return {
        code: 422,
        reason: LinkedInErrorReason.INVALID_PARAMETER,
        retryable: false,
        action: LinkedInErrorAction.FIX_REQUEST,
      }
    }
    if (http === 400) {
      if (message.includes('author') || message.includes('urn')) {
        return {
          code: 400,
          reason: LinkedInErrorReason.INVALID_AUTHOR,
          retryable: false,
          action: LinkedInErrorAction.FIX_REQUEST,
        }
      }
      return {
        code: 400,
        reason: LinkedInErrorReason.INVALID_PARAMETER,
        retryable: false,
        action: LinkedInErrorAction.FIX_REQUEST,
      }
    }

    return {
      code: http || 0,
      reason: LinkedInErrorReason.UNKNOWN_LINKEDIN_ERROR,
      retryable: false,
      action: LinkedInErrorAction.CONTACT_SUPPORT,
    }
  }
}
