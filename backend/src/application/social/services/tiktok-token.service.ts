import { Inject, Injectable, Logger } from '@nestjs/common'
import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { TokenStatus } from '../../../domain/social/token-status.enum.js'
import { TIKTOK_OAUTH_GATEWAY } from '../../auth/ports/tiktok-oauth.gateway.js'
import type { TikTokOAuthGateway } from '../../auth/ports/tiktok-oauth.gateway.js'

/// Fenêtre de rafraîchissement anticipé : l'access token TikTok vit ~24 h ; on le
/// rafraîchit dès qu'il expire dans moins d'1 h, pour ne jamais publier avec un
/// token périmé (contrairement aux page tokens Meta longue durée).
const REFRESH_WINDOW_MS = 60 * 60 * 1000

/// Fenêtre de pré-alerte EXPIRING_SOON (2 h) : englobe la fenêtre de refresh, de
/// sorte qu'un token proche de l'expiration est signalé avant son rafraîchissement.
const EXPIRING_SOON_WINDOW_MS = 2 * 60 * 60 * 1000

/// Service applicatif du cycle de vie du token TikTok. Point UNIQUE du refresh :
/// réutilisé par la publication immédiate et (à terme) par le scheduler.
@Injectable()
export class TikTokTokenService {
  private readonly logger = new Logger(TikTokTokenService.name)

  constructor(
    @Inject(TIKTOK_OAUTH_GATEWAY)
    private readonly gateway: TikTokOAuthGateway,
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly accounts: SocialAccountRepository,
  ) {}

  /// Token expiré : date d'expiration connue et dépassée.
  isExpired(account: SocialAccount, now: Date = new Date()): boolean {
    const expiresAt = account.tokenExpiresAt
    return expiresAt !== null && expiresAt.getTime() <= now.getTime()
  }

  /// Token encore valide mais dans la fenêtre de pré-alerte EXPIRING_SOON.
  isExpiringSoon(account: SocialAccount, now: Date = new Date()): boolean {
    const expiresAt = account.tokenExpiresAt
    if (expiresAt === null) return false
    const remaining = expiresAt.getTime() - now.getTime()
    return remaining > 0 && remaining <= EXPIRING_SOON_WINDOW_MS
  }

  /// Reconnexion OAuth requise (drapeau levé quand le refresh a définitivement échoué).
  needsReconnect(account: SocialAccount): boolean {
    return account.needsReconnect
  }

  /// Statut agrégé du token, du plus grave au plus sain. Lecture passive : ne
  /// déclenche aucun refresh (réutilise la même dérivation que Meta via TokenStatus).
  getStatus(account: SocialAccount, now: Date = new Date()): TokenStatus {
    if (this.needsReconnect(account)) return TokenStatus.RECONNECT_REQUIRED
    if (this.isExpired(account, now)) return TokenStatus.EXPIRED
    if (this.isExpiringSoon(account, now)) return TokenStatus.EXPIRING_SOON
    return TokenStatus.VALID
  }

  /// Token à rafraîchir : expire dans la fenêtre de refresh (ou déjà expiré).
  private needsRefresh(account: SocialAccount, now: Date): boolean {
    const expiresAt = account.tokenExpiresAt
    if (expiresAt === null) return false
    return expiresAt.getTime() - now.getTime() <= REFRESH_WINDOW_MS
  }

  /// Garantit un access token frais avant publication. Rafraîchit via le refresh
  /// token si nécessaire, persiste les nouveaux tokens (rotation TikTok) et
  /// renvoie le compte à jour. En cas d'échec de refresh (refresh token
  /// invalide/expiré), lève le drapeau de reconnexion et propage l'erreur.
  async ensureFresh(
    account: SocialAccount,
    now: Date = new Date(),
  ): Promise<SocialAccount> {
    if (!this.needsRefresh(account, now)) return account
    if (account.refreshToken === null) return account

    try {
      const refreshed = await this.gateway.refreshAccessToken(
        account.refreshToken,
      )
      account.updateTokens({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        tokenExpiresAt: refreshed.tokenExpiresAt,
      })
      await this.accounts.save(account)
      this.logger.log(`Token TikTok rafraîchi pour le compte ${account.id}`)
      return account
    } catch (err) {
      this.logger.warn(
        `Refresh token TikTok impossible pour ${account.id} : reconnexion requise`,
      )
      if (!account.needsReconnect) {
        account.markNeedsReconnect()
        await this.accounts.save(account)
      }
      throw err
    }
  }
}
