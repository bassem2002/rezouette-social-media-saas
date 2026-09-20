import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';

/// Bloc squelette (placeholder de chargement) — préserve la mise en page.
/// La classe de dimension est passée via `className` (et non `class`) pour ne
/// pas entrer en conflit avec le binding d'hôte.
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: {
    'aria-hidden': 'true',
    '[class]': 'classes()',
  },
})
export class SkeletonComponent {
  readonly className = input('');
  protected readonly classes = computed(() =>
    cn('animate-pulse rounded-md bg-muted-soft', this.className()),
  );
}
