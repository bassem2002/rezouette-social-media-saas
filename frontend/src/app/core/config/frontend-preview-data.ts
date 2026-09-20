/// Données de démonstration des écrans Posts et Inbox non branchés au backend.
///
/// ⚠️ Rien de ce fichier n'existe côté serveur. Chaque objet porte
/// `preview: true` : ce marqueur suit la donnée jusqu'à l'affichage et rend
/// impossible de la confondre avec une réponse d'API. Aucun de ces types n'est
/// réutilisé dans les contrats de `core/models/*.model.ts`, et aucun de ces
/// objets n'est jamais envoyé au backend.
///
/// Voir `feature-capabilities.ts` pour savoir quel écran dépend d'ici.

/// Marqueur commun — présent sur TOUTE donnée d'aperçu.
export interface PreviewRecord {
  readonly preview: true;
}

// ── Métriques d'une publication (aperçu) ───────────────────────────────────

/// Une ligne du tableau d'analytics par plateforme. `null` = métrique non
/// fournie ; l'écran affiche alors « — », jamais 0.
export interface PreviewPostMetrics extends PreviewRecord {
  platform: string;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
  views: number | null;
  follows: number | null;
  impressions: number | null;
  reach: number | null;
}

export const previewPostMetrics: readonly PreviewPostMetrics[] = [
  {
    preview: true,
    platform: 'FACEBOOK',
    likes: null,
    comments: 1,
    shares: null,
    saves: null,
    clicks: null,
    views: null,
    follows: null,
    impressions: 7,
    reach: 1,
  },
];

/// Point d'une série temporelle d'aperçu.
export interface PreviewMetricPoint {
  date: string;
  values: Record<string, number>;
}

/// Séries d'engagement — volontairement plates et de faible amplitude : une
/// courbe spectaculaire donnerait à l'aperçu une crédibilité qu'il n'a pas.
export const previewEngagementSeries: readonly PreviewMetricPoint[] = [
  { date: '2026-06-26', values: { comments: 0, likes: 0, saves: 0, shares: 0 } },
  { date: '2026-06-29', values: { comments: 1, likes: 0, saves: 0, shares: 0 } },
  { date: '2026-07-03', values: { comments: 1, likes: 0, saves: 0, shares: 0 } },
  { date: '2026-07-07', values: { comments: 1, likes: 0, saves: 0, shares: 0 } },
  { date: '2026-07-11', values: { comments: 1, likes: 0, saves: 0, shares: 0 } },
  { date: '2026-07-15', values: { comments: 1, likes: 0, saves: 0, shares: 0 } },
  { date: '2026-07-19', values: { comments: 1, likes: 0, saves: 0, shares: 0 } },
  { date: '2026-07-24', values: { comments: 1, likes: 0, saves: 0, shares: 0 } },
  { date: '2026-08-01', values: { comments: 1, likes: 0, saves: 0, shares: 0 } },
];

export const previewReachSeries: readonly PreviewMetricPoint[] = [
  { date: '2026-06-26', values: { impressions: 0, reach: 0, views: 0 } },
  { date: '2026-06-29', values: { impressions: 7, reach: 1, views: 0 } },
  { date: '2026-07-03', values: { impressions: 7, reach: 1, views: 0 } },
  { date: '2026-07-07', values: { impressions: 7, reach: 1, views: 0 } },
  { date: '2026-07-11', values: { impressions: 7, reach: 1, views: 0 } },
  { date: '2026-07-15', values: { impressions: 7, reach: 1, views: 0 } },
  { date: '2026-07-19', values: { impressions: 7, reach: 1, views: 0 } },
  { date: '2026-07-24', values: { impressions: 7, reach: 1, views: 0 } },
  { date: '2026-08-01', values: { impressions: 7, reach: 1, views: 0 } },
];

// ── Inbox ──────────────────────────────────────────────────────────────────

export interface PreviewConversation extends PreviewRecord {
  id: string;
  contact: string;
  platform: string;
  lastMessage: string;
  updatedAt: string;
  unread: number;
}

/// Aucune conversation : l'écran s'ouvre sur son état vide, comme la maquette.
/// Inventer des conversations rattachées à de vrais comptes serait le mensonge
/// le plus coûteux de cette étape.
export const previewConversations: readonly PreviewConversation[] = [];

export interface PreviewComment extends PreviewRecord {
  id: string;
  author: string;
  message: string;
  createdAt: string;
}

/// Aucun commentaire : ils seraient rattachés à de VRAIES publications.
export const previewComments: readonly PreviewComment[] = [];

export interface PreviewReview extends PreviewRecord {
  id: string;
  author: string;
  rating: number;
  message: string;
  createdAt: string;
  platform: string;
}

export const previewReviews: readonly PreviewReview[] = [];

export interface PreviewBroadcast extends PreviewRecord {
  id: string;
  name: string;
  account: string;
  message: string;
  delivery: string;
  date: string;
}

export const previewBroadcasts: readonly PreviewBroadcast[] = [];

export interface PreviewSequence extends PreviewRecord {
  id: string;
  name: string;
  steps: number;
  status: string;
}

export const previewSequences: readonly PreviewSequence[] = [];

export interface PreviewCommentToDm extends PreviewRecord {
  id: string;
  platform: string;
  keyword: string;
  reply: string;
  status: string;
}

export const previewCommentToDm: readonly PreviewCommentToDm[] = [];

export interface PreviewWorkflow extends PreviewRecord {
  id: string;
  name: string;
  trigger: string;
  actions: number;
  status: string;
  lastRun: string | null;
}

export const previewWorkflows: readonly PreviewWorkflow[] = [];

export interface PreviewContact extends PreviewRecord {
  id: string;
  name: string;
  identifier: string;
  tags: string[];
  status: string;
  lastActive: string | null;
}

export const previewContacts: readonly PreviewContact[] = [];

// ── Options de filtres partagées par les écrans Inbox ──────────────────────

export const previewPlatformFilters = [
  { value: 'all', label: 'All platforms' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'LINKEDIN', label: 'LinkedIn' },
  { value: 'YOUTUBE', label: 'YouTube' },
] as const;

export const previewProfileFilters = [
  { value: 'all', label: 'All profiles' },
] as const;

export const previewAccountFilters = [
  { value: 'all', label: 'All accounts' },
] as const;

export const previewSortFilters = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
] as const;

export const previewStatusFilters = [
  { value: 'all', label: 'All statuses' },
] as const;

export const previewTriggerFilters = [
  { value: 'all', label: 'All triggers' },
] as const;

// ── Messages d'action ──────────────────────────────────────────────────────

export const INBOX_PREVIEW_MESSAGES = {
  newMessage:
    'Nouveau message simulé. Le service de messagerie n’est pas encore connecté au backend Rezouette.',
  broadcast:
    'Broadcast simulé. Aucun message n’a été envoyé. Le service Campaigns n’est pas encore connecté au backend Rezouette.',
  sequence:
    'Séquence simulée. Aucune automatisation n’a été créée côté serveur.',
  commentToDm:
    'Automatisation simulée. Aucun commentaire ne sera surveillé et aucun message ne sera envoyé.',
  workflow:
    'Workflow simulé. Aucune exécution n’a été programmée côté serveur.',
  contactAdded:
    'Contact simulé. Il n’est enregistré nulle part et disparaîtra au rechargement.',
  contactImport:
    'Aucun fichier n’a été envoyé. L’import de contacts sera disponible avec le service Contacts.',
  csvImport:
    'L’import CSV sera disponible lors de l’intégration du service d’import Rezouette.',
} as const;
