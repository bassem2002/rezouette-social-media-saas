import { demoProfile } from './frontend-demo.config';

/// Données et libellés des écrans d'APERÇU FRONTEND (Numbers, API Keys, Users,
/// Webhooks, Logs).
///
/// ⚠️ Aucun service backend ne correspond encore à ces écrans. Tout ce fichier
/// est donc de la donnée d'exemple, tenue à l'écart des modèles réels
/// (`core/models/*.model.ts`) et des services HTTP. Règle de lecture : si une
/// valeur vient d'ici, elle n'existe ni en base, ni côté serveur, et aucune
/// action de ces pages ne la modifie durablement.
///
/// Aucun secret, aucune clé, aucun identifiant réel ne doit être ajouté ici :
/// les valeurs « sensibles » sont volontairement fictives et reconnaissables.

/// Le texte du bandeau vit désormais dans `FrontendPreviewNoticeComponent`
/// (constantes `PREVIEW_NOTICE_TEXT` / `PARTIAL_NOTICE_TEXT`) : une seule
/// formulation pour toute l'application, impossible à faire diverger.

/// Badge apposé près des titres et des lignes de démonstration.
export const PREVIEW_BADGE = 'Frontend only';

/// Messages d'action, un par domaine. Regroupés ici pour qu'aucun écran ne
/// puisse laisser croire qu'une opération a abouti.
export const PREVIEW_MESSAGES = {
  numbers: 'Le service de numéros sera disponible prochainement.',
  numbersBuy:
    'L’achat de numéros sera disponible après l’intégration du service téléphonique.',
  numbersTest: 'Mode démonstration : aucun message ne sera envoyé.',
  calls: 'Le service d’appels sera disponible prochainement.',
  apiKeys: 'La gestion des clés API n’est pas encore connectée au backend.',
  apiKeysCreate:
    'La création de clés API sera activée lorsque le backend Rezouette sera prêt.',
  apiKeysDelete:
    'Démonstration frontend uniquement : la clé est retirée de l’affichage, rien n’est supprimé côté serveur.',
  users: 'La gestion d’équipe sera disponible dans une prochaine version.',
  usersInvite:
    'Invitation simulée. Le service d’équipe n’est pas encore connecté au backend.',
  usersActivity: 'L’activité des membres sera disponible prochainement.',
  webhooks: 'Le webhook est simulé localement. Aucun événement ne sera envoyé.',
  logs: 'Le service d’audit et de journalisation n’est pas encore disponible.',
  logsExport: 'Export bientôt disponible.',
} as const;

// ── Numbers ────────────────────────────────────────────────────────────────

export interface PreviewPhoneNumber {
  id: string;
  number: string;
  countryCode: string;
  country: string;
  type: string;
  status: 'active' | 'pending' | 'inactive';
  whatsapp: string;
  sms: 'available' | 'unavailable';
  calls: 'available' | 'unavailable';
  /// `null` quand la donnée n'existe pas — affiché « — », jamais inventé.
  addedAt: string | null;
  price: string;
}

export const previewPhoneNumbers: readonly PreviewPhoneNumber[] = [
  {
    id: 'preview-number-1',
    number: '+1 202 908 7457',
    countryCode: 'US',
    country: 'US',
    type: 'Sandbox',
    status: 'active',
    whatsapp: 'Rezouette Sandbox',
    sms: 'unavailable',
    calls: 'unavailable',
    addedAt: null,
    price: 'Free',
  },
];

export const previewCountries = [
  { value: 'all', label: 'All countries' },
  { value: 'US', label: 'United States' },
] as const;

export const previewFeatures = [
  { value: 'all', label: 'All features' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'calls', label: 'Calls' },
] as const;

export const previewNumberStatuses = [
  { value: 'all', label: 'Any status' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'inactive', label: 'Inactive' },
] as const;

// ── API Keys ───────────────────────────────────────────────────────────────

export interface PreviewApiKey {
  id: string;
  name: string;
  createdAt: string;
  /// Valeur VOLONTAIREMENT fictive : préfixe `sk_preview_`, corps masqué et
  /// suffixe `example`. Elle ne suit aucun format de clé réel du projet et
  /// n'est copiée d'aucun fichier d'environnement.
  maskedKey: string;
  scope: string;
  status: 'active' | 'revoked';
  permission: 'Read & Write' | 'Read only';
}

