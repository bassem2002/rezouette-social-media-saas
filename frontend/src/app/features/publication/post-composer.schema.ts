import {
  YOUTUBE_DESCRIPTION_MAX,
  YOUTUBE_PRIVACY_STATUSES,
  YOUTUBE_TITLE_MAX,
  type YouTubePrivacyStatus,
} from '@core/models';

/// Validation du composer (port du schéma zod React vers une fonction pure).
/// Renvoie une map d'erreurs par champ (vide = formulaire valide).
export const MESSAGE_MAX = 5000;
export const CAPTION_MAX = 2200;
/// LinkedIn : le commentaire d'un post membre est plafonné à 3000 caractères.
export const LINKEDIN_TEXT_MAX = 3000;

export { YOUTUBE_TITLE_MAX, YOUTUBE_DESCRIPTION_MAX };

export interface ComposerValues {
  facebook: boolean;
  instagram: boolean;
  tiktok: boolean;
  linkedin: boolean;
  youtube: boolean;
  message: string;
  caption: string;
  imageUrl: string;
  videoUrl: string;
  /// Lien/article — utilisé uniquement par LinkedIn (publication immédiate).
  linkUrl: string;
  /// Chaîne YouTube ciblée : id INTERNE du SocialAccount, jamais le channelId.
  youtubeAccountId: string;
  youtubeTitle: string;
  youtubeDescription: string;
  /// Saisie libre, séparée par des virgules ; normalisée à l'envoi.
  youtubeTags: string;
  youtubeCategoryId: string;
  youtubePrivacyStatus: YouTubePrivacyStatus;
  /// ⚠️ `null` = NON DÉCLARÉ. Jamais `false` par défaut : c'est une déclaration
  /// légale (COPPA) que l'utilisateur doit poser explicitement.
  youtubeMadeForKids: boolean | null;
  youtubeContainsSyntheticMedia: boolean;
  youtubeNotifySubscribers: boolean;
}

/// Normalise la saisie libre de tags : découpe, trim, vides et doublons retirés.
/// Mêmes règles que le backend — aucune limite de nombre n'est inventée.
export function parseYouTubeTags(raw: string): string[] {
  return [...new Set(raw.split(',').map((tag) => tag.trim()).filter(Boolean))];
}

export type ComposerField = keyof ComposerValues;
export type ComposerErrors = Partial<Record<ComposerField, string>>;

export const composerDefaults: ComposerValues = {
  facebook: true,
  instagram: false,
  tiktok: false,
  linkedin: false,
  youtube: false,
  message: '',
  caption: '',
  imageUrl: '',
  videoUrl: '',
  linkUrl: '',
  youtubeAccountId: '',
  youtubeTitle: '',
  youtubeDescription: '',
  youtubeTags: '',
  youtubeCategoryId: '',
  // Défaut le moins exposant, aligné sur le backend.
  youtubePrivacyStatus: 'private',
  // Volontairement `null` : l'utilisateur DOIT trancher.
  youtubeMadeForKids: null,
  youtubeContainsSyntheticMedia: false,
  youtubeNotifySubscribers: false,
};

export function validateComposer(values: ComposerValues): ComposerErrors {
  const errors: ComposerErrors = {};

  if (values.message.length > MESSAGE_MAX) {
    errors.message = `${MESSAGE_MAX} caractères maximum`;
  }
  if (values.caption.length > CAPTION_MAX) {
    errors.caption = `${CAPTION_MAX} caractères maximum`;
  }
  if (
    !values.facebook &&
    !values.instagram &&
    !values.tiktok &&
    !values.linkedin &&
    !values.youtube
  ) {
    errors.facebook = 'Sélectionnez au moins une plateforme.';
  }
  if (values.imageUrl && !/^https?:\/\/.+/i.test(values.imageUrl)) {
    errors.imageUrl = 'URL invalide — elle doit commencer par http(s)://';
  }
  if (values.videoUrl && !/^https?:\/\/.+/i.test(values.videoUrl)) {
    errors.videoUrl = 'URL invalide — elle doit commencer par http(s)://';
  }
  if (values.linkUrl && !/^https?:\/\/.+/i.test(values.linkUrl)) {
    errors.linkUrl = 'URL invalide — elle doit commencer par http(s)://';
  }
  if (values.instagram && !values.imageUrl) {
    errors.imageUrl = 'Instagram exige une image (URL publique).';
  }
  if (values.tiktok && !values.videoUrl) {
    errors.videoUrl = 'TikTok exige une vidéo (URL publique).';
  }
  if (values.facebook && !values.message.trim() && !values.imageUrl) {
    errors.message = 'Ajoutez un message ou une image pour Facebook.';
  }
  // LinkedIn (profil membre) : au moins un texte, une image ou un lien.
  if (
    values.linkedin &&
    !values.message.trim() &&
    !values.imageUrl.trim() &&
    !values.linkUrl.trim()
  ) {
    errors.linkedin = 'Ajoutez un texte, une image ou un lien pour LinkedIn.';
  }
  if (values.linkedin && values.message.length > LINKEDIN_TEXT_MAX) {
    errors.linkedin = `${LINKEDIN_TEXT_MAX} caractères maximum pour LinkedIn`;
  }

  // YouTube — validé UNIQUEMENT quand la plateforme est sélectionnée : ses
  // champs peuvent conserver leurs valeurs sans bloquer les autres réseaux.
  if (values.youtube) {
    if (!values.videoUrl.trim()) {
      errors.videoUrl = 'YouTube exige une vidéo (URL publique).';
    }
    if (!values.youtubeAccountId) {
      errors.youtubeAccountId = 'Choisissez la chaîne YouTube de destination.';
    }
    const title = values.youtubeTitle.trim();
    if (!title) {
      errors.youtubeTitle = 'Le titre de la vidéo est requis.';
    } else if (title.length > YOUTUBE_TITLE_MAX) {
      errors.youtubeTitle = `${YOUTUBE_TITLE_MAX} caractères maximum`;
    }
    if (values.youtubeDescription.length > YOUTUBE_DESCRIPTION_MAX) {
      errors.youtubeDescription = `${YOUTUBE_DESCRIPTION_MAX} caractères maximum`;
    }
    // Déclaration légale : ni supposée, ni pré-cochée.
    if (typeof values.youtubeMadeForKids !== 'boolean') {
      errors.youtubeMadeForKids =
        'Indiquez si la vidéo est destinée aux enfants (obligation légale).';
    }
    if (
      !(YOUTUBE_PRIVACY_STATUSES as readonly string[]).includes(
        values.youtubePrivacyStatus,
      )
    ) {
      errors.youtubePrivacyStatus = 'Confidentialité invalide.';
    }
  }

  return errors;
}
