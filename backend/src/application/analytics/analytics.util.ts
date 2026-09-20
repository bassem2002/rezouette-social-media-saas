/// Utilitaires partagés des analytics (clé de jour, pourcentage). Centralisés
/// pour que la couche infra (bucketing) et la couche application (série continue)
/// emploient EXACTEMENT la même convention — aucune divergence de format.

/// Clé locale d'un jour (YYYY-MM-DD) à partir d'une Date.
export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/// Pourcentage arrondi à 0,1 près (0 si total nul).
export function percentage(part: number, total: number): number {
  if (total === 0) return 0
  return Math.round((part / total) * 1000) / 10
}

/// Minuit local il y a `daysAgo` jours (borne basse de la fenêtre quotidienne).
export function startOfDayDaysAgo(daysAgo: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return d
}

/// Fenêtres autorisées du tableau de bord. Liste FERMÉE : elle borne la taille
/// de la requête (aucun nombre libre côté client ne peut déclencher un scan
/// illimité) et sert à la fois à la validation, au typage et au DTO.
export const DASHBOARD_RANGES = ['7d', '30d', '90d'] as const
export type DashboardRange = (typeof DASHBOARD_RANGES)[number]

/// Fenêtre par défaut quand le client n'en fournit aucune.
export const DEFAULT_DASHBOARD_RANGE: DashboardRange = '7d'

const RANGE_DAYS: Record<DashboardRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

/// Nombre de jours (buckets) d'une fenêtre.
export function dashboardRangeDays(range: DashboardRange): number {
  return RANGE_DAYS[range]
}

/// Borne basse (minuit local) d'une fenêtre : `days - 1` jours en arrière, de
/// sorte que « 7d » couvre aujourd'hui + les 6 jours précédents = 7 buckets.
export function startOfRange(range: DashboardRange): Date {
  return startOfDayDaysAgo(dashboardRangeDays(range) - 1)
}

/// Taux de réussite : `published / (published + failed)`, arrondi à 0,1 près.
/// Les publications PENDING sont volontairement EXCLUES du dénominateur : une
/// vidéo encore en traitement n'est ni un succès ni un échec, et l'inclure
/// ferait chuter le taux sans qu'aucune publication n'ait échoué.
/// Dénominateur nul → 0 (jamais NaN).
export function successRate(published: number, failed: number): number {
  const decided = published + failed
  if (decided === 0) return 0
  return Math.round((published / decided) * 1000) / 10
}

/// Longueur maximale d'un extrait de contenu affiché dans le tableau de bord.
const EXCERPT_MAX_LENGTH = 120

/// Extrait sûr d'un contenu rédigé par l'utilisateur : espaces normalisés et
/// longueur bornée (le tableau de bord n'a pas vocation à rendre un post entier).
export function toExcerpt(text: string | null | undefined): string | null {
  if (!text) return null
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length === 0) return null
  return normalized.length <= EXCERPT_MAX_LENGTH
    ? normalized
    : `${normalized.slice(0, EXCERPT_MAX_LENGTH - 1)}…`
}
