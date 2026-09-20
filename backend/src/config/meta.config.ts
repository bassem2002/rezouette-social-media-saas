import { registerAs } from '@nestjs/config'

/// Scopes Meta : Facebook Login + gestion des Pages + Instagram Business.
/// Ces permissions nécessitent une app correctement configurée côté dashboard
/// Meta (produit Facebook Login activé). En mode développement, l'app doit être
/// en "Live" ou l'utilisateur ajouté comme testeur pour éviter "Invalid Scopes".
export const META_SCOPES = [
  'public_profile',
  'email',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
] as const

export interface MetaConfig {
  appId: string
  appSecret: string
  redirectUri: string
  graphVersion: string
  scopes: readonly string[]
}

/// Config typée chargée depuis l'environnement. Échoue tôt si une variable
/// obligatoire manque (fail-fast au démarrage plutôt qu'au runtime OAuth).
export default registerAs('meta', (): MetaConfig => {
  const appId = process.env['META_APP_ID']
  const appSecret = process.env['META_APP_SECRET']
  const redirectUri = process.env['META_REDIRECT_URI']

  if (!appId || !appSecret || !redirectUri) {
    throw new Error(
      'Configuration Meta incomplète : META_APP_ID, META_APP_SECRET et META_REDIRECT_URI sont requis.',
    )
  }

  return {
    appId,
    appSecret,
    redirectUri,
    graphVersion: process.env['META_GRAPH_VERSION'] ?? 'v21.0',
    scopes: META_SCOPES,
  }
})
