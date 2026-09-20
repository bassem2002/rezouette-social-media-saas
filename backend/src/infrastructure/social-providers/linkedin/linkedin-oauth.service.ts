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
  ConnectedLinkedInMember,
  LinkedInOAuthGateway,
} from '../../../application/auth/ports/linkedin-oauth.gateway.js'
import {
  LinkedInConfig,
  isLinkedInConfigured,
} from '../../../config/linkedin.config.js'
import { LinkedInOidcVerifier } from './linkedin-oidc.verifier.js'
import {
  LinkedInTokenResponse,
  LinkedInUserInfoResponse,
} from './linkedin-api.types.js'

/// Implémentation LinkedIn de la passerelle OAuth. Seul endroit qui connaît les
/// endpoints LinkedIn. Client confidentiel (client_secret), identité via OIDC.
/// Non fail-fast : sans credentials, `assertConfigured()` renvoie une 503 claire.
/// N'émet AUCUN appel réseau tant que l'app n'est pas configurée.
@Injectable()
export class LinkedInOAuthService implements LinkedInOAuthGateway {
  private readonly logger = new Logger(LinkedInOAuthService.name)

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly oidc: LinkedInOidcVerifier,
  ) {}

  private get linkedin(): LinkedInConfig {
    return this.config.getOrThrow<LinkedInConfig>('linkedin')
  }

  /// Garde runtime : l'intégration LinkedIn n'est pas fail-fast au boot. Si un
  /// endpoint OAuth est appelé sans configuration, on renvoie une 503 explicite.
  assertConfigured(): void {
    if (!isLinkedInConfigured(this.linkedin)) {
      throw new ServiceUnavailableException(
        'LinkedIn integration is not configured.',
      )
    }
  }

  buildAuthorizationUrl(state: string, nonce: string): string {
    this.assertConfigured()
    const { clientId, redirectUri, scopes, oauthBaseUrl } = this.linkedin
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state,
      nonce,
    })
    return `${oauthBaseUrl}/authorization?${params.toString()}`
  }

  async fetchConnectedMember(
    code: string,
    expectedNonce: string,
  ): Promise<ConnectedLinkedInMember> {
    this.assertConfigured()
    const token = await this.exchangeCodeForToken(code)

    if (!token.access_token || !token.id_token) {
      this.logger.error('Réponse token LinkedIn sans access_token/id_token')
      throw new UnauthorizedException(
        "Échec de l'échange du code OAuth LinkedIn (token incomplet)",
      )
    }

    // Validation cryptographique OIDC (RS256/JWKS + iss/aud/exp/iat + nonce).
    const claims = await this.oidc.verify(token.id_token, expectedNonce)
    const memberUrn = `urn:li:person:${claims.sub}`

    // Confirmation/fallback d'identité via userinfo (non bloquant : jamais utilisé
    // pour contourner une signature invalide, uniquement pour compléter le profil).
    const userInfo = await this.fetchUserInfo(token.access_token)
    const name = claims.name ?? userInfo?.name ?? memberUrn
    const picture = claims.picture ?? userInfo?.picture ?? null

    return {
      platform: 'linkedin',
      externalAccountId: memberUrn,
      accountName: name,
      accessToken: token.access_token,
      refreshToken: null,
      tokenExpiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      scopes: token.scope ? token.scope.split(/[\s,]+/).filter(Boolean) : [],
      metadata: {
        accountType: 'MEMBER',
        memberUrn,
        picture,
      },
    }
  }

  private async exchangeCodeForToken(
    code: string,
  ): Promise<LinkedInTokenResponse> {
    const { clientId, clientSecret, redirectUri, oauthBaseUrl } = this.linkedin
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    })

    try {
      const res = await firstValueFrom(
        this.http.post<LinkedInTokenResponse>(
          `${oauthBaseUrl}/accessToken`,
          body.toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        ),
      )
      if (res.data.error) {
        this.logger.error(
          `Échange code → token LinkedIn refusé: ${res.data.error} (${res.data.error_description ?? ''})`,
        )
        throw new UnauthorizedException(
          "Échec de l'échange du code OAuth LinkedIn",
        )
      }
      return res.data
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err
      }
      this.logger.error(
        `Échange code → token LinkedIn échoué: ${this.describe(err)}`,
      )
      throw new UnauthorizedException("Échec de l'échange du code OAuth LinkedIn")
    }
  }

  /// Récupère le profil du membre. Non bloquant : en cas d'échec, on retombe sur
  /// les claims de l'id_token (déjà validés). Ne loggue jamais le token.
  private async fetchUserInfo(
    accessToken: string,
  ): Promise<LinkedInUserInfoResponse | null> {
    try {
      const res = await firstValueFrom(
        this.http.get<LinkedInUserInfoResponse>(
          `${this.linkedin.apiBaseUrl}/v2/userinfo`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        ),
      )
      return res.data
    } catch (err) {
      this.logger.warn(
        `Récupération du profil LinkedIn (userinfo) impossible: ${this.describe(err)}`,
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
