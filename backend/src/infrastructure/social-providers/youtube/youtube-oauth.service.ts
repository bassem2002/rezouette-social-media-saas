import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { firstValueFrom } from 'rxjs'
import type {
  ConnectedYouTubeChannel,
  YouTubeChannelMetadata,
  YouTubeOAuthGateway,
} from '../../../application/auth/ports/youtube-oauth.gateway.js'
import type {
  RefreshedYouTubeToken,
  YouTubeTokenGateway,
} from '../../../application/auth/ports/youtube-token.gateway.js'
import {
  YouTubeTokenError,
  YouTubeTokenErrorCode,
} from '../../../application/social/errors/youtube-token.error.js'
import {
  isOAuthSecurityConfigured,
  type OAuthSecurityConfig,
} from '../../../config/oauth-security.config.js'
import {
  isYouTubeConfigured,
  type YouTubeConfig,
} from '../../../config/youtube.config.js'
import {
  OAuthErrorCode,
  oauthBadGateway,
  oauthNotFound,
  oauthUnauthorized,
  oauthUnavailable,
} from '../../auth/oauth-error.js'
import type {
  GoogleTokenResponse,
  YouTubeChannelItem,
  YouTubeChannelListResponse,
} from './youtube-api.types.js'

/// Nombre maximal de chaînes récupérées en un appel (un compte Google en a
/// rarement plus d'une, mais un compte de marque peut en exposer plusieurs).
const MAX_CHANNEL_RESULTS = '50'

/// Champs demandés à channels.list — strictement ceux que l'on persiste.
const CHANNEL_PARTS = 'id,snippet,contentDetails,statistics'

/// Codes d'erreur Google signalant un refresh définitivement perdu : le grant a
/// été révoqué, a expiré, ou l'utilisateur a retiré l'accès. Aucun réessai ne
/// peut aboutir — seule une reconnexion OAuth le peut.
const RECONNECT_ERROR_CODES = new Set(['invalid_grant'])

/// Codes signalant une erreur d'APPLICATION (credentials Zernio invalides), pas
/// un problème du compte utilisateur : ne jamais marquer le compte à ce titre.
const CONFIGURATION_ERROR_CODES = new Set([
  'invalid_client',
  'unauthorized_client',
])

