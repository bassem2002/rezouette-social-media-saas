import { HttpService } from '@nestjs/axios'
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'
import {
  ConnectedSocialAccount,
  MetaOAuthGateway,
} from '../../../application/auth/ports/meta-oauth.gateway.js'
import { MetaConfig } from '../../../config/meta.config.js'
import {
  MetaPage,
  MetaPagesResponse,
  MetaPageWithInstagram,
  MetaTokenResponse,
} from './meta-graph.types.js'

/// Implémentation Meta de la passerelle OAuth. Seul endroit qui connaît
/// l'API Graph. Lit la config via ConfigService, appelle via HttpService.
@Injectable()
export class MetaOAuthService implements MetaOAuthGateway {
  private readonly logger = new Logger(MetaOAuthService.name)

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get meta(): MetaConfig {
    return this.config.getOrThrow<MetaConfig>('meta')
  }

  private get graphBaseUrl(): string {
    return `https://graph.facebook.com/${this.meta.graphVersion}`
  }

  buildAuthorizationUrl(state: string): string {
    const { appId, redirectUri, scopes, graphVersion } = this.meta
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      scope: scopes.join(','),
      response_type: 'code',
    })
    return `https://www.facebook.com/${graphVersion}/dialog/oauth?${params.toString()}`
  }

  async fetchConnectedAccounts(code: string): Promise<ConnectedSocialAccount[]> {
    const shortLivedToken = await this.exchangeCodeForToken(code)
    const longLivedToken = await this.exchangeForLongLivedToken(shortLivedToken)
    const pages = await this.fetchPages(longLivedToken)

    const accounts: ConnectedSocialAccount[] = []

    for (const page of pages) {
      // 1 SocialAccount par Page Facebook.
      accounts.push({
        platform: 'facebook',
        externalAccountId: page.id,
        accountName: page.name,
        accessToken: page.access_token,
        tokenExpiresAt: null, // page token longue durée
        metadata: { category: page.category ?? null },
      })

      // + 1 par compte Instagram Business lié (publie via le token de la Page).
      const ig = await this.fetchInstagramAccount(page.id, page.access_token)
      const igAccount = ig?.instagram_business_account
      if (igAccount) {
        accounts.push({
          platform: 'instagram',
          externalAccountId: igAccount.id,
          accountName: igAccount.username ?? igAccount.name ?? igAccount.id,
          accessToken: page.access_token,
          tokenExpiresAt: null,
          metadata: { pageId: page.id, pageName: page.name },
        })
      }
    }

    return accounts
  }

  private async exchangeCodeForToken(code: string): Promise<string> {
    const { appId, appSecret, redirectUri } = this.meta
    try {
      const res = await firstValueFrom(
        this.http.get<MetaTokenResponse>(
          `${this.graphBaseUrl}/oauth/access_token`,
          {
            params: {
              client_id: appId,
              client_secret: appSecret,
              redirect_uri: redirectUri,
              code,
            },
          },
        ),
      )
      return res.data.access_token
    } catch (err) {
      this.logger.error(`Échange code → token échoué: ${this.describe(err)}`)
      throw new UnauthorizedException("Échec de l'échange du code OAuth Meta")
    }
  }

  private async exchangeForLongLivedToken(
    shortLivedToken: string,
  ): Promise<string> {
    const { appId, appSecret } = this.meta
    try {
      const res = await firstValueFrom(
        this.http.get<MetaTokenResponse>(
          `${this.graphBaseUrl}/oauth/access_token`,
          {
            params: {
              grant_type: 'fb_exchange_token',
              client_id: appId,
              client_secret: appSecret,
              fb_exchange_token: shortLivedToken,
            },
          },
        ),
      )
      return res.data.access_token
    } catch (err) {
      this.logger.error(`Échange token longue durée échoué: ${this.describe(err)}`)
      throw new UnauthorizedException(
        "Échec de l'obtention du token longue durée Meta",
      )
    }
  }

  private async fetchPages(userToken: string): Promise<MetaPage[]> {
    try {
      const res = await firstValueFrom(
        this.http.get<MetaPagesResponse>(`${this.graphBaseUrl}/me/accounts`, {
          params: {
            access_token: userToken,
            fields: 'id,name,access_token,category',
          },
        }),
      )
      return res.data.data ?? []
    } catch (err) {
      // Non bloquant : sans la permission pages_show_list (phase de test login),
      // on ne récupère simplement aucune Page au lieu de faire échouer le callback.
      this.logger.warn(`Récupération des Pages impossible: ${this.describe(err)}`)
      return []
    }
  }

  /// Non bloquant : une Page sans compte IG lié est un cas normal.
  private async fetchInstagramAccount(
    pageId: string,
    pageToken: string,
  ): Promise<MetaPageWithInstagram | null> {
    try {
      const res = await firstValueFrom(
        this.http.get<MetaPageWithInstagram>(`${this.graphBaseUrl}/${pageId}`, {
          params: {
            access_token: pageToken,
            fields: 'instagram_business_account{id,username,name}',
          },
        }),
      )
      return res.data
    } catch (err) {
      this.logger.warn(
        `Aucun compte Instagram pour la Page ${pageId}: ${this.describe(err)}`,
      )
      return null
    }
  }

  /// Extrait un message lisible sans jamais logger de token.
  private describe(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'response' in err) {
      const response = (err as { response?: { data?: unknown } }).response
      if (response?.data) {
        return JSON.stringify(response.data)
      }
    }
    return err instanceof Error ? err.message : String(err)
  }
}
