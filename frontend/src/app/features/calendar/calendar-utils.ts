import type { ScheduledPost } from '@core/models';

/// Libellés des jours (semaine commençant le lundi, convention FR).
export const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const monthFormatter = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});

/// Une cellule de la grille mensuelle.
export interface CalendarCell {
  date: Date;
  /// Clé locale YYYY-MM-DD (regroupement des publications).
  key: string;
  inMonth: boolean;
  isToday: boolean;
  posts: ScheduledPost[];
}

/// Clé locale d'un jour (YYYY-MM-DD) à partir d'une Date — alignée sur le fuseau
/// du navigateur pour que les publications tombent dans la bonne case.
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/// Libellé "juillet 2026" du mois affiché.
export function monthLabel(year: number, month: number): string {
  return monthFormatter.format(new Date(year, month, 1));
}

/// Heure courte (HH:mm) d'une publication.
export function postTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/// Index lundi-premier (0 = lundi … 6 = dimanche) à partir de getDay() (0 = dim).
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/// Construit la grille du mois (semaines complètes lundi→dimanche) en répartissant
/// les publications dans la bonne cellule selon `scheduledAt`.
export function buildMonthGrid(
  year: number,
  month: number,
  posts: ScheduledPost[],
): CalendarCell[] {
  const byDay = new Map<string, ScheduledPost[]>();
  for (const post of posts) {
    const key = dayKey(new Date(post.scheduledAt));
    const bucket = byDay.get(key);
    if (bucket) bucket.push(post);
    else byDay.set(key, [post]);
  }
  for (const bucket of byDay.values()) {
    bucket.sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
  }

  const firstOfMonth = new Date(year, month, 1);
  const start = new Date(firstOfMonth);
  start.setDate(1 - mondayIndex(firstOfMonth));

  const todayKey = dayKey(new Date());
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = dayKey(date);
    cells.push({
      date,
      key,
      inMonth: date.getMonth() === month,
      isToday: key === todayKey,
      posts: byDay.get(key) ?? [],
    });
  }
  return cells;
}