export const previewApiKeys: readonly PreviewApiKey[] = [
  {
    id: 'preview-key-1',
    name: 'Default Key',
    createdAt: '16/06/2026',
    maskedKey: 'sk_preview_••••••••••••_example',
    scope: 'All profiles',
    status: 'active',
    permission: 'Read & Write',
  },
];

export const previewKeyStatuses = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'revoked', label: 'Revoked' },
] as const;

export const previewKeyPermissions = [
  { value: 'all', label: 'All perms' },
  { value: 'Read & Write', label: 'Read & Write' },
  { value: 'Read only', label: 'Read only' },
] as const;

export const previewKeyScopes = [
  { value: 'all-profiles', label: 'All profiles' },
] as const;

// ── Users ──────────────────────────────────────────────────────────────────

export interface PreviewMember {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Member';
  access: 'Full access' | 'Limited access';
  joined: string;
}

/// Unique membre : le propriétaire LOCAL de l'interface, repris du profil de
/// démonstration déjà utilisé par la sidebar et les paramètres. Aucun autre
/// utilisateur n'est fabriqué.
export const previewMembers: readonly PreviewMember[] = [
  {
    id: 'preview-member-1',
    name: demoProfile.name,
    email: demoProfile.email,
    role: 'Owner',
    access: 'Full access',
    joined: 'Jun 16, 2026',
  },
];

export const previewRoles = [
  { value: 'all', label: 'All roles' },
  { value: 'Owner', label: 'Owner' },
  { value: 'Admin', label: 'Admin' },
  { value: 'Member', label: 'Member' },
] as const;

export const previewAccessLevels = [
  { value: 'all', label: 'All access' },
  { value: 'Full access', label: 'Full access' },
  { value: 'Limited access', label: 'Limited access' },
] as const;

/// Rôles proposés dans le formulaire d'invitation (sans l'entrée « toutes »).
export const previewInviteRoles = ['Admin', 'Member'] as const;
export const previewInviteAccess = ['Full access', 'Limited access'] as const;

// ── Webhooks ───────────────────────────────────────────────────────────────

export interface PreviewWebhook {
  id: string;
  name: string;
  url: string;
  events: string[];
}

/// Aucun webhook au départ : l'écran ouvre sur son état vide, exactement comme
/// la maquette. Les webhooks « créés » ne vivent que dans l'état du composant.
export const previewWebhooks: readonly PreviewWebhook[] = [];

export interface PreviewEventGroup {
  category: string;
  events: readonly string[];
}

export const previewWebhookEvents: readonly PreviewEventGroup[] = [
  {
    category: 'Posts',
    events: [
      'post.scheduled',
      'post.published',
      'post.failed',
      'post.partial',
      'post.cancelled',
      'post.recycled',
      'post.platform.published',
      'post.platform.failed',
    ],
  },
];

/// En-tête de signature documenté dans le formulaire. Chaîne d'affichage
/// uniquement : aucune signature n'est calculée, aucune requête n'est émise.
export const WEBHOOK_SIGNATURE_HEADER = 'X-Rezouette-Signature';

export const WEBHOOK_URL_PLACEHOLDER = 'https://myapp.com/webhooks/rezouette';

// ── Logs ───────────────────────────────────────────────────────────────────

export interface PreviewLogEntry {
  id: string;
  time: string;
  status: 'success' | 'failed' | 'pending' | 'skipped';
  activity: string;
  platform: string;
  duration: string;
  message: string;
}

/// Aucune entrée : inventer un journal donnerait à croire que des événements
/// réels ont été enregistrés.
export const previewLogs: readonly PreviewLogEntry[] = [];

export const previewLogTimelines = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
] as const;

export const previewLogStatuses = [
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'pending', label: 'Pending' },
  { value: 'skipped', label: 'Skipped' },
] as const;

export const previewLogTypes = [
  { value: 'publishing', label: 'Publishing' },
  { value: 'connections', label: 'Connections' },
  { value: 'messaging', label: 'Messaging' },
  { value: 'workflows', label: 'Workflows' },
  { value: 'api', label: 'API Requests' },
] as const;

/// Sections de filtres repliables, encore sans critère disponible : elles
/// annoncent le périmètre à venir sans proposer de case inopérante.
export const previewLogFacets = [
  { id: 'route', label: 'Route' },
  { id: 'account', label: 'Account' },
  { id: 'errors', label: 'Errors' },
  { id: 'platform', label: 'Platform' },
] as const;
