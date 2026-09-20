import { Injectable } from '@nestjs/common'
import { MetaErrorReason } from '../../../domain/social/errors/meta-error-reason.enum.js'
import {
  extractMetaErrorPayload,
  type MetaErrorPayload,
} from '../errors/meta-graph.error.js'

/// Action recommandée au consommateur face à une erreur Meta.
export enum MetaErrorAction {
  REFRESH_TOKEN = 'REFRESH_TOKEN',
  RECONNECT_ACCOUNT = 'RECONNECT_ACCOUNT',
  WAIT_OR_RECONNECT = 'WAIT_OR_RECONNECT',
  REVIEW_PERMISSIONS = 'REVIEW_PERMISSIONS',
  FIX_REQUEST = 'FIX_REQUEST',
  RETRY_LATER = 'RETRY_LATER',
  /// Rendre le média téléchargeable par Meta (PUBLIC_BASE_URL publique).
  FIX_MEDIA_URL = 'FIX_MEDIA_URL',
  CONTACT_SUPPORT = 'CONTACT_SUPPORT',
}

/// Erreur Meta normalisée et classifiée, contrat unique consommé par le
/// PublicationRecorder, les use-cases et la présentation.
export interface MappedMetaError {
  code: number
  subcode?: number
  reason: MetaErrorReason
  retryable: boolean
  action: string
}

/// Point UNIQUE de traduction des erreurs Meta Graph API en erreurs métier.
/// Toute la logique de classification (code/subcode → raison/action/retryable)
/// vit ici : aucun autre composant n'interprète les codes Graph.
@Injectable()
export class MetaExceptionMapper {
  /// Transforme n'importe quelle erreur (axios, MetaGraphError, timeout, inconnu)
  /// en erreur métier standardisée.
  map(error: unknown): MappedMetaError {
    return this.classify(extractMetaErrorPayload(error))
  }

  /// Erreur métier normalisée pour le blocage en amont d'une publication dont le
  /// token est expiré (aucun appel Graph n'est tenté). Action = reconnexion, car
  /// un token de Page Meta expiré n'est pas rafraîchissable sans l'utilisateur.
  forExpiredToken(): MappedMetaError {
    return {
      code: 190,
      reason: MetaErrorReason.TOKEN_EXPIRED,
      retryable: false,
      action: MetaErrorAction.RECONNECT_ACCOUNT,
    }
  }

  private classify({ code, subcode, message: _message }: MetaErrorPayload): MappedMetaError {
    // Cas le plus spécifique d'abord : 190 + subcode 460 → reconnexion requise.
    if (code === 190 && subcode === 460) {
      return this.build(code, subcode, {
        reason: MetaErrorReason.RECONNECT_REQUIRED,
        retryable: false,
        action: MetaErrorAction.RECONNECT_ACCOUNT,
      })
    }

    // Échec de TÉLÉCHARGEMENT du média par Meta. Classé avant le reste car ces
    // deux codes tombaient jusqu'ici dans le défaut « contacter le support » —
    // conseil non seulement inutile mais trompeur : la cause est chez nous
    // (URL du média injoignable depuis Internet), pas chez Meta.
    //  - 9004 : Instagram, « impossible de récupérer le contenu multimédia » ;
    //  - 324  : Facebook, message générique sur l'image manquante/invalide.
    if (code === 9004 || code === 324) {
      return this.build(code, subcode, {
        reason: MetaErrorReason.MEDIA_UNREACHABLE,
        // Rejouer à l'identique échouera tant que l'URL n'a pas changé.
        retryable: false,
        action: MetaErrorAction.FIX_MEDIA_URL,
      })
    }

    // Conteneur Instagram encore en préparation : réessayer finit par aboutir.
    // Tombait lui aussi dans le défaut « contacter le support ».
    if (code === 9007) {
      return this.build(code, subcode, {
        reason: MetaErrorReason.MEDIA_NOT_READY,
        retryable: true,
        action: MetaErrorAction.RETRY_LATER,
      })
    }

    switch (code) {
      case 190:
        return this.build(code, subcode, {
          reason: MetaErrorReason.TOKEN_EXPIRED,
          retryable: false,
          action: MetaErrorAction.REFRESH_TOKEN,
        })
      case 25:
        return this.build(code, subcode, {
          reason: MetaErrorReason.USER_ACCESS_RESTRICTED,
          retryable: false,
          action: MetaErrorAction.WAIT_OR_RECONNECT,
        })
      case 10:
        return this.build(code, subcode, {
          reason: MetaErrorReason.PERMISSION_DENIED,
          retryable: false,
          action: MetaErrorAction.REVIEW_PERMISSIONS,
        })
      case 100:
        return this.build(code, subcode, {
          reason: MetaErrorReason.INVALID_PARAMETER,
          retryable: false,
          action: MetaErrorAction.FIX_REQUEST,
        })
      case -2:
        return this.build(code, subcode, {
          reason: MetaErrorReason.TIMEOUT,
          retryable: true,
          action: MetaErrorAction.RETRY_LATER,
        })
      case 1:
        return this.build(code, subcode, {
          reason: MetaErrorReason.UNKNOWN_META_ERROR,
          retryable: true,
          action: MetaErrorAction.RETRY_LATER,
        })
      default:
        return this.build(code, subcode, {
          reason: MetaErrorReason.UNKNOWN_META_ERROR,
          retryable: false,
          action: MetaErrorAction.CONTACT_SUPPORT,
        })
    }
  }

  private build(
    code: number,
    subcode: number | undefined,
    rest: { reason: MetaErrorReason; retryable: boolean; action: MetaErrorAction },
  ): MappedMetaError {
    return {
      code,
      ...(subcode !== undefined ? { subcode } : {}),
      reason: rest.reason,
      retryable: rest.retryable,
      action: rest.action,
    }
  }
}
