import { Directive, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';

/// Select natif stylé (le plus accessible). Le chevron est ajouté par le parent
/// via un wrapper `relative` (voir usages Historique / Paramètres).
@Directive({
  selector: 'select[appSelect]',
  host: { '[class]': 'classes()' },
})
export class SelectDirective {
  readonly className = input('');
  protected readonly classes = computed(() =>
    cn(
      'h-10 w-full appearance-none rounded-xl border border-border bg-white pl-3 pr-9 text-sm text-foreground',
      'transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary',
      'disabled:cursor-not-allowed disabled:opacity-50',
      this.className(),
    ),
  );
}
