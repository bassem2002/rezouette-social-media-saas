import { Injectable } from '@nestjs/common'
import { YouTubeErrorReason } from '../../../domain/social/errors/youtube-error-reason.enum.js'
import {
  extractYouTubeErrorPayload,
  type YouTubeErrorPayload,
} from '../errors/youtube-content.error.js'
import {
  YouTubeTokenError,
  YouTubeTokenErrorCode,
} from '../errors/youtube-token.error.js'
import type { MappedPublicationError } from './mapped-publication-error.js'

/// Action recommandée face à une erreur YouTube (vocabulaire aligné sur
/// Meta/TikTok/LinkedIn pour une présentation homogène).
export enum YouTubeErrorAction {
  RECONNECT_ACCOUNT = 'RECONNECT_ACCOUNT',
  REVIEW_PERMISSIONS = 'REVIEW_PERMISSIONS',
  CONFIGURE_PUBLISHING = 'CONFIGURE_PUBLISHING',
  FIX_REQUEST = 'FIX_REQUEST',
  RETRY_LATER = 'RETRY_LATER',
  RETRY_TOMORROW = 'RETRY_TOMORROW',
  /// La vidéo est partie chez YouTube : son état se vérifie dans YouTube Studio.
  CHECK_YOUTUBE = 'CHECK_YOUTUBE',
  CONTACT_SUPPORT = 'CONTACT_SUPPORT',
}

/// Motifs Google (`error.errors[].reason`) signalant un dépassement de quota
/// d'API, distinct de la limite quotidienne d'envois d'une chaîne.
const QUOTA_REASONS = new Set([
  'quotaExceeded',
  'dailyLimitExceeded',
  'rateLimitExceeded',
  'userRateLimitExceeded',
])
const UPLOAD_LIMIT_REASONS = new Set([
  'uploadLimitExceeded',
  'numberOfVideosUploadedExceeded',
])

/// Codes d'accès au média local : la vidéo demandée n'est pas exploitable.
/// Tous convergent vers INVALID_VIDEO — c'est la requête qu'il faut corriger.
const MEDIA_ERROR_CODES = new Set([
  'media_not_managed_by_zernio',
  'media_not_found',
  'invalid_media_type',
  'empty_media',
  'invalid_media_range',
])

/// Échecs du transfert lui-même : transitoires par nature, un réessai plus tard
/// a du sens (une nouvelle session sera ouverte).
const UPLOAD_FAILURE_CODES = new Set([
  'upload_session_creation_failed',
  'upload_session_location_missing',
  'upload_session_location_invalid',
  'upload_interrupted',
])

/// Point UNIQUE de traduction des erreurs YouTube en erreurs métier normalisées.
/// Couvre trois familles : les erreurs de transport (`YouTubeContentError`), les
/// erreurs de cycle de vie du token (`YouTubeTokenError`) et les préconditions
/// applicatives. Produit toujours le contrat commun `MappedPublicationError`.
///
/// Ne renvoie JAMAIS le corps brut d'une erreur Google.
@Injectable()
export class YouTubeExceptionMapper {
  map(error: unknown): MappedPublicationError {
    // Les erreurs de token précèdent la classification transport : elles portent
    // déjà un diagnostic exact, inutile de le deviner depuis un statut HTTP.
    if (error instanceof YouTubeTokenError) {
      return this.fromTokenError(error)
    }
    return this.classify(extractYouTubeErrorPayload(error))
  }

  /// Message lisible extrait de l'erreur (pour l'historique et le client).
  describe(error: unknown): string {
    if (error instanceof YouTubeTokenError) return error.message
    return extractYouTubeErrorPayload(error).message
  }

  /// Publication non configurée / adaptateur désactivé — aucun appel réseau.
  forPublishingNotConfigured(): MappedPublicationError {
    return {
      code: 503,
      reason: YouTubeErrorReason.PUBLISHING_NOT_CONFIGURED,
      retryable: false,
      action: YouTubeErrorAction.CONFIGURE_PUBLISHING,
    }
  }

  /// Le scope `youtube.upload` n'a pas été accordé : publication impossible.
  forUploadScopeMissing(): MappedPublicationError {
    return {
      code: 403,
      reason: YouTubeErrorReason.UPLOAD_SCOPE_MISSING,
      retryable: false,
      action: YouTubeErrorAction.RECONNECT_ACCOUNT,
    }
  }

  /// Chaîne cible introuvable pour cet utilisateur.
  forChannelNotFound(): MappedPublicationError {
    return {
      code: 404,
      reason: YouTubeErrorReason.CHANNEL_NOT_FOUND,
      retryable: false,
      action: YouTubeErrorAction.FIX_REQUEST,
    }
  }

