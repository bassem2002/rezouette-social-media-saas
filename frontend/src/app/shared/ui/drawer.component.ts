import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { cn } from '@shared/utils/utils';
import { LucideAngularModule, X } from './icons';
import { installOverlayBehavior } from './overlay';

/// Panneau latéral droit, simple et accessible. Utilisé pour les détails
/// (publication, planification) comme pour les formulaires de configuration.
///
/// À l'ouverture, le focus est déplacé DANS le panneau : sans cela, la
/// navigation au clavier resterait derrière l'overlay, sur un contenu masqué.
@Component({
  selector: 'app-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './drawer.component.html',
})
export class DrawerComponent {
  readonly open = input(false);
  readonly title = input('');
  /// Sous-titre facultatif, affiché sous le titre du panneau.
  readonly description = input<string | null>(null);
  /// Identifiant du panneau — cible de l'`aria-controls` du bouton déclencheur.
  readonly panelId = input<string | null>(null);
  /// Largeur maximale. Valeur par défaut INCHANGÉE pour les usages existants ;
  /// les formulaires passent une largeur plus confortable.
  readonly maxWidthClass = input('max-w-sm');
  readonly className = input('');
  readonly close = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  protected readonly XIcon = X;

  constructor() {
    installOverlayBehavior(this.open, () => this.close.emit());

    effect(() => {
      if (!this.open()) return;
      // Le panneau n'existe qu'une fois `open` vrai (bloc @if) : le viewChild
      // est donc relu à chaque ouverture, après rendu.
      this.panel()?.nativeElement.focus();
    });
  }

  protected readonly panelClasses = computed(() =>
    cn(
      'animate-fade-in absolute inset-y-0 right-0 flex w-full flex-col border-l border-border bg-white shadow-raised focus:outline-none',
      this.maxWidthClass(),
      this.className(),
    ),
  );
}