/// Implémentation Google des passerelles OAuth ET de refresh de token YouTube.
/// Une seule classe pour un seul endpoint de token : l'échange
/// `authorization_code` et le `refresh_token` partagent le même client HTTP
/// privé (`postToTokenEndpoint`), sans duplication.
///
/// Non fail-fast : sans configuration, `assertConfigured()` renvoie une 503 et
/// AUCUN appel réseau n'est émis.
///
/// Hygiène des secrets : ce service ne journalise jamais le code OAuth, le
/// code_verifier, l'access token, le refresh token, le client_secret, ni la
/// réponse brute du token endpoint.
@Injectable()
export class YouTubeOAuthService
  implements YouTubeOAuthGateway, YouTubeTokenGateway
{
  private readonly logger = new Logger(YouTubeOAuthService.name)

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get youtube(): YouTubeConfig {
    return this.config.getOrThrow<YouTubeConfig>('youtube')
  }

  private get security(): OAuthSecurityConfig {
    return this.config.getOrThrow<OAuthSecurityConfig>('oauthSecurity')
  }

  /// Garde runtime : credentials YouTube ET secret de state partagé. Les deux
  /// sont nécessaires pour un flux OAuth sûr — sans l'un, on refuse tôt.
  assertConfigured(): void {
    if (!isYouTubeConfigured(this.youtube)) {
      throw oauthUnavailable(
        OAuthErrorCode.YOUTUBE_NOT_CONFIGURED,
        'Intégration YouTube non configurée : YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET et YOUTUBE_REDIRECT_URI sont requis.',
      )
    }
    if (!isOAuthSecurityConfigured(this.security)) {
      throw oauthUnavailable(
        OAuthErrorCode.OAUTH_STATE_NOT_CONFIGURED,
        'Sécurité OAuth non configurée : OAUTH_STATE_SECRET est requis.',
      )
    }
  }

  buildAuthorizationUrl(input: { state: string; codeChallenge: string }): string {
    this.assertConfigured()
    const { clientId, redirectUri, scopes, oauthAuthorizationUrl } = this.youtube
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      // Google attend des scopes séparés par des espaces.
      scope: scopes.join(' '),
      state: input.state,
      // Indispensable pour obtenir un refresh token (publications programmées).
      access_type: 'offline',
      include_granted_scopes: 'true',
      // Force le consentement : sans cela, Google ne réémet PAS de refresh token
      // lors d'une reconnexion, et Zernio se retrouverait sans moyen de publier
      // en différé. À réévaluer une fois le refresh token durablement persisté.
      prompt: 'consent',
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
    })
    return `${oauthAuthorizationUrl}?${params.toString()}`
  }

  async exchangeCodeAndFetchChannels(input: {
    code: string
    codeVerifier: string
  }): Promise<ConnectedYouTubeChannel[]> {
    this.assertConfigured()

    const token = await this.exchangeCodeForToken(input.code, input.codeVerifier)
    const accessToken = token.access_token
    const expiresIn = token.expires_in

    if (!accessToken) {
      this.logger.error('Réponse token Google sans access_token')
      throw oauthUnauthorized(
        OAuthErrorCode.INVALID_TOKEN_RESPONSE,
        'Réponse de token Google incomplète (access_token manquant).',
      )
    }
    if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      this.logger.error('Réponse token Google avec expires_in invalide')
      throw oauthUnauthorized(
        OAuthErrorCode.INVALID_TOKEN_RESPONSE,
        'Réponse de token Google incomplète (expires_in invalide).',
      )
    }
    if (token.token_type && token.token_type.toLowerCase() !== 'bearer') {
      this.logger.error('Réponse token Google avec un token_type inattendu')
      throw oauthUnauthorized(
        OAuthErrorCode.INVALID_TOKEN_RESPONSE,
        'Réponse de token Google inattendue (token_type non Bearer).',
      )
    }

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000)
    // Scopes RÉELLEMENT accordés. À défaut (champ absent), repli documenté sur
    // les scopes demandés — à confirmer lors du premier test Google réel.
    const grantedScopes = token.scope
      ? token.scope.split(/[\s,]+/).filter(Boolean)
      : [...this.youtube.scopes]

    const channels = await this.fetchChannels(accessToken)

    return channels.map((item) =>
      this.toConnectedChannel(item, {
        accessToken,
        refreshToken: token.refresh_token ?? null,
        tokenExpiresAt,
        scopes: grantedScopes,
      }),
    )
  }

  /// Rafraîchit l'access token à partir du refresh token. Aucun retry
  /// automatique : un échec transitoire remonte tel quel à l'appelant, qui
  /// décide (les credentials existants restent intacts).
  async refreshAccessToken(refreshToken: string): Promise<RefreshedYouTubeToken> {
    this.assertRefreshConfigured()
    const { clientId, clientSecret } = this.youtube

    // Corps minimal exigé par Google : ni redirect_uri, ni code, ni code_verifier,
    // ni scope (un `scope` envoyé ici ne pourrait que restreindre inutilement).
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    })

    let data: GoogleTokenResponse
    try {
      data = await this.postToTokenEndpoint(body)
    } catch (err) {
      // Google refuse un refresh token révoqué avec un HTTP 400 portant
      // `{"error":"invalid_grant"}` : l'échec arrive donc par le REJET HTTP, pas
      // par un corps 200. Sans cette extraction, une révocation définitive
      // passerait pour un incident transitoire et ne serait jamais signalée.
      const googleError = this.extractGoogleError(err)
      if (googleError) {
        throw this.toRefreshError(googleError)
      }
      // Aucun code exploitable : incident transitoire présumé, credentials
      // préservés, aucun marquage de reconnexion.
      this.logger.error(
        `Refresh token Google échoué: ${this.describeAuthFailure(err)}`,
      )
      throw new YouTubeTokenError(
        YouTubeTokenErrorCode.YOUTUBE_TOKEN_REFRESH_FAILED,
        'Échec du rafraîchissement du token YouTube (incident transitoire).',
        true,
      )
    }

    // Filet pour un éventuel 200 porteur d'un champ `error`.
    if (data.error) {
      throw this.toRefreshError(data.error)
    }

    const accessToken = data.access_token
    const expiresIn = data.expires_in
    if (
      !accessToken ||
      typeof expiresIn !== 'number' ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0 ||
      (data.token_type && data.token_type.toLowerCase() !== 'bearer')
    ) {
      this.logger.error('Réponse de refresh Google inexploitable')
      throw new YouTubeTokenError(
        YouTubeTokenErrorCode.YOUTUBE_INVALID_REFRESH_RESPONSE,
        'Réponse de rafraîchissement Google inexploitable.',
      )
    }

    return {
      accessToken,
      // `null` = inchangé : Google ne fait pas systématiquement tourner le
      // refresh token. L'appelant conserve alors celui déjà stocké.
      refreshToken: data.refresh_token?.trim() ? data.refresh_token : null,
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      scopes: data.scope ? data.scope.split(/[\s,]+/).filter(Boolean) : null,
    }
  }

  /// Extrait le code d'erreur OAuth d'une réponse HTTP en échec (`{"error":"…"}`),
  /// ou `null` si la réponse n'en porte pas (panne réseau, 5xx sans corps…).
  /// Ne lit QUE ce champ : jamais le corps complet, qui pourrait contenir un token.
  private extractGoogleError(err: unknown): string | null {
    if (typeof err !== 'object' || err === null || !('response' in err)) {
      return null
    }
    const data = (err as { response?: { data?: { error?: unknown } } }).response
      ?.data
    return typeof data?.error === 'string' ? data.error : null
  }

  /// Traduit un code d'erreur Google en erreur de token normalisée.
  private toRefreshError(googleError: string): YouTubeTokenError {
    if (RECONNECT_ERROR_CODES.has(googleError)) {
      this.logger.warn(
        `Refresh token Google refusé (${googleError}) : reconnexion requise`,
      )
      return new YouTubeTokenError(
        YouTubeTokenErrorCode.YOUTUBE_RECONNECT_REQUIRED,
        'Autorisation YouTube révoquée ou expirée : reconnexion requise.',
      )
    }
    if (CONFIGURATION_ERROR_CODES.has(googleError)) {
      // Erreur d'exploitation Zernio, PAS un problème du compte utilisateur :
      // on ne marque surtout pas le compte comme nécessitant une reconnexion.
      this.logger.error(
        `Refresh token Google refusé (${googleError}) : credentials d'application invalides`,
      )
      return new YouTubeTokenError(
        YouTubeTokenErrorCode.YOUTUBE_NOT_CONFIGURED,
        "Credentials de l'application YouTube refusés par Google (configuration serveur).",
      )
    }
    this.logger.error(`Refresh token Google refusé: ${googleError}`)
    return new YouTubeTokenError(
      YouTubeTokenErrorCode.YOUTUBE_TOKEN_REFRESH_FAILED,
      'Échec du rafraîchissement du token YouTube.',
      true,
    )
  }

  /// Garde du refresh : même exigence de configuration, mais exprimée dans le
  /// vocabulaire d'erreur du token (l'appelant est un service applicatif, pas
  /// un handler HTTP de flux OAuth).
  private assertRefreshConfigured(): void {
    if (!isYouTubeConfigured(this.youtube)) {
      throw new YouTubeTokenError(
        YouTubeTokenErrorCode.YOUTUBE_NOT_CONFIGURED,
        'Intégration YouTube non configurée : rafraîchissement impossible.',
      )
    }
  }

  /// POST {oauthTokenUrl} — application/x-www-form-urlencoded, avec PKCE.
  private async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
  ): Promise<GoogleTokenResponse> {
    const { clientId, clientSecret, redirectUri } = this.youtube
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    })

    let data: GoogleTokenResponse
    try {
      data = await this.postToTokenEndpoint(body)
    } catch (err) {
      // `describeAuthFailure` n'expose que le champ `error` de Google : jamais le
      // corps brut, qui pourrait contenir un token en cas de réponse partielle.
      this.logger.error(
        `Échange code → token Google échoué: ${this.describeAuthFailure(err)}`,
      )
      throw oauthUnauthorized(
        OAuthErrorCode.TOKEN_EXCHANGE_FAILED,
        "Échec de l'échange du code OAuth YouTube.",
      )
    }

    if (data.error) {
      this.logger.error(
        `Échange code → token Google refusé: ${this.describePayloadError(data)}`,
      )
      throw oauthUnauthorized(
        OAuthErrorCode.TOKEN_EXCHANGE_FAILED,
        "Échec de l'échange du code OAuth YouTube.",
      )
    }
    return data
  }

  /// Client HTTP unique du token endpoint Google, partagé par l'échange de code
  /// et le refresh. Ne journalise rien : les appelants décrivent leur propre
  /// échec, sans jamais exposer le corps de la réponse.
  private async postToTokenEndpoint(
    body: URLSearchParams,
  ): Promise<GoogleTokenResponse> {
    const res = await firstValueFrom(
      this.http.post<GoogleTokenResponse>(
        this.youtube.oauthTokenUrl,
        body.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      ),
    )
    return res.data
  }

  /// GET {apiBaseUrl}/channels?mine=true — token transmis par en-tête
  /// Authorization (jamais en query string, qui finirait dans les logs d'accès).
  private async fetchChannels(accessToken: string): Promise<YouTubeChannelItem[]> {
    let data: YouTubeChannelListResponse
    try {
      const res = await firstValueFrom(
        this.http.get<YouTubeChannelListResponse>(
          `${this.youtube.apiBaseUrl}/channels`,
          {
            params: {
              part: CHANNEL_PARTS,
              mine: 'true',
              maxResults: MAX_CHANNEL_RESULTS,
            },
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        ),
      )
      data = res.data
    } catch (err) {
      this.logger.error(
        `Récupération des chaînes YouTube échouée: ${this.describeAuthFailure(err)}`,
      )
      throw oauthBadGateway(
        OAuthErrorCode.YOUTUBE_CHANNEL_FETCH_FAILED,
        'Impossible de récupérer les chaînes YouTube du compte autorisé.',
      )
    }

    const items = (data.items ?? []).filter(
      (item): item is YouTubeChannelItem => Boolean(item?.id),
    )
    if (items.length === 0) {
      // Cas réel : compte Google sans chaîne YouTube. Aucun SocialAccount créé.
      throw oauthNotFound(
        OAuthErrorCode.CHANNEL_NOT_FOUND,
        'Aucune chaîne YouTube associée à ce compte Google.',
      )
    }
    return items
  }

  private toConnectedChannel(
    item: YouTubeChannelItem,
    tokens: {
      accessToken: string
      refreshToken: string | null
      tokenExpiresAt: Date
      scopes: string[]
    },
  ): ConnectedYouTubeChannel {
    const channelId = item.id ?? ''
    const snippet = item.snippet
    const statistics = item.statistics
    // Cascade de miniatures : high → medium → default.
    const thumbnailUrl =
      snippet?.thumbnails?.high?.url ??
      snippet?.thumbnails?.medium?.url ??
      snippet?.thumbnails?.default?.url

    const metadata: YouTubeChannelMetadata = {
      ...(thumbnailUrl !== undefined ? { thumbnailUrl } : {}),
      ...(snippet?.customUrl !== undefined
        ? { customUrl: snippet.customUrl }
        : {}),
      ...(item.contentDetails?.relatedPlaylists?.uploads !== undefined
        ? { uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads }
        : {}),
      ...(statistics?.subscriberCount !== undefined
        ? { subscriberCount: statistics.subscriberCount }
        : {}),
      ...(statistics?.videoCount !== undefined
        ? { videoCount: statistics.videoCount }
        : {}),
      ...(statistics?.hiddenSubscriberCount !== undefined
        ? { hiddenSubscriberCount: statistics.hiddenSubscriberCount }
        : {}),
    }

    return {
      channelId,
      // Repli sur l'id : une chaîne sans titre reste connectable et identifiable.
      channelTitle: snippet?.title?.trim() || channelId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.tokenExpiresAt,
      scopes: tokens.scopes,
      metadata,
    }
  }

  /// Décrit un échec sans jamais exposer de secret : statut HTTP, code d'erreur
  /// Google (`error`) et description nettoyée (`error_description`) — jamais le
  /// corps complet de la réponse, ni la requête, ni un en-tête.
  ///
  /// La description est ce qui distingue deux causes portant le même code : un
  /// `invalid_grant` peut signifier « code déjà utilisé », « code expiré » ou
  /// « code_verifier incorrect », et seul `error_description` le dit.
  private describeAuthFailure(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'response' in err) {
      const response = (err as { response?: { status?: number; data?: unknown } })
        .response
      const status = response?.status ?? 'sans statut'
      const data = asRecord(response?.data)
      const code = data?.['error']
      const label = typeof code === 'string' ? code : 'erreur non détaillée'
      const description = sanitizeErrorDescription(data?.['error_description'])
      return description
        ? `HTTP ${status} (${label} — ${description})`
        : `HTTP ${status} (${label})`
    }
    // Échecs SANS réponse HTTP : timeout, DNS, connexion refusée. Le `code`
    // d'axios (ECONNABORTED, ETIMEDOUT, ENOTFOUND…) est plus exploitable que le
    // message, et ne peut contenir aucune donnée de la requête.
    const transport = asRecord(err)?.['code']
    if (typeof transport === 'string' && transport) {
      return `sans réponse HTTP (${transport})`
    }
    return err instanceof Error ? err.message : 'erreur inconnue'
  }

  /// Décrit un corps 200 porteur d'un champ `error` (cas non conforme mais
  /// observé chez certains fournisseurs). Mêmes garanties que ci-dessus.
  private describePayloadError(data: GoogleTokenResponse): string {
    const description = sanitizeErrorDescription(data.error_description)
    return description ? `${data.error} — ${description}` : `${data.error}`
  }
}

/// Accès typé à un objet inconnu, sans jamais le sérialiser.
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null
}

/// Longueur maximale d'une description reprise dans les logs.
const MAX_ERROR_DESCRIPTION_LENGTH = 200

/// Nettoie une description d'erreur avant journalisation : caractères de
/// contrôle neutralisés, espaces normalisés, longueur bornée. Google y renvoie
/// des libellés courts (« Bad Request », « Malformed auth code. ») et jamais de
/// jeton — mais un champ distant ne se journalise pas sur parole.
function sanitizeErrorDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return null
  return cleaned.length > MAX_ERROR_DESCRIPTION_LENGTH
    ? `${cleaned.slice(0, MAX_ERROR_DESCRIPTION_LENGTH)}…`
    : cleaned
}
