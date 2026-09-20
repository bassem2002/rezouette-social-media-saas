import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';

/// Label toujours visible (jamais de placeholder seul). `*` si requis.
@Component({
  selector: 'app-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  templateUrl: './label.component.html',
})
export class LabelComponent {
  readonly htmlFor = input<string | null>(null);
  readonly required = input(false);
  readonly className = input('');
  protected readonly classes = computed(() =>
    cn('mb-1.5 block text-sm font-medium text-foreground', this.className()),
  );
}