  /// Précondition invalide côté Zernio (payload métier incorrect).
  forInvalidParameter(
    reason: YouTubeErrorReason = YouTubeErrorReason.INVALID_PARAMETER,
  ): MappedPublicationError {
    return {
      code: 400,
      reason,
      retryable: false,
      action: YouTubeErrorAction.FIX_REQUEST,
    }
  }

  /// Traduit une erreur du cycle de vie du token (CHECKPOINT 4).
  private fromTokenError(error: YouTubeTokenError): MappedPublicationError {
    switch (error.code) {
      case YouTubeTokenErrorCode.YOUTUBE_RECONNECT_REQUIRED:
        return {
          code: 401,
          reason: YouTubeErrorReason.RECONNECT_REQUIRED,
          retryable: false,
          action: YouTubeErrorAction.RECONNECT_ACCOUNT,
        }
      case YouTubeTokenErrorCode.YOUTUBE_REFRESH_TOKEN_MISSING:
        return {
          code: 401,
          reason: YouTubeErrorReason.REFRESH_TOKEN_MISSING,
          retryable: false,
          action: YouTubeErrorAction.RECONNECT_ACCOUNT,
        }
      case YouTubeTokenErrorCode.YOUTUBE_ACCOUNT_NOT_FOUND:
        return this.forChannelNotFound()
      case YouTubeTokenErrorCode.YOUTUBE_NOT_CONFIGURED:
        return this.forPublishingNotConfigured()
      case YouTubeTokenErrorCode.YOUTUBE_TOKEN_REFRESH_FAILED:
        // Incident transitoire : le token reste valide côté Google, réessayer
        // plus tard a du sens (contrairement à une révocation).
        return {
          code: 502,
          reason: YouTubeErrorReason.TOKEN_EXPIRED,
          retryable: error.retryable,
          action: YouTubeErrorAction.RETRY_LATER,
        }
      case YouTubeTokenErrorCode.YOUTUBE_INVALID_REFRESH_RESPONSE:
      case YouTubeTokenErrorCode.YOUTUBE_CREDENTIAL_GROUP_CONFLICT:
      default:
        return {
          code: 502,
          reason: YouTubeErrorReason.UNKNOWN_YOUTUBE_ERROR,
          retryable: false,
          action: YouTubeErrorAction.CONTACT_SUPPORT,
        }
    }
  }

