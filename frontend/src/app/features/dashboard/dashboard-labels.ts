import type { BadgeTone } from '@/shared/ui/badge.component';

/// Traductions d'affichage des valeurs renvoyées par l'API (majuscules DB).
///
/// Une plateforme ou un statut inconnu N'est PAS masqué : on affiche la valeur
/// brute. Masquer reviendrait à faire disparaître des publications réelles du
/// tableau de bord — exactement le défaut qui avait rendu LinkedIn puis YouTube
/// invisibles dans la répartition.

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  LINKEDIN: 'LinkedIn',
  YOUTUBE: 'YouTube',
};

/// Teintes distinctes et lisibles côte à côte dans un donut ou une légende.
const PLATFORM_COLORS: Record<string, string> = {
  FACEBOOK: '#2563eb',
  INSTAGRAM: '#dc8a00',
  TIKTOK: '#171717',
  LINKEDIN: '#0e7490',
  YOUTUBE: '#d92d20',
};

const STATUS_LABELS: Record<string, string> = {
  PUBLISHED: 'Publiées',
  FAILED: 'Échecs',
  PENDING: 'En traitement',
  SCHEDULED: 'Planifiée',
};

const STATUS_COLORS: Record<string, string> = {
  PUBLISHED: '#079455',
  FAILED: '#d92d20',
  PENDING: '#dc8a00',
  SCHEDULED: '#2563eb',
};

const STATUS_TONES: Record<string, BadgeTone> = {
  PUBLISHED: 'success',
  FAILED: 'error',
  PENDING: 'warning',
  SCHEDULED: 'primary',
};

const FALLBACK_COLOR = '#8a8a8a';

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

export function platformColor(platform: string): string {
  return PLATFORM_COLORS[platform] ?? FALLBACK_COLOR;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? FALLBACK_COLOR;
}

export function statusTone(status: string): BadgeTone {
  return STATUS_TONES[status] ?? 'muted';
}

/// Clé d'icône de plateforme attendue par `app-platform-icon` (minuscules).
export function platformIconKey(platform: string): string {
  return platform.toLowerCase();
}
