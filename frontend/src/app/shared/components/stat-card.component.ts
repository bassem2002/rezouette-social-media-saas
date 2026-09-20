import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';
import { CardComponent } from '@/shared/ui/card.component';

type StatEmphasis = 'foreground' | 'success' | 'error' | 'primary';

const valueColor: Record<StatEmphasis, string> = {
  foreground: 'text-foreground',
  success: 'text-[#15803d]',
  error: 'text-[#b91c1c]',
  primary: 'text-primary',
};

/// Statistique compacte (libellé + valeur), variante légère de MetricCard.
@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardComponent],
  templateUrl: './stat-card.component.html',
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly emphasis = input<StatEmphasis>('foreground');

  protected readonly valueClasses = computed(() =>
    cn('mt-1 text-xl font-semibold tracking-tight', valueColor[this.emphasis()]),
  );
}
