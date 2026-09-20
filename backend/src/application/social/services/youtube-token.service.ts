import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { TokenStatus } from '../../../domain/social/token-status.enum.js'
import { YOUTUBE_TOKEN_GATEWAY } from '../../auth/ports/youtube-token.gateway.js'
import type {
  RefreshedYouTubeToken,
  YouTubeTokenGateway,
} from '../../auth/ports/youtube-token.gateway.js'
import type { YouTubeConfig } from '../../../config/youtube.config.js'
import {
  YouTubeTokenError,
  YouTubeTokenErrorCode,
} from '../errors/youtube-token.error.js'
import {
  newCredentialGroupId,
  readCredentialGroupId,
  withCredentialGroupId,
} from './youtube-credential-group.js'

/// Service applicatif du cycle de vie du token YouTube. Point UNIQUE du refresh :
/// il sera réutilisé tel quel par la publication et par la réconciliation.
///
/// Trois responsabilités que les autres réseaux n'ont pas toutes :
/// 1. l'access token Google vit ~1 h (le plus court du projet) → refresh actif ;
/// 2. un consentement peut couvrir PLUSIEURS chaînes → synchronisation de groupe ;
/// 3. plusieurs publications peuvent réclamer un token frais en même temps →
///    protection single-flight (un seul appel au token endpoint par groupe).
@Injectable()
export class YouTubeTokenService {
  private readonly logger = new Logger(YouTubeTokenService.name)

  /// Refresh en cours par groupe de credentials. ⚠️ EN MÉMOIRE, donc
  /// MONO-INSTANCE : en multi-instance, deux processus peuvent rafraîchir
  /// simultanément. Google tolère ce cas (l'ancien access token reste valide un
  /// moment), mais un verrou distribué (Redis) sera nécessaire pour garantir un
  /// appel unique — même dette que les stores OAuth.
  private readonly inFlight = new Map<string, Promise<RefreshedYouTubeToken>>()

  constructor(
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly accounts: SocialAccountRepository,
    @Inject(YOUTUBE_TOKEN_GATEWAY)
    private readonly gateway: YouTubeTokenGateway,
    private readonly config: ConfigService,
  ) {}

  private get skewMs(): number {
    return (
      this.config.getOrThrow<YouTubeConfig>('youtube').tokenRefreshSkewSeconds *
      1000
    )
  }

  // ── Lecture passive ───────────────────────────────────────────────────────

  /// Token expiré : date d'expiration connue et dépassée.
  isExpired(account: SocialAccount, now: Date = new Date()): boolean {
    const expiresAt = account.tokenExpiresAt
    return expiresAt !== null && expiresAt.getTime() <= now.getTime()
  }

  /// Token encore valide mais dans la marge de rafraîchissement anticipé.
  isExpiringSoon(account: SocialAccount, now: Date = new Date()): boolean {
    const expiresAt = account.tokenExpiresAt
    if (expiresAt === null) return false
    const remaining = expiresAt.getTime() - now.getTime()
    return remaining > 0 && remaining <= this.skewMs
  }

  needsReconnect(account: SocialAccount): boolean {
    return account.needsReconnect
  }

  /// Statut agrégé, du plus grave au plus sain. STRICTEMENT PASSIF : aucun
  /// refresh, aucun appel réseau, aucune écriture en base.
  ///
  /// Deux cas propres à YouTube produisent RECONNECT_REQUIRED plutôt qu'EXPIRED :
  /// une expiration inconnue (état incohérent, on ne peut rien garantir) et
  /// l'absence de refresh token (le token d'une heure ne sera jamais renouvelé).
  getStatus(account: SocialAccount, now: Date = new Date()): TokenStatus {
    if (this.needsReconnect(account)) return TokenStatus.RECONNECT_REQUIRED
    if (account.status === 'revoked' || account.status === 'error') {
      return TokenStatus.RECONNECT_REQUIRED
    }
    if (account.tokenExpiresAt === null) return TokenStatus.RECONNECT_REQUIRED
    if (this.isExpired(account, now)) return TokenStatus.EXPIRED
    if (account.refreshToken === null) return TokenStatus.RECONNECT_REQUIRED
    if (this.isExpiringSoon(account, now)) return TokenStatus.EXPIRING_SOON
    return TokenStatus.VALID
  }

  // ── Refresh actif ─────────────────────────────────────────────────────────

  /// Garantit un access token frais avant un appel Google (publication, upload,
  /// réconciliation). Renvoie le compte à jour. Ne rafraîchit que si nécessaire.
  ///
  /// `forceRefresh` renouvelle le token MÊME s'il paraît encore valide : Google
  /// peut rejeter un access token que notre date d'expiration croit bon
  /// (révocation, changement de mot de passe…). Réservé à une reprise après un
  /// 401 avéré — l'utiliser systématiquement gâcherait du quota.
  async ensureFresh(input: {
    userId: string
    accountId: string
    now?: Date
    forceRefresh?: boolean
  }): Promise<SocialAccount> {
    const now = input.now ?? new Date()
    const all = await this.accounts.findByUserId(input.userId)
    const account = all.find(
      (a) => a.id === input.accountId && a.platform === 'youtube',
    )

    if (!account) {
      throw new YouTubeTokenError(
        YouTubeTokenErrorCode.YOUTUBE_ACCOUNT_NOT_FOUND,
        'Aucun compte YouTube correspondant pour cet utilisateur.',
      )
    }
    if (account.needsReconnect) {
      throw new YouTubeTokenError(
        YouTubeTokenErrorCode.YOUTUBE_RECONNECT_REQUIRED,
        'Compte YouTube en attente de reconnexion.',
      )
    }
    // Token encore confortablement valide : aucun appel réseau — sauf si un
    // renouvellement est explicitement forcé.
    if (!input.forceRefresh && !this.shouldRefresh(account, now)) {
      return account
    }
    if (account.refreshToken === null) {
      throw new YouTubeTokenError(
        YouTubeTokenErrorCode.YOUTUBE_REFRESH_TOKEN_MISSING,
        'Aucun refresh token YouTube : reconnexion requise.',
      )
    }

    const groupId = readCredentialGroupId(account) ?? newCredentialGroupId()
    const group = this.resolveGroup(all, account, groupId)

    await this.refreshGroupOnce(groupId, account.refreshToken, group)

    // Relecture : les appels concurrents obtiennent tous l'état à jour.
    const refreshed = await this.accounts.findById(account.id)
    return refreshed ?? account
  }

