import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EmptyStateComponent } from '@shared/components/states';
import type { ChartPoint } from '@core/models';

interface DonutSegment {
  color: string;
  dash: number;
  gap: number;
  offset: number;
}
interface DonutLegend {
  label: string;
  value: number;
  color: string;
  pct: number;
}

/// Donut SVG sans dépendance. Segments + légende lisible ; centre = total.
@Component({
  selector: 'app-donut-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyStateComponent],
  host: { class: 'block' },
  templateUrl: './donut-chart.component.html',
})
export class DonutChartComponent {
  readonly data = input.required<ChartPoint[]>();
  readonly size = input(168);
  readonly thickness = input(22);
  readonly centerLabel = input('Total');

  protected readonly view = computed(() => {
    const data = this.data();
    const size = this.size();
    const thickness = this.thickness();
    const total = data.reduce((sum, d) => sum + d.value, 0);
    const radius = (size - thickness) / 2;
    const circumference = 2 * Math.PI * radius;

    let offsetAccumulator = 0;
    const segments: DonutSegment[] = data.map((d) => {
      const fraction = total === 0 ? 0 : d.value / total;
      const dash = fraction * circumference;
      const segment: DonutSegment = {
        color: d.color ?? '#ff3b18',
        dash,
        gap: circumference - dash,
        offset: -offsetAccumulator,
      };
      offsetAccumulator += dash;
      return segment;
    });

    const legend: DonutLegend[] = data.map((d) => ({
      label: d.label,
      value: d.value,
      color: d.color ?? '#ff3b18',
      pct: total === 0 ? 0 : Math.round((d.value / total) * 100),
    }));

    const summary = legend
      .map((l) => `${l.label}: ${l.value} (${l.pct}%)`)
      .join(', ');

    return { total, radius, circumference, segments, legend, summary, center: size / 2 };
  });
}
