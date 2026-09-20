import type { TokenStatus } from './token.model';

/// Contrats YouTube — miroirs EXACTS des DTO NestJS.
///
/// ⚠️ Aucun token ne figure ici : le backend n'expose ni `accessToken`, ni
/// `refreshToken`, ni `youtubeCredentialGroupId`. Le frontend ne doit jamais
/// détenir, stocker ni transmettre de jeton YouTube.

export type YouTubePrivacyStatus = 'private' | 'unlisted' | 'public';

export const YOUTUBE_PRIVACY_STATUSES: readonly YouTubePrivacyStatus[] = [
  'private',
  'unlisted',
  'public',
];

export const YOUTUBE_PRIVACY_LABELS: Record<YouTubePrivacyStatus, string> = {
  private: 'Privée',
  unlisted: 'Non répertoriée',
  public: 'Publique',
};

/// Limites imposées par l'API YouTube, alignées sur la validation backend.
export const YOUTUBE_TITLE_MAX = 100;
export const YOUTUBE_DESCRIPTION_MAX = 5000;

export interface YouTubeChannelMetadata {
  thumbnailUrl?: string;
  customUrl?: string;
  uploadsPlaylistId?: string;
  subscriberCount?: string;
  videoCount?: string;
  hiddenSubscriberCount?: boolean;
}

/// GET /social/youtube/accounts — une entrée par chaîne (un compte Google peut
/// en exposer plusieurs).
export interface YouTubeAccount {
  id: string;
  externalAccountId: string;
  accountName: string;
  platform: 'youtube';
  status: string;
  needsReconnect: boolean;
  tokenExpiresAt: string | null;
  scopes: string[];
  metadata: YouTubeChannelMetadata | null;
}

/// GET /social/youtube/token-status — statut par chaîne.
export interface YouTubeTokenStatusAccount {
  accountId: string;
  channelId: string;
  accountName: string;
  status: TokenStatus;
  expiresAt: string | null;
  needsReconnect: boolean;
  /// Booléen seul : le refresh token lui-même n'est jamais exposé.
  hasRefreshToken: boolean;
}

export interface YouTubeTokenStatusResponse {
  accounts: YouTubeTokenStatusAccount[];
}

/// Options envoyées à la publication. `accountId` est l'id INTERNE du
/// SocialAccount (jamais le channelId), et `madeForKids` est obligatoire :
/// c'est une déclaration légale (COPPA) que le backend refuse de supposer.
export interface YouTubePublishOptions {
  accountId: string;
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: YouTubePrivacyStatus;
  madeForKids: boolean;
  containsSyntheticMedia?: boolean;
  notifySubscribers?: boolean;
}

/// Options YouTube telles que RELUES d'une planification.
///
/// Tout est nullable : une planification créée avant l'introduction des
/// invariants peut ne porter ni titre ni déclaration COPPA. L'interface doit
/// afficher « non renseigné » — jamais fabriquer `false` ou une chaîne vide.
export interface YouTubeScheduledOptions {
  accountId?: string | null;
  title: string | null;
  description: string | null;
  tags: string[];
  categoryId: string | null;
  privacyStatus: YouTubePrivacyStatus | null;
  madeForKids: boolean | null;
  containsSyntheticMedia: boolean | null;
  notifySubscribers: boolean | null;
}

/// Raisons d'échec YouTube normalisées par le backend, traduites pour l'UI.
/// Le fallback couvre toute raison inconnue sans afficher de code brut.
const YOUTUBE_ERROR_LABELS: Record<string, string> = {
  RECONNECT_REQUIRED:
    'Autorisation YouTube expirée. Reconnectez la chaîne pour republier.',
  REFRESH_TOKEN_MISSING:
    'Aucune autorisation durable pour cette chaîne. Reconnectez-la.',
  UPLOAD_SCOPE_MISSING:
    'La permission d’envoi de vidéos n’a pas été accordée. Reconnectez la chaîne en acceptant l’accès demandé.',
  PERMISSION_DENIED: 'YouTube a refusé cette opération pour cette chaîne.',
  CHANNEL_NOT_FOUND: 'La chaîne YouTube ciblée est introuvable.',
  VIDEO_NOT_FOUND:
    'La vidéo est introuvable sur YouTube. Vérifiez votre chaîne dans YouTube Studio.',
  VIDEO_REJECTED:
    'YouTube a refusé cette vidéo (droits d’auteur, conditions d’utilisation…).',
  PROCESSING_FAILED: 'Le traitement de la vidéo a échoué côté YouTube.',
  UPLOAD_FAILED: 'L’envoi de la vidéo vers YouTube a échoué.',
  UPLOAD_SESSION_EXPIRED: 'L’envoi a expiré. Relancez la publication.',
  INVALID_VIDEO: 'Le fichier vidéo est invalide ou introuvable.',
  INVALID_TITLE: 'Le titre de la vidéo est invalide.',
  INVALID_CATEGORY: 'La catégorie YouTube choisie est invalide.',
  INVALID_PARAMETER: 'Une information envoyée à YouTube est invalide.',
  QUOTA_EXCEEDED:
    'Quota YouTube dépassé. Réessayez demain — la limite se réinitialise chaque jour.',
  DAILY_UPLOAD_LIMIT:
    'Limite quotidienne d’envois atteinte pour cette chaîne. Réessayez demain.',
  RATE_LIMITED: 'Trop de requêtes vers YouTube. Réessayez dans quelques minutes.',
  PUBLISHING_NOT_CONFIGURED:
    'La publication YouTube n’est pas activée sur ce serveur.',
  TIMEOUT: 'YouTube n’a pas répondu à temps. Réessayez.',
  TOKEN_EXPIRED: 'La session YouTube a expiré. Réessayez ou reconnectez la chaîne.',
};

/// Message lisible pour une raison d'échec YouTube. Ne renvoie jamais un code
/// technique brut à l'utilisateur.
export function youtubeErrorLabel(
  reason: string | null | undefined,
  fallbackMessage?: string | null,
): string {
  if (reason && YOUTUBE_ERROR_LABELS[reason]) return YOUTUBE_ERROR_LABELS[reason];
  return fallbackMessage?.trim() || 'La publication YouTube a échoué.';
}
