/// Vocabulaire métier PARTAGÉ des options d'une vidéo YouTube, commun à la
/// publication immédiate et à la planification. Source unique : les valeurs de
/// visibilité ne doivent jamais être redéclarées ailleurs.
///
/// Objet-valeur du domaine : aucune dépendance à Prisma, NestJS, class-validator
/// ni à un DTO de présentation.

/// Visibilité d'une vidéo YouTube (valeurs de l'API Data v3, en minuscules).
export type YouTubePrivacyStatus = 'private' | 'unlisted' | 'public'

/// Valeurs admises, exposées pour la validation en présentation et les mappers.
export const YOUTUBE_PRIVACY_STATUSES: readonly YouTubePrivacyStatus[] = [
  'private',
  'unlisted',
  'public',
]

/// Visibilité retenue quand l'appelant n'en fournit aucune : toujours la moins
/// exposante. Politique du domaine — ni la présentation ni la persistance ne
/// doivent redéfinir ce défaut de leur côté.
export const YOUTUBE_DEFAULT_PRIVACY_STATUS: YouTubePrivacyStatus = 'private'

/// Vrai si la valeur est un statut de visibilité YouTube connu.
export function isYouTubePrivacyStatus(
  value: unknown,
): value is YouTubePrivacyStatus {
  return (
    typeof value === 'string' &&
    (YOUTUBE_PRIVACY_STATUSES as readonly string[]).includes(value)
  )
}

/// Limites imposées par l'API YouTube Data v3, exprimées ici pour que la
/// validation métier et la validation de présentation partagent les mêmes bornes.
export const YOUTUBE_TITLE_MAX_LENGTH = 100
export const YOUTUBE_DESCRIPTION_MAX_LENGTH = 5000

/// Options d'une vidéo à publier. `accountId` est OBLIGATOIRE : YouTube est
/// multi-chaînes, la destination doit toujours être explicite.
export interface YouTubeVideoOptions {
  title: string
  description?: string
  tags?: string[]
  /// Catégorie YouTube (identifiant numérique sous forme de chaîne, ex. '22').
  categoryId?: string
  privacyStatus: YouTubePrivacyStatus
  /// Déclaration « contenu destiné aux enfants » (obligation COPPA).
  madeForKids: boolean
  /// Déclaration de contenu synthétique/altéré.
  containsSyntheticMedia?: boolean
  notifySubscribers?: boolean
  /// Chaîne ciblée : id interne du SocialAccount.
  accountId: string
}

/// Normalise une liste de tags : trim, suppression des valeurs vides puis des
/// doublons (ordre de première apparition conservé). Règle unique, partagée par
/// la publication immédiate et la planification.
export function normalizeYouTubeTags(tags: readonly string[] | undefined): string[] {
  if (!tags) return []
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
}
