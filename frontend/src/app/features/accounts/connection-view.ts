import type { AccountPlatform } from '@core/models';
import type { AccountDisplayState } from './account-state';

/// Modèle d'affichage d'une carte de connexion — commun aux CINQ plateformes.
///
/// La page prépare ces vues à partir des requêtes réelles ; la carte, elle,
/// reste purement présentationnelle. Un champ absent vaut `null` et n'est
/// simplement pas rendu : aucune valeur n'est inventée pour remplir la maquette.
export interface ConnectionView {
  /// Clé de suivi `@for` — une chaîne par carte, y compris pour les chaînes
  /// YouTube multiples d'un même compte Google.
  key: string;
  platform: AccountPlatform;
  state: AccountDisplayState;
  connected: boolean;
  /// Nom du compte tel que renvoyé par l'API, `null` si non connecté.
  name: string | null;
  /// Ligne secondaire réelle (identifiant public, abonnés…), `null` sinon.
  handle: string | null;
  /// Date de connexion, `null` si l'API ne la fournit pas pour ce réseau.
  connectedAt: string | null;
  expiresAt: string | null;
  /// Avertissement non bloquant (ex. absence d'autorisation durable).
  warning: string | null;
  /// L'action de connexion est indisponible (intégration non configurée).
  disabled: boolean;
  disabledHint: string | null;
}

export const PLATFORM_LABELS: Record<AccountPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
};

/// Pastille d'icône par réseau — fond doux, jamais d'aplat saturé.
export const PLATFORM_ICON_CLASSES: Record<AccountPlatform, string> = {
  facebook: 'bg-info-soft text-info',
  instagram: 'bg-warning-soft text-warning',
  tiktok: 'bg-muted-soft text-foreground',
  linkedin: 'bg-info-soft text-info',
  youtube: 'bg-error-soft text-error',
};

/// Options du filtre « All platforms ». L'ordre est celui de la sidebar.
export const PLATFORM_FILTERS: readonly AccountPlatform[] = [
  'facebook',
  'instagram',
  'tiktok',
  'linkedin',
  'youtube',
];

/// Options du filtre « All statuses ». Chaque valeur correspond à un état
/// réellement calculable — aucun statut décoratif.
export const STATUS_FILTERS: readonly {
  value: AccountDisplayState;
  label: string;
}[] = [
  { value: 'CONNECTED', label: 'Connected' },
  { value: 'RECONNECT_REQUIRED', label: 'Reconnect required' },
  { value: 'TOKEN_EXPIRED', label: 'Expired' },
  { value: 'ERROR', label: 'Error' },
  { value: 'NOT_CONNECTED', label: 'Not connected' },
];
