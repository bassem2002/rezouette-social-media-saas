import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';

export interface LineSeries {
  key: string;
  label: string;
  color: string;
}

export interface LinePoint {
  label: string;
  values: Record<string, number>;
}

interface RenderedLine {
  key: string;
  label: string;
  color: string;
  points: string;
}

/// Courbes multi-séries en SVG pur — aucune bibliothèque de graphiques ajoutée.
///
/// Le tracé utilise un `viewBox` normalisé (0→100) avec
/// `preserveAspectRatio="none"` : la courbe épouse la largeur disponible sans
/// recalcul au redimensionnement. Robuste aux cas dégénérés : série vide, point
/// unique, ou valeurs toutes identiques (le maximum plancher évite la division
/// par zéro et la ligne se place alors au milieu plutôt que de disparaître).
@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  templateUrl: './line-chart.component.html',
})
export class LineChartComponent {
  readonly points = input.required<LinePoint[]>();
  readonly series = input.required<LineSeries[]>();
  readonly height = input('h-44');
  readonly className = input('');

  protected readonly max = computed(() =>
    Math.max(
      1,
      ...this.points().flatMap((p) =>
        this.series().map((s) => p.values[s.key] ?? 0),
      ),
    ),
  );

  protected readonly lines = computed<RenderedLine[]>(() => {
    const points = this.points();
    const max = this.max();
    if (points.length === 0) return [];

    // Un point unique n'a pas d'intervalle : on le place au centre.
    const step = points.length > 1 ? 100 / (points.length - 1) : 0;

    return this.series().map((s) => ({
      key: s.key,
      label: s.label,
      color: s.color,
      points: points
        .map((p, index) => {
          const x = points.length > 1 ? index * step : 50;
          const y = 100 - ((p.values[s.key] ?? 0) / max) * 100;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' '),
    }));
  });

  /// Graduations de l'axe vertical (du maximum vers zéro).
  protected readonly ticks = computed(() => {
    const max = this.max();
    return [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
      ratio,
      value: Math.round(max * ratio * 100) / 100,
    }));
  });

  /// Un libellé sur N pour que l'axe reste lisible quel que soit le nombre de
  /// points.
  private readonly labelStep = computed(() =>
    Math.max(1, Math.ceil(this.points().length / 9)),
  );

  protected readonly summary = computed(() => {
    const series = this.series();
    return this.points()
      .map(
        (p) =>
          `${p.label} — ${series
            .map((s) => `${s.label}: ${p.values[s.key] ?? 0}`)
            .join(', ')}`,
      )
      .join(' ; ');
  });

  protected readonly containerClasses = computed(() =>
    cn('w-full', this.className()),
  );
  protected readonly plotClasses = computed(() =>
    cn('relative w-full', this.height()),
  );

  protected showLabel(index: number): boolean {
    return index % this.labelStep() === 0;
  }
}
