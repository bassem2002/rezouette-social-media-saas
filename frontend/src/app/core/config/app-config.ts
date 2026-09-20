/// Configuration applicative centralisée (port de `config/app-config.ts` React).
/// `demoUserId` : stand-in de l'utilisateur authentifié tant que le JWT n'est
/// pas branché côté backend (les endpoints exigent un userId).
///
/// Les valeurs sont surchargeables au runtime via `window.__zernioEnv` (injecté
/// par un script avant le bundle), ce qui remplace `import.meta.env` de Vite.
interface ZernioEnv {
  VITE_API_URL?: string;
  VITE_DEMO_USER_ID?: string;
}

const env: ZernioEnv =
  (globalThis as unknown as { __zernioEnv?: ZernioEnv }).__zernioEnv ?? {};

// Base API RELATIVE par défaut (`/api/v1`) : en dev, le proxy `ng serve`
// (proxy.conf.json) redirige vers http://localhost:3000 côté serveur → aucune
// requête cross-origin, donc pas de blocage CORS. En prod, servir le front
// derrière la même origine que l'API (ou un reverse-proxy) et cette base
// relative fonctionne telle quelle. Pour cibler une API absolue (backend avec
// CORS ouvert), surcharger via window.__zernioEnv.VITE_API_URL.
export const appConfig = {
  apiUrl: env.VITE_API_URL ?? '/api/v1',
  demoUserId: env.VITE_DEMO_USER_ID ?? '00000000-0000-0000-0000-000000000001',
} as const;

/// URL de (re)connexion OAuth Meta — démarre le flux Facebook Login côté backend.
export function metaReconnectUrl(userId: string): string {
  return `${appConfig.apiUrl}/auth/meta?userId=${encodeURIComponent(userId)}`;
}

/// URL de (re)connexion OAuth TikTok — démarre le flux TikTok Login (PKCE) côté backend.
export function tiktokConnectUrl(userId: string): string {
  return `${appConfig.apiUrl}/auth/tiktok?userId=${encodeURIComponent(userId)}`;
}

/// URL de (re)connexion OAuth LinkedIn — démarre le flux LinkedIn Login (OIDC) côté
/// backend. Renvoie 503 tant que LinkedIn n'est pas configuré (credentials absents).
export function linkedinConnectUrl(userId: string): string {
  return `${appConfig.apiUrl}/auth/linkedin?userId=${encodeURIComponent(userId)}`;
}

/// URL de (re)connexion OAuth YouTube — démarre le flux Google (OAuth 2.0 + PKCE)
/// côté backend, qui redirige ensuite le NAVIGATEUR vers Google. Cette URL ne
/// doit donc jamais être appelée via HttpClient : seule une navigation complète
/// (`window.location.assign`) fonctionne. Renvoie 503 tant que YouTube n'est pas
/// configuré côté serveur.
export function youtubeConnectUrl(userId: string): string {
  const params = new URLSearchParams({ userId });
  return `${appConfig.apiUrl}/auth/youtube?${params.toString()}`;
}
