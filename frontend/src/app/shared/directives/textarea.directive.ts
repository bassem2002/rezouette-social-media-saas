import { Directive, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';

/// Zone de texte multi-lignes (même contrat que `appInput`).
@Directive({
  selector: 'textarea[appTextarea]',
  host: {
    '[class]': 'classes()',
    '[attr.aria-invalid]': 'invalid() || null',
  },
})
export class TextareaDirective {
  readonly invalid = input(false);
  readonly className = input('');
  protected readonly classes = computed(() =>
    cn(
      'min-h-28 w-full resize-y rounded-xl border bg-white px-3 py-2.5 text-sm text-foreground',
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
