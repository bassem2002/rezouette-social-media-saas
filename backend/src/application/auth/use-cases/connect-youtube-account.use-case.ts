import { Inject, Injectable } from '@nestjs/common'
import { YOUTUBE_OAUTH_GATEWAY } from '../ports/youtube-oauth.gateway.js'
import type {
  ConnectedYouTubeChannel,
  YouTubeOAuthGateway,
} from '../ports/youtube-oauth.gateway.js'
import { SOCIAL_ACCOUNT_REPOSITORY } from '../../../domain/social-account/repositories/social-account.repository.js'
import type { SocialAccountRepository } from '../../../domain/social-account/repositories/social-account.repository.js'
import { SocialAccount } from '../../../domain/social-account/entities/social-account.entity.js'
import {
  YouTubeTokenError,
  YouTubeTokenErrorCode,
} from '../../social/errors/youtube-token.error.js'
import {
  newCredentialGroupId,
  readCredentialGroupId,
  withCredentialGroupId,
} from '../../social/services/youtube-credential-group.js'

/// Résumé d'une chaîne connectée. NE CONTIENT AUCUN TOKEN — ce résultat est
/// renvoyé tel quel par le callback HTTP.
export interface ConnectedYouTubeChannelSummary {
  id: string
  externalAccountId: string
  accountName: string
  platform: 'youtube'
  /// `created` pour une première connexion, `updated` pour une reconnexion.
  createdOrUpdated: 'created' | 'updated'
}

export interface ConnectYouTubeAccountResult {
  channels: ConnectedYouTubeChannelSummary[]
  count: number
}

/// Orchestration pure : récupère les chaînes via la passerelle puis les persiste
/// (création ou mise à jour). Zéro dépendance à Google/axios. Miroir de
/// `ConnectTikTokAccountUseCase`, avec deux différences assumées :
/// un compte Google peut exposer PLUSIEURS chaînes, et le refresh token Google
/// n'est pas systématiquement réémis.
@Injectable()
export class ConnectYouTubeAccountUseCase {
  constructor(
    @Inject(YOUTUBE_OAUTH_GATEWAY)
    private readonly youtubeOAuth: YouTubeOAuthGateway,
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: SocialAccountRepository,
  ) {}

  async execute(input: {
    userId: string
    code: string
    codeVerifier: string
  }): Promise<ConnectYouTubeAccountResult> {
    const channels = await this.youtubeOAuth.exchangeCodeAndFetchChannels({
      code: input.code,
      codeVerifier: input.codeVerifier,
    })

    // Toutes les chaînes de ce consentement partagent un seul jeu de credentials :
    // elles doivent porter le MÊME identifiant de groupe pour être rafraîchies
    // ensemble (voir YouTubeTokenService).
    const existingAccounts = await this.socialAccounts.findByUserId(input.userId)
    const groupId = this.resolveCredentialGroupId(existingAccounts, channels)

    const summaries: ConnectedYouTubeChannelSummary[] = []
    for (const channel of channels) {
      summaries.push(await this.persist(input.userId, channel, groupId))
    }

    return { channels: summaries, count: summaries.length }
  }

  /// Détermine l'identifiant de groupe de ce callback :
  /// - aucun groupe existant  → un nouvel UUID aléatoire, partagé par les chaînes ;
  /// - un seul groupe trouvé  → il est réutilisé (reconnexion : pas de nouveau groupe) ;
  /// - plusieurs groupes      → CONFLIT explicite, aucune fusion silencieuse.
  ///
  /// L'identifiant n'est jamais dérivé du refresh token ni d'un hash de token :
  /// c'est un UUID sans lien avec les credentials.
  private resolveCredentialGroupId(
    existingAccounts: SocialAccount[],
    channels: ConnectedYouTubeChannel[],
  ): string {
    const channelIds = new Set(channels.map((c) => c.channelId))
    const groups = new Set(
      existingAccounts
        .filter(
          (a) => a.platform === 'youtube' && channelIds.has(a.externalAccountId),
        )
        .map((a) => readCredentialGroupId(a))
        .filter((id): id is string => id !== null),
    )

    if (groups.size > 1) {
      // Deux consentements distincts se recouvrent : fusionner écraserait les
      // credentials d'un groupe par ceux de l'autre. On refuse explicitement.
      throw new YouTubeTokenError(
        YouTubeTokenErrorCode.YOUTUBE_CREDENTIAL_GROUP_CONFLICT,
        'Les chaînes YouTube autorisées appartiennent à des groupes de credentials différents : déconnectez-les avant de les reconnecter ensemble.',
      )
    }
    return [...groups][0] ?? newCredentialGroupId()
  }

  private async persist(
    userId: string,
    incoming: ConnectedYouTubeChannel,
    groupId: string,
  ): Promise<ConnectedYouTubeChannelSummary> {
    const existing = await this.socialAccounts.findByExternalAccount(
      userId,
      'youtube',
      incoming.channelId,
    )
    // Métadonnées de chaîne + rattachement au groupe (les clés existantes de
    // `incoming.metadata` sont préservées telles quelles).
    const metadata = withCredentialGroupId(incoming.metadata, groupId)

    if (existing) {
      // RÈGLE CRITIQUE — refresh token : `updateTokens` conserve le refresh token
      // déjà stocké quand l'entrant est `null` (Google ne le réémet pas à chaque
      // consentement). Un refresh token existant n'est JAMAIS écrasé par null ;
      // un nouveau refresh token non vide, lui, remplace bien l'ancien.
      existing.updateTokens({
        accessToken: incoming.accessToken,
        refreshToken: incoming.refreshToken,
        tokenExpiresAt: incoming.tokenExpiresAt,
      })
      // `updateTokens` remet aussi le compte ACTIVE et efface needsReconnect.
      existing.updateProfile({
        accountName: incoming.channelTitle,
        scopes: incoming.scopes,
        metadata,
      })
      await this.socialAccounts.save(existing)
      return this.toSummary(existing, 'updated')
    }

    // Première connexion : un refresh token absent est persisté tel quel (null).
    // Aucun refresh token n'est jamais fabriqué — l'état réel est conservé, et
    // sera visible via le statut du token (checkpoint suivant).
    const account = SocialAccount.create({
      userId,
      platform: 'youtube',
      externalAccountId: incoming.channelId,
      accountName: incoming.channelTitle,
      accessToken: incoming.accessToken,
      refreshToken: incoming.refreshToken,
      tokenExpiresAt: incoming.tokenExpiresAt,
      scopes: incoming.scopes,
      metadata,
    })
    await this.socialAccounts.save(account)
    return this.toSummary(account, 'created')
  }

  private toSummary(
    account: SocialAccount,
    createdOrUpdated: 'created' | 'updated',
  ): ConnectedYouTubeChannelSummary {
    return {
      id: account.id,
      externalAccountId: account.externalAccountId,
      accountName: account.accountName,
      platform: 'youtube',
      createdOrUpdated,
    }
  }
}
