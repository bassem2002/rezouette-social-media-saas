import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';

/// Une série empilée (ex. « Publiées », « Échecs »).
export interface StackedSeries {
  key: string;
  label: string;
  color: string;
}

/// Un point de l'axe horizontal : un libellé et une valeur par série.
export interface StackedPoint {
  label: string;
  values: Record<string, number>;
}

interface RenderedSegment {
  key: string;
  color: string;
  value: number;
  heightPct: number;
}

interface RenderedBar {
  label: string;
  total: number;
  segments: RenderedSegment[];
}

/// Histogramme empilé en CSS pur — aucune bibliothèque de graphiques ajoutée.
///
/// Robuste au jeu de données vide : un maximum plancher à 1 évite la division
/// par zéro, et l'absence de points affiche une grille vide plutôt qu'un SVG
/// dégénéré. Accessible via un résumé textuel (`role="img"` + `aria-label`).
@Component({
  selector: 'app-stacked-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  templateUrl: './stacked-bar-chart.component.html',
})
export class StackedBarChartComponent {
  readonly points = input.required<StackedPoint[]>();
  readonly series = input.required<StackedSeries[]>();
  readonly height = input('h-40');
  readonly className = input('');

  private readonly max = computed(() =>
    Math.max(
      1,
      ...this.points().map((p) =>
        this.series().reduce((sum, s) => sum + (p.values[s.key] ?? 0), 0),
      ),
    ),
  );

  protected readonly bars = computed<RenderedBar[]>(() => {
    const max = this.max();
    return this.points().map((point) => {
      const segments = this.series()
        .map((s) => {
          const value = point.values[s.key] ?? 0;
          return {
            key: s.key,
            color: s.color,
            value,
            heightPct: (value / max) * 100,
          };
        })
        .filter((segment) => segment.value > 0);
      return {
        label: point.label,
        total: segments.reduce((sum, s) => sum + s.value, 0),
        segments,
      };
    });
  });

  /// Un libellé sur deux au-delà de 14 points : au-delà, l'axe devient illisible.
  protected readonly labelStep = computed(() =>
    this.points().length > 45 ? 7 : this.points().length > 14 ? 3 : 1,
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
  protected readonly barsClasses = computed(() =>
    cn('flex items-end gap-1', this.height()),
  );

  protected showLabel(index: number): boolean {
    return index % this.labelStep() === 0;
  }
}
