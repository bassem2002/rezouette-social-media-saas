import { registerAs } from '@nestjs/config'

/// Scopes TikTok. Phase 1 (connexion seule) : `user.info.basic` suffit pour
/// récupérer l'identité du compte. Les scopes de publication (`video.publish`)
/// seront ajoutés lors de la phase de publication — et nécessitent d'être
/// activés côté TikTok Developer Portal + audit de l'app pour le public.
export const TIKTOK_DEFAULT_SCOPES = ['user.info.basic'] as const

export interface TikTokConfig {
  clientKey: string
  clientSecret: string
  redirectUri: string
  apiVersion: string
  scopes: string[]
}

/// Config typée chargée depuis l'environnement. Contrairement à Meta (cœur du
/// MVP, fail-fast au démarrage), TikTok est une intégration optionnelle pas
/// encore provisionnée : on N'échoue PAS au boot si les credentials manquent —
/// la validation se fait au moment de l'usage (voir `isConfigured` / le guard
/// runtime dans TikTokOAuthService), pour ne pas bloquer une instance sans TikTok.
/// Miroir de `meta.config.ts` — TikTok utilise `client_key`/`client_secret`.
export default registerAs('tiktok', (): TikTokConfig => {
  const scopes = process.env['TIKTOK_SCOPES']
    ? process.env['TIKTOK_SCOPES']
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [...TIKTOK_DEFAULT_SCOPES]

  return {
    clientKey: process.env['TIKTOK_CLIENT_KEY'] ?? '',
    clientSecret: process.env['TIKTOK_CLIENT_SECRET'] ?? '',
    redirectUri: process.env['TIKTOK_REDIRECT_URI'] ?? '',
    apiVersion: process.env['TIKTOK_API_VERSION'] ?? 'v2',
    scopes,
  }
})

/// Vrai si les credentials OAuth TikTok sont présents (connexion possible).
export function isTikTokConfigured(config: TikTokConfig): boolean {
  return Boolean(config.clientKey && config.clientSecret && config.redirectUri)
}
