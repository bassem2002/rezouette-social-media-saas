import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EmptyStateComponent } from '@shared/components/states';
import type { ChartPoint } from '@core/models';

/// Barres horizontales légères en CSS (libellés longs lisibles, ex. raisons
/// d'erreur Meta). Même contrat ChartPoint que les autres graphiques.
@Component({
  selector: 'app-hbar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyStateComponent],
  host: { class: 'block' },
  templateUrl: './hbar-chart.component.html',
})
export class HBarChartComponent {
  readonly data = input.required<ChartPoint[]>();
  readonly color = input('#ef4444');
  readonly emptyLabel = input('Aucune donnée');

  protected readonly total = computed(() =>
    this.data().reduce((sum, d) => sum + d.value, 0),
  );
  protected readonly max = computed(() =>
    Math.max(1, ...this.data().map((d) => d.value)),
  );
  protected readonly summary = computed(() =>
    this.data().map((d) => `${d.label}: ${d.value}`).join(', '),
  );
}
