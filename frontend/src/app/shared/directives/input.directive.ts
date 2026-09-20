import { Directive, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';

/// Champ texte. `invalid` bascule la bordure en rouge (feedback d'erreur).
/// Directive posée sur un `<input>` natif → `formControlName` reste valide.
@Directive({
  selector: 'input[appInput]',
  host: {
    '[class]': 'classes()',
    '[attr.aria-invalid]': 'invalid() || null',
  },
})
export class InputDirective {
  readonly invalid = input(false);
  readonly className = input('');
  protected readonly classes = computed(() =>
    cn(
      'h-10 w-full rounded-xl border bg-white px-3 text-sm text-foreground',
      'placeholder:text-muted/70 transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
      'disabled:cursor-not-allowed disabled:opacity-50',
      this.invalid()
        ? 'border-error focus-visible:ring-error/30'
        : 'border-border focus-visible:border-primary',
      this.className(),
    ),
  );
}
