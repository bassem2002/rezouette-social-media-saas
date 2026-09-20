import { registerAs } from '@nestjs/config'

/// Durée de vie par défaut du `state` OAuth : 10 minutes. Assez pour un
/// aller-retour de consentement, assez court pour limiter la fenêtre de rejeu.
export const OAUTH_STATE_DEFAULT_TTL_SECONDS = 600

/// Configuration de sécurité PARTAGÉE par tous les flux OAuth (LinkedIn,
/// YouTube, et les suivants). Extraite de `linkedin.config.ts` : le secret HMAC
/// du `state` n'est propre à aucun réseau — le coupler à LinkedIn imposait de
/// configurer LinkedIn pour utiliser YouTube.
export interface OAuthSecurityConfig {
  /// Secret HMAC-SHA256 du `state` OAuth (anti-CSRF + anti-rejeu). Backend only,
  /// jamais journalisé, jamais renvoyé dans une réponse HTTP.
  stateSecret: string
  /// Durée de vie du `state` (et des entrées PKCE associées), en secondes.
  stateTtlSeconds: number
}

/// Parseur entier sûr : seul un entier strictement positif est retenu ; toute
/// valeur absente, non numérique, nulle ou négative retombe sur `fallback`.
function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number((raw ?? '').trim())
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.trunc(value)
}

/// Config typée chargée depuis l'environnement. NON fail-fast : un secret absent
/// n'empêche jamais le démarrage — seuls les flux OAuth qui en ont besoin
/// répondent 503 (voir `OAuthStateSigner.assertConfigured`). Aucun secret n'est
/// généré automatiquement : un secret aléatoire au boot invaliderait tous les
/// `state` en vol à chaque redémarrage et masquerait une erreur d'exploitation.
export default registerAs('oauthSecurity', (): OAuthSecurityConfig => {
  return {
    stateSecret: process.env['OAUTH_STATE_SECRET']?.trim() ?? '',
    stateTtlSeconds: parsePositiveInt(
      process.env['OAUTH_STATE_TTL_SECONDS'],
      OAUTH_STATE_DEFAULT_TTL_SECONDS,
    ),
  }
})

/// Vrai si les flux OAuth signés peuvent fonctionner (secret HMAC disponible).
export function isOAuthSecurityConfigured(config: OAuthSecurityConfig): boolean {
  return Boolean(config.stateSecret)
}
