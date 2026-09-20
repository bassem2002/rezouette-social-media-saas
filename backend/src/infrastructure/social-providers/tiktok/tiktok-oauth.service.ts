import { HttpService } from '@nestjs/axios'
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'
import {
  ConnectedTikTokAccount,
  RefreshedTikTokTokens,
  TikTokOAuthGateway,
} from '../../../application/auth/ports/tiktok-oauth.gateway.js'
import { TikTokConfig, isTikTokConfigured } from '../../../config/tiktok.config.js'
import {
  TikTokTokenResponse,
  TikTokUserInfoResponse,
} from './tiktok-api.types.js'

/// Implémentation TikTok de la passerelle OAuth. Seul endroit qui connaît
/// l'API TikTok v2. Lit la config via ConfigService, appelle via HttpService.
/// TikTok impose PKCE (code_challenge/code_verifier) et un token courte durée
/// (~24 h) accompagné d'un refresh_token (~365 j) persisté pour le refresh futur.
@Injectable()
export class TikTokOAuthService implements TikTokOAuthGateway {
  private readonly logger = new Logger(TikTokOAuthService.name)

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get tiktok(): TikTokConfig {
    return this.config.getOrThrow<TikTokConfig>('tiktok')
  }

  private get apiBaseUrl(): string {
    return 'https://open.tiktokapis.com'
  }

  /// Garde runtime : l'intégration TikTok n'est pas fail-fast au boot. Si un
  /// endpoint OAuth est appelé sans credentials, on renvoie une 503 explicite
  /// plutôt qu'un échec obscur côté TikTok.
  private assertConfigured(): void {
    if (!isTikTokConfigured(this.tiktok)) {
      throw new ServiceUnavailableException(
        'Intégration TikTok non configurée : TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET et TIKTOK_REDIRECT_URI sont requis.',
      )
    }
  }

  buildAuthorizationUrl(state: string, codeChallenge: string): string {
    this.assertConfigured()
    const { clientKey, redirectUri, scopes } = this.tiktok
    const params = new URLSearchParams({
      client_key: clientKey,
      scope: scopes.join(','),
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })
    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`
  }

  async fetchConnectedAccount(
    code: string,
    codeVerifier: string,
  ): Promise<ConnectedTikTokAccount> {
    this.assertConfigured()
    const token = await this.exchangeCodeForToken(code, codeVerifier)

    const openId = token.open_id
    if (!token.access_token || !openId) {
      this.logger.error('Réponse token TikTok sans access_token/open_id')
      throw new UnauthorizedException(
        "Échec de l'échange du code OAuth TikTok (token incomplet)",
      )
    }

    const displayName = await this.fetchDisplayName(token.access_token)

    return {
      platform: 'tiktok',
      externalAccountId: openId,
      accountName: displayName ?? openId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      tokenExpiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      scopes: token.scope ? token.scope.split(',').filter(Boolean) : [],
      metadata: {
        openId,
        refreshExpiresAt: token.refresh_expires_in
          ? new Date(Date.now() + token.refresh_expires_in * 1000).toISOString()
          : null,
      },
    }
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<RefreshedTikTokTokens> {
    this.assertConfigured()
    const { clientKey, clientSecret } = this.tiktok
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    })

    let data: TikTokTokenResponse
    try {
      const res = await firstValueFrom(
        this.http.post<TikTokTokenResponse>(
          `${this.apiBaseUrl}/v2/oauth/token/`,
          body.toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        ),
      )
      data = res.data
    } catch (err) {
      this.logger.error(`Refresh token TikTok échoué: ${this.describe(err)}`)
      throw new UnauthorizedException('Échec du rafraîchissement du token TikTok')
    }

    if (data.error || !data.access_token) {
      this.logger.error(
        `Refresh token TikTok refusé: ${data.error ?? 'access_token manquant'}`,
      )
      throw new UnauthorizedException('Refresh token TikTok invalide ou expiré')
    }

    return {
      accessToken: data.access_token,
      // TikTok fait tourner le refresh_token : on garde le nouveau s'il est fourni.
      refreshToken: data.refresh_token ?? null,
      tokenExpiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
    }
  }

  private async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
  ): Promise<TikTokTokenResponse> {
    const { clientKey, clientSecret, redirectUri } = this.tiktok
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    })

    try {
      const res = await firstValueFrom(
        this.http.post<TikTokTokenResponse>(
          `${this.apiBaseUrl}/v2/oauth/token/`,
          body.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      )
      // TikTok peut renvoyer un 200 avec un champ `error` en cas d'échec logique.
      if (res.data.error) {
        this.logger.error(
          `Échange code → token TikTok refusé: ${res.data.error} (${res.data.error_description ?? ''})`,
        )
        throw new UnauthorizedException("Échec de l'échange du code OAuth TikTok")
      }
      return res.data
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err
      }
      this.logger.error(`Échange code → token TikTok échoué: ${this.describe(err)}`)
      throw new UnauthorizedException("Échec de l'échange du code OAuth TikTok")
    }
  }

  /// Récupère le nom affiché du compte. Non bloquant : en cas d'échec, on
  /// retombe sur l'open_id (le compte reste connectable et persistable).
  private async fetchDisplayName(accessToken: string): Promise<string | null> {
    try {
      const res = await firstValueFrom(
        this.http.get<TikTokUserInfoResponse>(
          `${this.apiBaseUrl}/v2/user/info/`,
          {
            params: { fields: 'open_id,union_id,display_name' },
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        ),
      )
      return res.data.data?.user?.display_name ?? null
    } catch (err) {
      this.logger.warn(
        `Récupération du profil TikTok impossible: ${this.describe(err)}`,
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
