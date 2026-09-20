import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';

/// Indicateur de chargement minimal et accessible.
@Component({
  selector: 'app-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: {
    role: 'status',
    'aria-label': 'Chargement en cours',
    '[class]': 'classes()',
  },
})
export class SpinnerComponent {
  readonly className = input('');
  protected readonly classes = computed(() =>
    cn(
      'inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent',
      this.className(),
    ),
  );
}
