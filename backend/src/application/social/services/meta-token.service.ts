import { Injectable } from '@nestjs/common'
import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import { TokenStatus } from '../../../domain/social/token-status.enum.js'

/// Fenêtre de pré-alerte avant expiration : un token expirant dans moins de
/// 7 jours est signalé EXPIRING_SOON (les tokens de Page Meta longue durée
/// vivent ~60 jours).
const EXPIRING_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/// Service applicatif sans état : calcule le cycle de vie du token d'un compte.
/// Point UNIQUE de la logique d'expiration/reconnexion, réutilisé par le
/// use-case de statut et par les use-cases de publication (blocage si EXPIRED).
@Injectable()
export class MetaTokenService {
  /// Token expiré : date d'expiration connue et dépassée.
  isExpired(account: SocialAccount, now: Date = new Date()): boolean {
    const expiresAt = account.tokenExpiresAt
    return expiresAt !== null && expiresAt.getTime() <= now.getTime()
  }

  /// Token encore valide mais dans la fenêtre de pré-alerte.
  isExpiringSoon(account: SocialAccount, now: Date = new Date()): boolean {
    const expiresAt = account.tokenExpiresAt
    if (expiresAt === null) {
      return false
    }
    const remaining = expiresAt.getTime() - now.getTime()
    return remaining > 0 && remaining <= EXPIRING_SOON_WINDOW_MS
  }

  /// Reconnexion OAuth requise (drapeau levé par Meta via le PublicationRecorder).
  needsReconnect(account: SocialAccount): boolean {
    return account.needsReconnect
  }

  /// Statut agrégé, du plus grave au plus sain.
  getStatus(account: SocialAccount, now: Date = new Date()): TokenStatus {
    if (this.needsReconnect(account)) {
      return TokenStatus.RECONNECT_REQUIRED
    }
    if (this.isExpired(account, now)) {
      return TokenStatus.EXPIRED
    }
    if (this.isExpiringSoon(account, now)) {
      return TokenStatus.EXPIRING_SOON
    }
    return TokenStatus.VALID
  }
}
