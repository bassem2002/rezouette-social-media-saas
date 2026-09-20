/// Statut du cycle de vie d'un token Meta (GET /social/meta/token-status).
export type TokenStatus =
  | 'VALID'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'RECONNECT_REQUIRED';

export interface MetaTokenStatus {
  facebook: TokenStatus | null;
  instagram: TokenStatus | null;
  expiresAt: string | null;
  needsReconnect: boolean;
}

/// Statut du token TikTok (GET /social/tiktok/token-status). Compte unique
/// (contrairement à Meta qui agrège Facebook + Instagram).
export interface TikTokTokenStatus {
  status: TokenStatus;
  accountName: string | null;
  expiresAt: string | null;
  needsReconnect: boolean;
}

/// Statut du token LinkedIn (GET /social/linkedin/token-status). Compte membre
/// unique. L'access token vit ~60 j et N'est PAS rafraîchissable (app standard) :
/// RECONNECT_REQUIRED = nouveau flux OAuth. L'endpoint renvoie 503 si LinkedIn
/// n'est pas configuré côté backend (signal utilisé pour désactiver le bouton).
export interface LinkedInTokenStatus {
  status: TokenStatus;
  accountName: string | null;
  expiresAt: string | null;
  needsReconnect: boolean;
}
