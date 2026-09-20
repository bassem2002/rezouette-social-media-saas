import type { PublishPlatform } from './publish.model';
import type {
  YouTubePublishOptions,
  YouTubeScheduledOptions,
} from './youtube.model';

/// Publications programmées (/social/scheduled-posts).
export type ScheduledPlatform =
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'TIKTOK'
  | 'LINKEDIN'
  | 'YOUTUBE';

export type ScheduledPostStatus =
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'CANCELLED';

/// Options par plateforme relues d'une planification. `null` = aucune option.
export interface ScheduledPlatformOptions {
  youtube?: YouTubeScheduledOptions;
}

export interface ScheduledPost {
  id: string;
  userId: string;
  platforms: ScheduledPlatform[];
  message: string | null;
  caption: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  /// Options spécifiques par plateforme (métadonnées YouTube). Les champs
  /// peuvent être `null` sur une planification héritée : l'UI affiche alors
  /// « non renseigné », elle ne fabrique jamais de valeur.
  platformOptions: ScheduledPlatformOptions | null;
  scheduledAt: string;
  status: ScheduledPostStatus;
  attempts: number;
  lastError: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduledPostRequest {
  userId: string;
  platforms: PublishPlatform[];
  message?: string;
  caption?: string;
  imageUrl?: string;
  /// URL publique de la vidéo (requise si `tiktok` ou `youtube` est ciblé).
  videoUrl?: string;
  /// Options par plateforme. ⚠️ La planification utilise `platformOptions.youtube`,
  /// PAS `youtubeOptions` (réservé à la publication immédiate).
  platformOptions?: { youtube?: YouTubePublishOptions };
  scheduledAt: string;
}

/// Statut encore annulable côté UI (le backend n'autorise que SCHEDULED).
export const CANCELLABLE_STATUS: ScheduledPostStatus = 'SCHEDULED';
