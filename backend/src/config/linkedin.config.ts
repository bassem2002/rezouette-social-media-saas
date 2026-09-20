import { registerAs } from '@nestjs/config'

/// Scopes LinkedIn du MVP membre (Phase 2). `openid profile email` proviennent du
/// produit self-serve "Sign In with LinkedIn using OpenID Connect" ; `w_member_social`
/// du produit self-serve "Share on LinkedIn" (publication au nom du membre, Phase 4).
/// Séparés par des espaces (format LinkedIn), contrairement à TikTok (virgules).
export const LINKEDIN_DEFAULT_SCOPES = [
  'openid',
  'profile',
  'email',
  'w_member_social',
] as const

/// Sélection de l'API de publication LinkedIn (voir §3 du plan) :
/// - `disabled` : aucune publication réelle (défaut sûr) → PUBLISHING_NOT_CONFIGURED ;
/// - `rest`     : LinkedInRestPostsService (POST /rest/posts, versionné) ;
/// - `ugc`      : LinkedInUgcPostsService (POST /v2/ugcPosts, fallback membre).
/// Le choix définitif se fera après la sonde LinkedIn. AUCUN fallback automatique.
export type LinkedInPublishApi = 'disabled' | 'rest' | 'ugc'

export interface LinkedInConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  oauthBaseUrl: string
  apiBaseUrl: string
  /// Version d'API LinkedIn (header `LinkedIn-Version`, format YYYYMM). Utilisée par
  /// l'adaptateur `/rest/posts`. À confirmer/mettre à jour via la page LMS Versioning.
  apiVersion: string
  /// Adaptateur de publication actif (défaut `disabled` : aucun appel réseau).
  publishApi: LinkedInPublishApi
  /// @deprecated Conservé pour la garde `isLinkedInConfigured` uniquement.
  /// La source de vérité du secret HMAC du `state` est désormais la
  /// configuration OAuth PARTAGÉE (`oauthSecurity.stateSecret`, même variable
  /// d'environnement OAUTH_STATE_SECRET) : `OAuthStateSigner` NE LIT PLUS ce
  /// champ. Il reste ici pour que l'exigence LinkedIn « pas de state signé ⇒
  /// 503 » demeure vérifiable via `isLinkedInConfigured`, sans changer le
  /// comportement observable. À retirer quand toutes les gardes provider
  /// consulteront directement `oauthSecurity`.
  stateSecret: string
}

/// Config typée chargée depuis l'environnement. Comme TikTok (et contrairement à
/// Meta, cœur du MVP), LinkedIn est une intégration optionnelle pas encore
/// provisionnée : on N'échoue PAS au boot si les credentials manquent — la
/// validation se fait au moment de l'usage (voir `isLinkedInConfigured` + le guard
/// runtime dans LinkedInOAuthService), pour ne pas bloquer une instance sans LinkedIn.
export default registerAs('linkedin', (): LinkedInConfig => {
  const scopes = process.env['LINKEDIN_SCOPES']
    ? process.env['LINKEDIN_SCOPES']
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [...LINKEDIN_DEFAULT_SCOPES]

  const publishApiRaw = (process.env['LINKEDIN_PUBLISH_API'] ?? 'disabled')
    .trim()
    .toLowerCase()
  const publishApi: LinkedInPublishApi =
    publishApiRaw === 'rest' || publishApiRaw === 'ugc'
      ? publishApiRaw
      : 'disabled'

  // Repli robuste : une variable PRÉSENTE mais VIDE (`KEY=`) doit retomber sur la
  // valeur par défaut. `??` ne couvre que null/undefined, pas la chaîne vide — d'où
  // ce helper (sinon `LINKEDIN_OAUTH_BASE_URL=` produirait une URL relative cassée).
  const envOrDefault = (key: string, fallback: string): string => {
    const value = process.env[key]
    return value && value.trim() ? value.trim() : fallback
  }

  return {
    clientId: process.env['LINKEDIN_CLIENT_ID'] ?? '',
    clientSecret: process.env['LINKEDIN_CLIENT_SECRET'] ?? '',
    redirectUri: process.env['LINKEDIN_REDIRECT_URI'] ?? '',
    scopes,
    oauthBaseUrl: envOrDefault(
      'LINKEDIN_OAUTH_BASE_URL',
      'https://www.linkedin.com/oauth/v2',
    ),
    apiBaseUrl: envOrDefault('LINKEDIN_API_BASE_URL', 'https://api.linkedin.com'),
    apiVersion: envOrDefault('LINKEDIN_API_VERSION', '202607'),
    publishApi,
    stateSecret: process.env['OAUTH_STATE_SECRET'] ?? '',
  }
})

/// Vrai si la publication LinkedIn est réellement activée (credentials présents ET
/// un adaptateur non `disabled` choisi). Utilisé pour la 503 des endpoints de publication.
export function isLinkedInPublishingEnabled(config: LinkedInConfig): boolean {
  return isLinkedInConfigured(config) && config.publishApi !== 'disabled'
}

/// Vrai si l'intégration LinkedIn est utilisable (OAuth membre + state signé).
/// Le `stateSecret` est requis : sans lui, le flux OAuth ne peut pas être sécurisé.
export function isLinkedInConfigured(config: LinkedInConfig): boolean {
  return Boolean(
    config.clientId &&
      config.clientSecret &&
      config.redirectUri &&
      config.stateSecret,
  )
}
