import {
  cloneYouTubeScheduleOptions,
  type YouTubeScheduleOptions,
} from './youtube-schedule-options.js'

/// Options spécifiques à une plateforme attachées à une planification, indexées
/// par réseau. Structure ouverte à l'extension : un nouveau réseau ajoute sa clé
/// sans migration ni colonne dédiée (persistance en JSON côté infrastructure).
export interface ScheduledPlatformOptions {
  youtube?: YouTubeScheduleOptions
}

/// Copie défensive en profondeur des structures mutables (objet racine, options
/// par réseau, tableaux). Garantit qu'aucun appelant ne peut muter l'état interne
/// d'une entité après coup, ni via l'entrée, ni via le getter.
export function cloneScheduledPlatformOptions(
  options: ScheduledPlatformOptions,
): ScheduledPlatformOptions {
  return {
    ...(options.youtube
      ? { youtube: cloneYouTubeScheduleOptions(options.youtube) }
      : {}),
  }
}

/// Vrai si l'objet ne porte aucune option exploitable — sert à normaliser un
/// `{}` en `null` plutôt que de persister un JSON vide.
export function isEmptyScheduledPlatformOptions(
  options: ScheduledPlatformOptions,
): boolean {
  return Object.values(options).every((value) => value === undefined)
}