  private classify(payload: YouTubeErrorPayload): MappedPublicationError {
    const code = payload.serviceErrorCode.toLowerCase()
    const message = payload.message.toLowerCase()
    const reason = payload.googleReason ?? ''
    const http = payload.httpStatus

    if (code === 'publishing_not_configured') {
      return this.forPublishingNotConfigured()
    }
    if (code === 'network_timeout' || message.includes('timeout')) {
      return {
        code: http || 0,
        reason: YouTubeErrorReason.TIMEOUT,
        retryable: true,
        action: YouTubeErrorAction.RETRY_LATER,
      }
    }
    // Média local refusé : URL non gérée par Zernio, fichier absent, vide, de
    // mauvais type, ou plage incohérente. Toujours une erreur de requête.
    if (MEDIA_ERROR_CODES.has(code)) {
      return this.forInvalidParameter(YouTubeErrorReason.INVALID_VIDEO)
    }
    if (code === 'upload_failed' || UPLOAD_FAILURE_CODES.has(code)) {
      return {
        code: http || 502,
        reason: YouTubeErrorReason.UPLOAD_FAILED,
        retryable: true,
        action: YouTubeErrorAction.RETRY_LATER,
      }
    }
    if (code === 'upload_session_expired') {
      return {
        code: http || 410,
        reason: YouTubeErrorReason.UPLOAD_SESSION_EXPIRED,
        retryable: true,
        action: YouTubeErrorAction.RETRY_LATER,
      }
    }
    // ── Réconciliation du traitement ────────────────────────────────────────
    if (code === 'video_not_found') {
      // Le use case décide seul s'il patiente (délai de grâce) ou conclut :
      // ce mapping ne présume donc d'aucun réessai automatique.
      return {
        code: http || 404,
        reason: YouTubeErrorReason.VIDEO_NOT_FOUND,
        retryable: false,
        action: YouTubeErrorAction.CHECK_YOUTUBE,
      }
    }
    if (code === 'processing_timeout') {
      return {
        code: http || 0,
        reason: YouTubeErrorReason.TIMEOUT,
        retryable: true,
        action: YouTubeErrorAction.RETRY_LATER,
      }
    }
    if (code === 'processing_rate_limited') {
      return {
        code: http || 429,
        reason: YouTubeErrorReason.RATE_LIMITED,
        retryable: true,
        action: YouTubeErrorAction.RETRY_LATER,
      }
    }
    if (code === 'processing_request_failed') {
      return {
        code: http || 502,
        reason: YouTubeErrorReason.PROCESSING_FAILED,
        retryable: true,
        action: YouTubeErrorAction.RETRY_LATER,
      }
    }
    if (code === 'processing_permission_denied') {
      return {
        code: http || 403,
        reason: YouTubeErrorReason.PERMISSION_DENIED,
        retryable: false,
        action: YouTubeErrorAction.REVIEW_PERMISSIONS,
      }
    }
    if (code === 'processing_response_invalid') {
      // Réponse inexploitable : terminal. Sonder à l'infini une réponse que
      // l'on ne sait pas lire ne ferait que consommer du quota.
      return {
        code: http || 502,
        reason: YouTubeErrorReason.PROCESSING_FAILED,
        retryable: false,
        action: YouTubeErrorAction.CHECK_YOUTUBE,
      }
    }

    // Réponse Google inexploitable : ne pas prétendre à un échec définitif —
    // l'état de la vidéo est indéterminé, un réessai à l'aveugle créerait un
    // doublon. Non retryable automatiquement.
    if (code === 'upload_response_invalid') {
      return {
        code: http || 502,
        reason: YouTubeErrorReason.UPLOAD_FAILED,
        retryable: false,
        action: YouTubeErrorAction.CONTACT_SUPPORT,
      }
    }

    // Limite d'envois d'une chaîne : distincte du quota d'unités de l'API, et
    // seule la première se réinitialise à la journée suivante.
    if (UPLOAD_LIMIT_REASONS.has(reason)) {
      return {
        code: http || 403,
        reason: YouTubeErrorReason.DAILY_UPLOAD_LIMIT,
        retryable: false,
        action: YouTubeErrorAction.RETRY_TOMORROW,
      }
    }
    if (QUOTA_REASONS.has(reason)) {
      return {
        code: http || 403,
        reason: YouTubeErrorReason.QUOTA_EXCEEDED,
        retryable: true,
        action: YouTubeErrorAction.RETRY_TOMORROW,
      }
    }

    if (http === 401) {
      return {
        code: 401,
        reason: YouTubeErrorReason.TOKEN_EXPIRED,
        retryable: false,
        action: YouTubeErrorAction.RECONNECT_ACCOUNT,
      }
    }
    if (http === 403) {
      if (reason === 'youtubeSignupRequired' || message.includes('no channel')) {
        return this.forChannelNotFound()
      }
      if (
        reason === 'insufficientPermissions' ||
        message.includes('insufficient') ||
        message.includes('scope')
      ) {
        return this.forUploadScopeMissing()
      }
      return {
        code: 403,
        reason: YouTubeErrorReason.PERMISSION_DENIED,
        retryable: false,
        action: YouTubeErrorAction.REVIEW_PERMISSIONS,
      }
    }
    if (http === 429) {
      return {
        code: 429,
        reason: YouTubeErrorReason.RATE_LIMITED,
        retryable: true,
        action: YouTubeErrorAction.RETRY_LATER,
      }
    }
    if (http === 404) {
      return this.forChannelNotFound()
    }
    if (http === 400) {
      if (reason === 'invalidTitle' || message.includes('title')) {
        return this.forInvalidParameter(YouTubeErrorReason.INVALID_TITLE)
      }
      if (reason === 'invalidCategoryId' || message.includes('category')) {
        return this.forInvalidParameter(YouTubeErrorReason.INVALID_CATEGORY)
      }
      if (
        reason === 'invalidVideoMetadata' ||
        reason === 'mediaBodyRequired' ||
        message.includes('video')
      ) {
        return this.forInvalidParameter(YouTubeErrorReason.INVALID_VIDEO)
      }
      return this.forInvalidParameter()
    }
    if (http >= 500) {
      return {
        code: http,
        reason: YouTubeErrorReason.UPLOAD_FAILED,
        retryable: true,
        action: YouTubeErrorAction.RETRY_LATER,
      }
    }

    return {
      code: http || 0,
      reason: YouTubeErrorReason.UNKNOWN_YOUTUBE_ERROR,
      retryable: false,
      action: YouTubeErrorAction.CONTACT_SUPPORT,
    }
  }
}
