import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';
import { CardComponent } from '@/shared/ui/card.component';

export type MetricTone = 'primary' | 'success' | 'error' | 'warning' | 'muted';

const iconToneClasses: Record<MetricTone, string> = {
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-[#15803d]',
  error: 'bg-error-soft text-[#b91c1c]',
  warning: 'bg-warning-soft text-[#b45309]',
  muted: 'bg-muted-soft text-muted',
};

/// Carte KPI : valeur en évidence + libellé + icône (projetée via `metricIcon`).
@Component({
  selector: 'app-metric-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardComponent],
  templateUrl: './metric-card.component.html',
})
export class MetricCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly tone = input<MetricTone>('primary');
  readonly hint = input<string | null>(null);

  protected readonly iconWrapClasses = computed(() =>
    cn(
      'flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5',
      iconToneClasses[this.tone()],
    ),
  );
}
