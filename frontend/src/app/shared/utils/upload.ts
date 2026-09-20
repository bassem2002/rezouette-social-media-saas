/// Règles de validation d'upload — alignées sur le backend (source unique côté
/// front). Évite un aller-retour réseau pour les erreurs évidentes.
export type MediaKind = 'image' | 'video';

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/// Formats vidéo alignés sur TikTok Content Posting API (MP4/MOV/WEBM).
export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 Mo
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 Mo (défaut backend)

export const IMAGE_ACCEPT_ATTR = 'image/jpeg,image/png,image/webp';
export const VIDEO_ACCEPT_ATTR = 'video/mp4,video/quicktime,video/webm';

/// Attribut `accept` de l'<input file> selon la nature attendue.
export function acceptAttrFor(kind: MediaKind): string {
  return kind === 'image' ? IMAGE_ACCEPT_ATTR : VIDEO_ACCEPT_ATTR;
}

/// Valide un fichier côté client selon sa nature. Renvoie un message d'erreur
/// ou null si OK.
export function validateMediaFile(file: File, kind: MediaKind): string | null {
  if (kind === 'image') {
    if (
      !ALLOWED_IMAGE_TYPES.includes(
        file.type as (typeof ALLOWED_IMAGE_TYPES)[number],
      )
    ) {
      return 'Format non supporté. Utilisez JPEG, PNG ou WEBP.';
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return 'Fichier trop volumineux (maximum 10 Mo).';
    }
    return null;
  }

  if (
    !ALLOWED_VIDEO_TYPES.includes(
      file.type as (typeof ALLOWED_VIDEO_TYPES)[number],
    )
  ) {
    return 'Format non supporté. Utilisez MP4, MOV ou WEBM.';
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return 'Vidéo trop volumineuse (maximum 100 Mo).';
  }
  return null;
}
