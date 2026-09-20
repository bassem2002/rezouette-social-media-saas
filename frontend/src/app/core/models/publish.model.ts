import type { YouTubePublishOptions } from './youtube.model';

/// Publication multi-réseaux (POST /social/publish).
export type PublishPlatform =
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'youtube';

export interface PublishRequest {
  userId: string;
  platforms: PublishPlatform[];
  message?: string;
  caption?: string;
  imageUrl?: string;
  /// URL publique de la vidéo (requise si `tiktok` ou `youtube` est ciblé).
  videoUrl?: string;
  /// Lien/article — consommé uniquement par LinkedIn (publication immédiate).
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  /// Options YouTube — requises si `youtube` est ciblé, absentes sinon.
  youtubeOptions?: YouTubePublishOptions;
}

export interface PublishPlatformResult {
  platform: string;
  success: boolean;
  externalPostId?: string;
  error?: string;
  code?: number;
  subcode?: number;
  reason?: string;
  retryable?: boolean;
  action?: string;
  /// YouTube : vidéo acceptée mais ENCORE EN TRAITEMENT — elle n'est pas
  /// publiée, et aucune URL publique ne peut être construite.
  processing?: boolean;
  /// YouTube : identifiant de la vidéo, connu dès l'acceptation.
  publishId?: string;
}

export interface PublishResponse {
  success: boolean;
  results: PublishPlatformResult[];
}
