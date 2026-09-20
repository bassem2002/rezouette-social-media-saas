import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { cn } from '@shared/utils/utils';
import { SpinnerComponent } from './spinner.component';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-subtle',
  secondary: 'bg-white text-foreground border border-border hover:bg-card',
  ghost: 'bg-transparent text-muted hover:bg-muted-soft hover:text-foreground',
  danger: 'bg-error text-white hover:brightness-95 shadow-subtle',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
  icon: 'h-10 w-10',
};

/// Bouton du design system. Hôte en `display:contents` : c'est le `<button>`
/// interne qui porte les styles et participe à la mise en page (w-full, flex…).
/// L'icône de gauche est projetée via l'attribut `buttonIcon`.
///
/// ⚠️ Les attributs ARIA doivent passer par les entrées ci-dessous. Posés sur
/// `<app-button>`, ils atterriraient sur l'élément hôte en `display:contents`,
/// que les technologies d'assistance ne rattachent pas au bouton : l'annonce
/// serait alors perdue.
@Component({
  selector: 'app-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SpinnerComponent],
  host: { class: 'contents' },
  templateUrl: './button.component.html',
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly className = input('');

  /// Attributs ARIA relayés au `<button>` interne (voir la note ci-dessus).
  readonly ariaLabel = input<string | null>(null);
  readonly ariaHasPopup = input<string | null>(null);
  readonly ariaControls = input<string | null>(null);
  readonly ariaExpanded = input<boolean | null>(null);

  protected readonly classes = computed(() =>
    cn(
      'inline-flex items-center justify-center rounded-xl font-medium transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      'disabled:pointer-events-none disabled:opacity-50',
      variantClasses[this.variant()],
      sizeClasses[this.size()],
      this.className(),
    ),
  );
}
