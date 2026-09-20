/// Lecture SÛRE du résultat OAuth transmis par le backend en query params.
///
/// Convention commune aux trois providers :
///   /accounts?oauthProvider=…&oauthStatus=success|error[&oauthCount=N][&oauthError=code]
///
/// ⚠️ Ces valeurs viennent de l'URL : elles ne sont jamais fiables. Tout ce qui
/// sort d'ici appartient à une liste FERMÉE — aucune chaîne issue de l'URL n'est
/// affichée telle quelle, ni injectée dans le DOM, ni journalisée.

export const OAUTH_PROVIDERS = ['youtube', 'linkedin', 'tiktok'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
};

/// Bornes du compteur : au-delà, la valeur est ignorée plutôt qu'affichée.
const MAX_COUNT = 100;

/// Messages d'erreur connus. Un code inconnu retombe sur un texte générique —
/// jamais sur le contenu brut du paramètre.
const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Connexion annulée. Aucune autorisation n’a été enregistrée.',
  invalid_scope:
    'Les permissions demandées n’ont pas été accordées. Réessayez en acceptant l’accès.',
  invalid_state:
    'La demande de connexion n’est plus valide. Relancez la connexion.',
  state_expired: 'La demande de connexion a expiré. Relancez la connexion.',
  provider_mismatch: 'Demande de connexion incohérente. Relancez la connexion.',
  invalid_nonce: 'Demande de connexion déjà utilisée. Relancez la connexion.',
  pkce_verifier_not_found:
    'La session de connexion a été perdue. Relancez la connexion.',
  pkce_verifier_expired:
    'La session de connexion a expiré. Relancez la connexion.',
  token_exchange_failed:
    'Le fournisseur a refusé la connexion. Réessayez dans quelques instants.',
  channel_not_found: 'Aucune chaîne disponible sur ce compte.',
  not_configured: 'Cette intégration n’est pas configurée sur ce serveur.',
  server_error:
    'Le fournisseur a rencontré une erreur. Réessayez dans quelques instants.',
  temporarily_unavailable:
    'Le fournisseur est momentanément indisponible. Réessayez plus tard.',
};

export interface OAuthCallbackResult {
  provider: OAuthProvider;
  providerLabel: string;
  status: 'success' | 'error';
  /// Nombre de comptes connectés, si fourni et plausible.
  count: number | null;
  /// Message prêt à afficher, toujours issu d'une table locale.
  message: string;
}

/// Analyse les query params. Renvoie `null` si le retour n'est pas reconnu :
/// une URL forgée ou incomplète ne produit aucune notification.
export function parseOAuthCallback(
  params: {
    get(name: string): string | null;
  },
): OAuthCallbackResult | null {
  const provider = params.get('oauthProvider');
  const status = params.get('oauthStatus');

  if (!isProvider(provider)) return null;
  if (status !== 'success' && status !== 'error') return null;

  const providerLabel = PROVIDER_LABELS[provider];

  if (status === 'error') {
    const code = normalizeCode(params.get('oauthError'));
    return {
      provider,
      providerLabel,
      status,
      count: null,
      message:
        ERROR_MESSAGES[code] ??
        `La connexion ${providerLabel} a échoué. Réessayez.`,
    };
  }

  const count = parseCount(params.get('oauthCount'));
  return {
    provider,
    providerLabel,
    status,
    count,
    message:
      count !== null && count > 1
        ? `${count} comptes ${providerLabel} connectés.`
        : `${providerLabel} connecté avec succès.`,
  };
}

function isProvider(value: string | null): value is OAuthProvider {
  return (
    value !== null && (OAUTH_PROVIDERS as readonly string[]).includes(value)
  );
}

/// Entier strictement positif et borné, sinon `null`.
function parseCount(raw: string | null): number | null {
  if (raw === null || !/^\d{1,3}$/.test(raw)) return null;
  const value = Number(raw);
  return value > 0 && value <= MAX_COUNT ? value : null;
}

/// Code réduit à un identifiant alphanumérique : tout le reste est écarté, donc
/// jamais utilisé comme clé ni affiché.
function normalizeCode(raw: string | null): string {
  if (raw === null) return '';
  return /^[a-z0-9_]{1,64}$/i.test(raw) ? raw.toLowerCase() : '';
}
