/// Options de publication propres à YouTube, mémorisées avec une planification.
///
/// Le vocabulaire métier (visibilité, titre, tags…) est PARTAGÉ avec la
/// publication immédiate : il vit dans `domain/social/value-objects/
/// youtube-video-options.ts`. Ce fichier n'ajoute que la spécificité de la
/// planification — `accountId` y est FACULTATIF (la chaîne peut n'être choisie
/// qu'au moment de l'envoi), alors qu'il est obligatoire à la publication.
///
/// Les symboles partagés sont RÉEXPORTÉS ci-dessous pour préserver les imports
/// existants (mappers, DTO, tests) : aucune valeur n'est dupliquée.

import {
  YOUTUBE_DEFAULT_PRIVACY_STATUS,
  YOUTUBE_DESCRIPTION_MAX_LENGTH,
  YOUTUBE_PRIVACY_STATUSES,
  YOUTUBE_TITLE_MAX_LENGTH,
  isYouTubePrivacyStatus,
  normalizeYouTubeTags,
} from '../../social/value-objects/youtube-video-options.js'
import type {
  YouTubePrivacyStatus,
  YouTubeVideoOptions,
} from '../../social/value-objects/youtube-video-options.js'

// Réexport de compatibilité : les mappers, DTO et tests importent déjà ces
// symboles depuis ce module. Ils restent définis à un seul endroit.
export {
  YOUTUBE_DEFAULT_PRIVACY_STATUS,
  YOUTUBE_PRIVACY_STATUSES,
  isYouTubePrivacyStatus,
}
export type { YouTubePrivacyStatus }

/// Options YouTube d'une planification — forme TOLÉRANTE.
///
/// Tous les champs sont optionnels, y compris `title` et `madeForKids`, pour une
/// raison de fidélité : une ligne persistée avant l'introduction des invariants
/// (ou insérée hors API) peut légitimement ne pas les porter. Les compléter par
/// des défauts ferait mentir la donnée — en particulier `madeForKids`, une
/// DÉCLARATION LÉGALE (COPPA) qui ne peut pas être supposée « false ».
///
/// La forme VALIDÉE, exigée pour publier, est `YouTubeVideoOptions` : on passe de
/// l'une à l'autre par `resolveYouTubeScheduleOptions`, jamais par un cast.
export type YouTubeScheduleOptions = Partial<YouTubeVideoOptions>

/// Échec de résolution des options programmées : la planification ne peut pas
/// être publiée en l'état. Erreur de DOMAINE — aucune dépendance framework, la
/// présentation la traduit en 400 et le scheduler en échec de ligne.
export class YouTubeScheduleOptionsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'YouTubeScheduleOptionsError'
  }
}

/// Longueur maximale d'un titre YouTube, réexportée pour la validation.
export { YOUTUBE_TITLE_MAX_LENGTH, YOUTUBE_DESCRIPTION_MAX_LENGTH }

/// Forme laxiste acceptée en entrée (corps HTTP partiel, JSON persisté
/// incomplet). La fabrique ci-dessous la complète en objet-valeur valide.
export interface YouTubeScheduleOptionsInput {
  title?: string
  description?: string
  tags?: string[]
  categoryId?: string
  privacyStatus?: YouTubePrivacyStatus
  madeForKids?: boolean
  containsSyntheticMedia?: boolean
  notifySubscribers?: boolean
  accountId?: string
}

