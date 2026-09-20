/// Matrice des capacités réellement offertes par le backend Rezouette.
///
/// Établie par INSPECTION des controllers NestJS, pas par supposition : un mot
/// présent dans un modèle ou un port du domaine ne prouve rien tant qu'aucun
/// endpoint ne l'expose. Cette matrice est la source unique qui décide, pour
/// chaque écran, s'il consomme l'API, s'il n'en consomme qu'une partie, ou s'il
/// n'est qu'un aperçu visuel.
///
/// Contrôle effectué sur `zernio-backend/src/presentation/**` :
/// controllers existants — analytics, auth (meta/tiktok/linkedin/youtube),
/// media, scheduled-post, social-post, social, linkedin, youtube.
/// Aucun controller inbox, messages, comments, reviews, campaigns, contacts
/// ou workflows n'existe.

export type FeatureMode = 'real' | 'partial' | 'preview';

export interface FeatureCapability {
  mode: FeatureMode;
  /// Pourquoi ce mode — repris tel quel dans les notices affichées.
  reason?: string;
  /// Endpoints réellement consommés (mode `real` ou `partial`).
  endpoints?: readonly string[];
}

export const REZOUETTE_CAPABILITIES = {
  /// Historique des publications : entièrement disponible.
  posts: {
    mode: 'real',
    endpoints: ['GET /social/posts/user/:userId', 'GET /social/posts/:id'],
  },

  /// Planifications : liste, détail et annulation disponibles.
  postQueues: {
    mode: 'real',
    endpoints: [
      'GET /social/scheduled-posts?userId=',
      'DELETE /social/scheduled-posts/:id',
    ],
  },

  /// Détail d'une publication : le contenu et l'état par plateforme viennent de
  /// l'API ; les métriques d'engagement, non.
  postDetails: {
    mode: 'partial',
    reason:
      'Le contenu et les statuts par plateforme proviennent du backend. Les métriques d’engagement ne sont exposées par aucun endpoint.',
    endpoints: ['GET /social/posts/user/:userId'],
  },

  /// Métriques sociales par publication : AUCUN endpoint.
  /// `SocialProviderPort.getAnalytics()` existe dans le domaine mais lève
  /// « not yet implemented » dans les cinq providers, et aucun controller ne
  /// l'appelle. Les analytics disponibles (`/analytics/*`) sont des agrégats
  /// LOCAUX (compteurs de publications), pas des métriques de réseau social.
  postEngagementAnalytics: {
    mode: 'preview',
    reason:
      'Aucun endpoint n’expose les métriques sociales distantes (likes, partages, portée…).',
  },

  /// Lien public vers la publication : `SocialPostResponseDto` ne porte aucune
  /// URL. `PostPlatformResult.permalinkUrl` existe en base mais n'est exposé par
  /// aucun controller. Construire une URL depuis `externalPostId` ou `publishId`
  /// serait une invention — l'action « View » reste donc masquée.
  postExternalLinks: {
    mode: 'preview',
    reason: 'Le backend n’expose pas d’URL publique pour une publication.',
  },

  inboxMessages: {
    mode: 'preview',
    reason: 'Aucune API Inbox n’est encore disponible.',
  },

  /// Page hybride : la liste des publications est réelle, les commentaires non.
  comments: {
    mode: 'partial',
    reason:
      'Les publications proviennent du backend. Les commentaires ne sont synchronisés par aucun endpoint.',
    endpoints: ['GET /social/posts/user/:userId'],
  },

  reviews: {
    mode: 'preview',
    reason: 'Aucune API d’avis n’est encore disponible.',
  },

  campaigns: {
    mode: 'preview',
    reason: 'Aucune API de campagnes ou de diffusion n’est encore disponible.',
  },

  workflows: {
    mode: 'preview',
    reason: 'Aucune API d’automatisation n’est encore disponible.',
  },

  contacts: {
    mode: 'preview',
    reason: 'Aucune API de contacts n’est encore disponible.',
  },

  /// Import de publications par fichier : aucun endpoint d'import.
  postsCsvImport: {
    mode: 'preview',
    reason: 'Aucun service d’import n’est encore disponible.',
  },
} as const satisfies Record<string, FeatureCapability>;

export type CapabilityKey = keyof typeof REZOUETTE_CAPABILITIES;

/// Vrai si la fonctionnalité doit afficher la notice « aperçu frontend ».
export function isPreview(key: CapabilityKey): boolean {
  return REZOUETTE_CAPABILITIES[key].mode === 'preview';
}

/// Vrai si la fonctionnalité doit afficher la notice « données partielles ».
export function isPartial(key: CapabilityKey): boolean {
  return REZOUETTE_CAPABILITIES[key].mode === 'partial';
}
