import { Injectable } from '@nestjs/common'
import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import { TokenStatus } from '../../../domain/social/token-status.enum.js'

/// Fenêtre de pré-alerte avant expiration : un token expirant dans moins de 7 jours
/// est signalé EXPIRING_SOON. L'access token LinkedIn vit ~60 jours et, pour une app
/// standard, N'EST PAS rafraîchissable : la seule issue est une reconnexion OAuth —
/// d'où une pré-alerte large (J-7) pour laisser le temps à l'utilisateur d'agir.
const EXPIRING_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/// Service applicatif sans état : calcule le cycle de vie du token LinkedIn d'un
/// compte. Contrairement à TikTok, PAS de `ensureFresh`/refresh (LinkedIn n'émet pas
/// de refresh token pour les apps standard). Lecture passive uniquement.
@Injectable()
export class LinkedInTokenService {
  /// Token expiré : date d'expiration connue et dépassée.
  isExpired(account: SocialAccount, now: Date = new Date()): boolean {
    const expiresAt = account.tokenExpiresAt
    return expiresAt !== null && expiresAt.getTime() <= now.getTime()
  }

  /// Token encore valide mais dans la fenêtre de pré-alerte (≤ 7 j).
  isExpiringSoon(account: SocialAccount, now: Date = new Date()): boolean {
    const expiresAt = account.tokenExpiresAt
    if (expiresAt === null) {
      return false
    }
    const remaining = expiresAt.getTime() - now.getTime()
    return remaining > 0 && remaining <= EXPIRING_SOON_WINDOW_MS
  }

  /// Reconnexion OAuth requise (drapeau levé quand LinkedIn refuse le token).
  needsReconnect(account: SocialAccount): boolean {
    return account.needsReconnect
  }

  /// Statut agrégé, du plus grave au plus sain. Le renouvellement se fait par un
  /// nouveau flux OAuth (aucun refresh silencieux possible).
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