/// Fabrique de la forme tolérante : copie les structures mutables et applique le
/// SEUL défaut sûr admissible — la visibilité `private`, qui n'expose rien.
///
/// `title` et `madeForKids` sont volontairement PRÉSERVÉS TELS QUELS, absence
/// comprise : inventer un titre vide ou une déclaration COPPA « false » ferait
/// mentir la donnée. Leur exigence est portée par
/// `resolveYouTubeScheduleOptions`, au moment de publier.
export function createYouTubeScheduleOptions(
  input: YouTubeScheduleOptionsInput,
): YouTubeScheduleOptions {
  return {
    privacyStatus: input.privacyStatus ?? YOUTUBE_DEFAULT_PRIVACY_STATUS,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.madeForKids !== undefined
      ? { madeForKids: input.madeForKids }
      : {}),
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    ...(input.tags !== undefined ? { tags: [...input.tags] } : {}),
    ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    ...(input.containsSyntheticMedia !== undefined
      ? { containsSyntheticMedia: input.containsSyntheticMedia }
      : {}),
    ...(input.notifySubscribers !== undefined
      ? { notifySubscribers: input.notifySubscribers }
      : {}),
    ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
  }
}

/// Copie défensive : `tags` est un tableau mutable, il ne doit jamais être
/// partagé entre l'appelant, l'entité et la persistance.
export function cloneYouTubeScheduleOptions(
  options: YouTubeScheduleOptions,
): YouTubeScheduleOptions {
  return {
    ...options,
    ...(options.tags ? { tags: [...options.tags] } : {}),
  }
}

/// Passage de la forme TOLÉRANTE (persistée) à la forme VALIDÉE, exigée pour
/// publier. Fonction métier PURE : aucune dépendance NestJS, Prisma, DTO ou
/// ConfigService — elle sert aussi bien à la création d'une planification qu'au
/// scheduler, garantissant des règles strictement identiques aux deux moments.
///
/// Lève `YouTubeScheduleOptionsError` avec un message sûr dès qu'un invariant
/// manque. Ne complète JAMAIS `madeForKids` : une déclaration légale absente est
/// une erreur, pas une valeur par défaut.
export function resolveYouTubeScheduleOptions(
  input: YouTubeScheduleOptions | null | undefined,
): YouTubeVideoOptions {
  if (!input) {
    throw new YouTubeScheduleOptionsError(
      'Les options YouTube (platformOptions.youtube) sont requises.',
    )
  }

  const accountId = input.accountId?.trim()
  if (!accountId) {
    throw new YouTubeScheduleOptionsError(
      'La chaîne YouTube cible (accountId) est requise.',
    )
  }

  const title = input.title?.trim()
  if (!title) {
    throw new YouTubeScheduleOptionsError(
      'Le titre de la vidéo YouTube est requis.',
    )
  }
  if (title.length > YOUTUBE_TITLE_MAX_LENGTH) {
    throw new YouTubeScheduleOptionsError(
      `Le titre YouTube dépasse ${YOUTUBE_TITLE_MAX_LENGTH} caractères.`,
    )
  }

  const description = input.description
  if (
    description !== undefined &&
    description.length > YOUTUBE_DESCRIPTION_MAX_LENGTH
  ) {
    throw new YouTubeScheduleOptionsError(
      `La description YouTube dépasse ${YOUTUBE_DESCRIPTION_MAX_LENGTH} caractères.`,
    )
  }

  // Déclaration COPPA : exigée explicitement, jamais supposée.
  if (typeof input.madeForKids !== 'boolean') {
    throw new YouTubeScheduleOptionsError(
      'La déclaration madeForKids est requise pour publier sur YouTube.',
    )
  }

  const privacyStatus = input.privacyStatus ?? YOUTUBE_DEFAULT_PRIVACY_STATUS
  if (!isYouTubePrivacyStatus(privacyStatus)) {
    throw new YouTubeScheduleOptionsError(
      'La visibilité YouTube doit valoir private, unlisted ou public.',
    )
  }

  const tags = normalizeYouTubeTags(input.tags)
  const categoryId = input.categoryId?.trim()

  return {
    accountId,
    title,
    privacyStatus,
    madeForKids: input.madeForKids,
    ...(description !== undefined ? { description } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(input.containsSyntheticMedia !== undefined
      ? { containsSyntheticMedia: input.containsSyntheticMedia }
      : {}),
    ...(input.notifySubscribers !== undefined
      ? { notifySubscribers: input.notifySubscribers }
      : {}),
  }
}
