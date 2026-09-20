import { registerAs } from '@nestjs/config'

/// Route Angular par défaut vers laquelle revenir après un flux OAuth : la page
/// des comptes connectés, seul écran qui affiche le résultat d'une connexion.
export const DEFAULT_OAUTH_CALLBACK_PATH = '/accounts'

/// Origine par défaut du frontend en développement.
///
/// ⚠️ C'est le port d'`ng serve` (**4200**), pas celui du front React gelé
/// (5173). Le frontend ACTIF est `zernio-angular-frontend/`, et `angular.json`
/// ne surcharge pas le port : un repli sur 5173 renverrait les callbacks OAuth
/// vers une origine morte.
export const DEFAULT_FRONTEND_BASE_URL = 'http://localhost:4200'

/// Configuration du frontend actif. PARTAGÉE par tous les providers OAuth
/// (LinkedIn, TikTok, YouTube) : le backend reçoit le callback du fournisseur,
/// puis renvoie le navigateur vers l'application.
///
/// ⚠️ Les URI de callback déclarées chez les fournisseurs restent les routes
/// BACKEND : cette configuration ne concerne que le dernier saut, backend → UI.
export interface FrontendConfig {
  /// Origine du frontend (ex. `http://localhost:4200`).
  baseUrl: string
  /// Chemin de la page qui affiche le résultat OAuth.
  oauthCallbackPath: string
}

function envOrDefault(key: string, fallback: string): string {
  const value = process.env[key]
  return value && value.trim() ? value.trim() : fallback
}

/// Config typée. NON fail-fast : sans `FRONTEND_URL`, le backend démarre et les
/// callbacks retombent sur une réponse JSON (voir OAuthFrontendRedirectService).
export default registerAs('frontend', (): FrontendConfig => {
  return {
    // Trim des slashs finaux : évite `//accounts` lors de la concaténation.
    baseUrl: envOrDefault('FRONTEND_URL', DEFAULT_FRONTEND_BASE_URL).replace(
      /\/+$/,
      '',
    ),
    oauthCallbackPath: envOrDefault(
      'OAUTH_FRONTEND_CALLBACK_PATH',
      DEFAULT_OAUTH_CALLBACK_PATH,
    ),
  }
})

/// Vrai si `baseUrl` est une URL http(s) exploitable. Une valeur absente,
/// malformée ou d'un autre schéma désactive la redirection plutôt que de
/// produire une URL douteuse.
export function isFrontendRedirectConfigured(config: FrontendConfig): boolean {
  if (!config.baseUrl) return false
  try {
    const parsed = new URL(config.baseUrl)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
