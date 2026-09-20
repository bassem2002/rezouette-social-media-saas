import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';
import type { ChartPoint } from '@core/models';

/// Histogramme léger en CSS (responsive, sans dépendance). Accessible via un
/// résumé textuel (role="img" + aria-label).
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  templateUrl: './bar-chart.component.html',
})
export class BarChartComponent {
  readonly data = input.required<ChartPoint[]>();
  readonly color = input('#ff3b18');
  readonly height = input('h-44');
  readonly className = input('');

  protected readonly max = computed(() =>
    Math.max(1, ...this.data().map((d) => d.value)),
  );
  protected readonly summary = computed(() =>
    this.data().map((d) => `${d.label}: ${d.value}`).join(', '),
  );
  protected readonly containerClasses = computed(() =>
    cn('w-full', this.className()),
  );
  protected readonly barsClasses = computed(() =>
    cn('flex items-end gap-2', this.height()),
  );
}
