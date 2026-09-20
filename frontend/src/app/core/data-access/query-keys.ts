/// Clés de cache centralisées (TanStack Query). Des **tuples** (et non des
/// chaînes) : c'est la forme idiomatique de TanStack, qui permet l'invalidation
/// partielle par préfixe (ex. `['posts']` invalide toutes les requêtes posts).
export const queryKeys = {
  posts: (userId: string) => ['posts', userId] as const,
  post: (id: string) => ['post', id] as const,
  accounts: (userId: string) => ['accounts', userId] as const,
  tokenStatus: (userId: string) => ['token-status', userId] as const,
  tiktokTokenStatus: (userId: string) => ['tiktok-token-status', userId] as const,
  linkedinTokenStatus: (userId: string) =>
    ['linkedin-token-status', userId] as const,
  /// YouTube est multi-chaînes : deux clés distinctes (comptes et statuts des
  /// tokens), toutes deux portées par le userId pour une invalidation ciblée
  /// après reconnexion. Aucune clé n'est dérivée d'un token ou d'un groupe de
  /// credentials — ces valeurs n'atteignent jamais le frontend.
  youtube: {
    accounts: (userId: string) => ['youtube', 'accounts', userId] as const,
    tokenStatus: (userId: string) =>
      ['youtube', 'token-status', userId] as const,
    /// Préfixe d'invalidation : purge comptes ET statuts en une fois.
    all: (userId: string) => ['youtube', userId] as const,
  },
  scheduledPosts: (userId: string) => ['scheduled-posts', userId] as const,
  scheduledPost: (id: string) => ['scheduled-post', id] as const,
  analytics: (section: string, userId: string) =>
    ['analytics', section, userId] as const,
  /// Tableau de bord : la fenêtre fait partie de la clé, sinon un changement de
  /// période resservirait le cache de la période précédente.
  dashboard: {
    overview: (userId: string, range: string) =>
      ['dashboard', 'overview', userId, range] as const,
    /// Préfixe d'invalidation : purge toutes les fenêtres d'un utilisateur.
    all: (userId: string) => ['dashboard', 'overview', userId] as const,
  },
} as const;
