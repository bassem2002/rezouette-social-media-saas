/// Données et libellés des écrans Ads, SMS et Settings.
///
/// ⚠️ Audit du 12/08/2026 : le backend n'expose AUCUN controller pour ces
/// domaines (ni publicité, ni SMS, ni profil, ni sécurité, ni notifications,
/// ni intégrations). Tout ce fichier est donc de la donnée d'affichage, tenue
/// à l'écart des modèles réels de `core/models/`.
///
/// Deux zones demandent une prudence particulière et sont traitées en
/// conséquence dans les composants :
///
/// 1. Clés d'API des fournisseurs d'IA — les champs sont DÉSACTIVÉS. Un
///    formulaire qui accepterait une clé réelle sans backend la laisserait en
///    mémoire d'une page qui promet un chiffrement inexistant.
/// 2. Sessions actives — aucune session n'est fabriquée. Inventer un appareil
///    et une adresse IP ferait croire à une connexion inconnue.

// ── Ads ────────────────────────────────────────────────────────────────────

export interface PreviewAdCampaign {
  readonly preview: true;
  id: string;
  name: string;
  platform: string;
  status: string;
  spend: string;
  results: string;
  date: string;
}

export const previewAdCampaigns: readonly PreviewAdCampaign[] = [];
export const previewAudiences: readonly { id: string; name: string }[] = [];
export const previewLeadForms: readonly { id: string; name: string }[] = [];

export const previewAdFilters = {
  profiles: [{ value: 'all', label: 'All profiles' }],
  ads: [{ value: 'all', label: 'All ads' }],
  platforms: [
    { value: 'all', label: 'All platforms' },
    { value: 'FACEBOOK', label: 'Facebook' },
    { value: 'INSTAGRAM', label: 'Instagram' },
  ],
  accounts: [{ value: 'all', label: 'All accounts' }],
  statuses: [{ value: 'all', label: 'All statuses' }],
  ranges: [
    { value: '30d', label: 'Last 30 days' },
    { value: '7d', label: 'Last 7 days' },
    { value: '90d', label: 'Last 90 days' },
  ],
  sort: [
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
  ],
} as const;

// ── SMS ────────────────────────────────────────────────────────────────────

export const previewBrands: readonly { id: string; name: string }[] = [];
export const previewSenderIds: readonly { id: string; name: string }[] = [];

// ── Settings ───────────────────────────────────────────────────────────────

/// Préférences de notification. Les valeurs par défaut ne sont PAS lues d'un
/// serveur : elles décrivent l'intention par défaut du produit et ne survivent
/// pas au rechargement.
export const previewNotificationPrefs = [
  {
    id: 'post-failures',
    label: 'Post Failures',
    description: 'Get notified when scheduled posts fail to publish',
    enabled: true,
  },
  {
    id: 'account-disconnects',
    label: 'Account Disconnects',
    description: 'Get notified when social accounts get disconnected',
    enabled: true,
  },
  {
    id: 'payment-alerts',
    label: 'Payment Alerts',
    description: 'Get notified about payment failures and billing notices',
    enabled: true,
  },
  {
    id: 'usage-alerts',
    label: 'Usage Alerts',
    description: 'Receive warnings when approaching or reaching your plan limits',
    enabled: true,
  },
  {
    id: 'marketing-emails',
    label: 'Marketing Emails',
    description: 'Occasional product updates, tips, and promotional emails',
    enabled: false,
  },
] as const;

/// Fournisseurs d'IA listés à titre indicatif. `hint` décrit le format attendu
/// SANS donner d'exemple copiable, et aucun champ n'est saisissable.
export const previewAiProviders = [
  { id: 'anthropic', name: 'Anthropic', models: 'Claude Opus / Sonnet / Haiku', hint: 'Commence par sk-ant-…' },
  { id: 'openai', name: 'OpenAI', models: 'GPT-4o, GPT-4.1, variantes mini', hint: 'Commence par sk-…' },
  { id: 'gemini', name: 'Google Gemini', models: 'Gemini 3 / 2.5 Pro / Flash', hint: 'Commence par AIza… ou AQ…' },
  { id: 'mistral', name: 'Mistral', models: 'Mistral Large / Small', hint: '32 caractères alphanumériques ou plus' },
  { id: 'groq', name: 'Groq', models: 'Llama sur Groq Cloud', hint: 'Commence par gsk_…' },
  { id: 'openrouter', name: 'OpenRouter', models: 'Une clé, tous les modèles', hint: 'Commence par sk-or-v1-…' },
] as const;

/// Seuil de déblocage de Slack Connect. Le NOMBRE de comptes connectés affiché
/// sur cette page est, lui, bien réel (`GET /social/accounts`).
export const SLACK_UNLOCK_THRESHOLD = 2000;

export const SETTINGS_PREVIEW_MESSAGES = {
  profileSaved:
    'Profil non enregistré : aucun endpoint utilisateur n’existe encore côté backend Rezouette.',
  avatarUpload:
    'L’envoi d’un avatar sera disponible lorsque le service de profil sera connecté.',
  password:
    'La gestion du mot de passe sera disponible avec le service d’authentification.',
  twoStep:
    'La vérification en deux étapes sera disponible avec le service d’authentification.',
  signOut:
    'Aucune session n’a été fermée : le service d’authentification n’est pas connecté.',
  notifications:
    'Préférences non enregistrées : elles ne survivront pas au rechargement de la page.',
  connectedApps:
    'La gestion des applications connectées sera disponible avec le service OAuth.',
  slack:
    'Slack Connect sera disponible lorsque le service de support sera connecté.',
  aiProviders:
    'Aucune clé ne peut être saisie ni enregistrée : le service de fournisseurs d’IA n’existe pas encore.',
  sso: 'Le SSO sera disponible avec une offre Enterprise et le service d’authentification correspondant.',
  deleteAccount:
    'Aucune suppression n’est possible : le service de compte n’est pas connecté au backend Rezouette.',
  ads: 'Le service publicitaire n’est pas encore connecté au backend Rezouette.',
  sms: 'Le service SMS n’est pas encore connecté au backend Rezouette.',
} as const;