  /// Vrai si le token doit être renouvelé (expiré, ou dans la marge anticipée).
  private shouldRefresh(account: SocialAccount, now: Date): boolean {
    const expiresAt = account.tokenExpiresAt
    if (expiresAt === null) return true
    return expiresAt.getTime() - now.getTime() <= this.skewMs
  }

  /// Comptes partageant les mêmes credentials. Compatibilité ascendante : un
  /// compte SANS identifiant de groupe est traité SEUL. On ne fusionne jamais
  /// plusieurs comptes sur une simple intuition — comparer les refresh tokens
  /// pour deviner un groupe serait une manipulation de secret inacceptable.
  private resolveGroup(
    all: SocialAccount[],
    account: SocialAccount,
    groupId: string,
  ): SocialAccount[] {
    const siblings = all.filter(
      (a) =>
        a.platform === 'youtube' &&
        a.id !== account.id &&
        readCredentialGroupId(a) === groupId,
    )
    return [account, ...siblings]
  }

  /// Single-flight : un seul appel au token endpoint par groupe. Les appelants
  /// concurrents partagent la même promesse — succès comme échec. La Map est
  /// systématiquement purgée dans `finally`, pour qu'aucune promesse rejetée ne
  /// soit resservie au prochain appel.
  private async refreshGroupOnce(
    groupId: string,
    refreshToken: string,
    group: SocialAccount[],
  ): Promise<RefreshedYouTubeToken> {
    const running = this.inFlight.get(groupId)
    if (running) return running

    const pending = this.performRefresh(groupId, refreshToken, group)
    this.inFlight.set(groupId, pending)
    try {
      return await pending
    } finally {
      this.inFlight.delete(groupId)
    }
  }

  private async performRefresh(
    groupId: string,
    refreshToken: string,
    group: SocialAccount[],
  ): Promise<RefreshedYouTubeToken> {
    let refreshed: RefreshedYouTubeToken
    try {
      refreshed = await this.gateway.refreshAccessToken(refreshToken)
    } catch (err) {
      // Seul un échec DÉFINITIF marque le groupe : un incident transitoire
      // (réseau, 5xx) ou une erreur de configuration laisse les comptes intacts.
      if (err instanceof YouTubeTokenError && err.requiresReconnect) {
        await this.markGroupNeedsReconnect(group)
      }
      throw err
    }

    await this.syncGroup(group, groupId, refreshed)
    this.logger.log(
      `Token YouTube rafraîchi pour ${group.length} chaîne(s) du groupe.`,
    )
    return refreshed
  }

  /// Applique les nouveaux credentials à TOUTES les chaînes du groupe.
  ///
  /// ⚠️ Pas d'atomicité : le repository ne fournit pas de transaction, et en
  /// ouvrir une depuis la couche Application romprait la Clean Architecture. Si
  /// une sauvegarde échoue en cours de route, l'erreur remonte et certaines
  /// chaînes peuvent rester sur l'ancien token — elles seront rafraîchies au
  /// prochain `ensureFresh`. Une transaction de groupe côté infrastructure
  /// serait préférable (dette assumée et documentée).
  private async syncGroup(
    group: SocialAccount[],
    groupId: string,
    refreshed: RefreshedYouTubeToken,
  ): Promise<void> {
    for (const member of group) {
      // `updateTokens` remet aussi status=ACTIVE, needsReconnect=false et
      // horodate lastRefreshAt — exactement l'état attendu après un refresh.
      member.updateTokens({
        accessToken: refreshed.accessToken,
        // `null` = inchangé : le refresh token existant est préservé.
        refreshToken: refreshed.refreshToken,
        tokenExpiresAt: refreshed.tokenExpiresAt,
      })
      member.updateProfile({
        // Scopes absents de la réponse = inchangés. On n'invente jamais de scope.
        ...(refreshed.scopes ? { scopes: refreshed.scopes } : {}),
        // Rattachement au groupe (utile pour un compte hérité sans identifiant).
        metadata: withCredentialGroupId(member.metadata, groupId),
      })
      await this.accounts.save(member)
    }
  }

  /// Marque toutes les chaînes du groupe comme nécessitant une reconnexion. Les
  /// tokens ne sont PAS effacés : ils restent traçables et l'UI peut expliquer
  /// précisément la situation.
  private async markGroupNeedsReconnect(group: SocialAccount[]): Promise<void> {
    for (const member of group) {
      if (!member.needsReconnect) {
        member.markNeedsReconnect()
        await this.accounts.save(member)
      }
    }
  }
}
