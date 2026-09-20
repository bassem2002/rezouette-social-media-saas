import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  DEFAULT_OAUTH_CALLBACK_PATH,
  isFrontendRedirectConfigured,
  type FrontendConfig,
} from '../../config/frontend.config.js'

/// Providers autorisés à produire une redirection de retour. Liste FERMÉE :
/// aucune valeur arbitraire ne peut atteindre l'URL.
export type OAuthRedirectProvider = 'linkedin' | 'tiktok' | 'youtube'

/// Bornes du compteur de comptes connectés : au-delà, la valeur est ignorée
/// plutôt que reflétée telle quelle dans l'URL.
const MAX_REPORTED_COUNT = 100

/// Codes d'erreur autorisés dans l'URL de retour. Tout autre code est ramené à
/// `unknown_error` — jamais le message brut du fournisseur.
const SAFE_ERROR_CODES = new Set([
  'access_denied',
  'invalid_request',
  'invalid_scope',
  'server_error',
  'temporarily_unavailable',
  'invalid_state',
  'state_expired',
  'provider_mismatch',
  'invalid_nonce',
  'pkce_verifier_not_found',
  'pkce_verifier_expired',
  'token_exchange_failed',
  'channel_not_found',
  'not_configured',
  'unknown_error',
])

/// Construit l'URL de retour vers le frontend après un flux OAuth.
///
/// Convention COMMUNE aux trois providers — un seul endroit construit ces URL,
/// pour qu'aucun callback n'invente ses propres paramètres :
///
///   {FRONTEND_URL}{/accounts}?oauthProvider=…&oauthStatus=success|error
///                            [&oauthCount=N] [&oauthError=code]
///
/// ⚠️ Ne transporte JAMAIS : code OAuth, `state`, `code_verifier`, token,
/// réponse brute du fournisseur, e-mail ou trace d'exception. Seuls un provider
/// d'une liste fermée, un statut, un compteur borné et un code d'erreur connu
/// franchissent cette frontière.
@Injectable()
export class OAuthFrontendRedirectService {
  constructor(private readonly config: ConfigService) {}

  private get frontend(): FrontendConfig {
    return this.config.getOrThrow<FrontendConfig>('frontend')
  }

  /// Vrai si une redirection est possible. Sinon, les controllers retombent sur
  /// leur réponse JSON historique — le callback ne doit jamais échouer parce que
  /// le frontend n'est pas configuré.
  isConfigured(): boolean {
    return isFrontendRedirectConfigured(this.frontend)
  }

  /// URL de succès, ou `null` si la redirection n'est pas configurée.
  buildSuccessUrl(input: {
    provider: OAuthRedirectProvider
    count?: number
  }): string | null {
    const params = new URLSearchParams({
      oauthProvider: input.provider,
      oauthStatus: 'success',
    })
    const count = this.sanitizeCount(input.count)
    if (count !== null) params.set('oauthCount', String(count))
    return this.build(params)
  }

  /// URL d'erreur, ou `null` si la redirection n'est pas configurée.
  buildErrorUrl(input: {
    provider: OAuthRedirectProvider
    errorCode: string
  }): string | null {
    const params = new URLSearchParams({
      oauthProvider: input.provider,
      oauthStatus: 'error',
      oauthError: this.sanitizeErrorCode(input.errorCode),
    })
    return this.build(params)
  }

  private build(params: URLSearchParams): string | null {
    const frontend = this.frontend
    if (!isFrontendRedirectConfigured(frontend)) return null
    try {
      // ⚠️ `new URL(path, base)` ne protège PAS de tout : un chemin ABSOLU
      // (`https://autre.test/x`) écrase l'origine de base. On force donc un
      // chemin relatif avant de résoudre — l'origine reste celle du frontend
      // configuré, quoi que contienne la variable d'environnement.
      const url = new URL(
        this.toRelativePath(frontend.oauthCallbackPath),
        frontend.baseUrl,
      )
      url.search = params.toString()
      return url.toString()
    } catch {
      return null
    }
  }

  /// Ramène un chemin de callback à une valeur relative sûre. Une valeur
  /// absolue ou protocol-relative (`//host`) est ignorée au profit du défaut.
  private toRelativePath(path: string): string {
    const value = (path ?? '').trim()
    if (!value) return DEFAULT_OAUTH_CALLBACK_PATH
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) {
      return DEFAULT_OAUTH_CALLBACK_PATH
    }
    return value.startsWith('/') ? value : `/${value}`
  }

  /// Entier positif borné, ou `null`. Un compteur absurde n'est pas relayé.
  private sanitizeCount(count: number | undefined): number | null {
    if (typeof count !== 'number' || !Number.isFinite(count)) return null
    const value = Math.trunc(count)
    if (value <= 0 || value > MAX_REPORTED_COUNT) return null
    return value
  }

  /// Code connu, en minuscules. Tout le reste devient `unknown_error` : un code
  /// inventé par le fournisseur ne doit pas être recopié dans l'URL.
  private sanitizeErrorCode(errorCode: string): string {
    const normalized = (errorCode ?? '').trim().toLowerCase()
    return SAFE_ERROR_CODES.has(normalized) ? normalized : 'unknown_error'
  }
}
