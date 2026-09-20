import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { cn } from '@shared/utils/utils';
import { LucideAngularModule, X } from './icons';
import { installOverlayBehavior } from './overlay';

/// Dialog simple, centré et accessible (aria-modal, fermeture Échap / backdrop).
/// Positionné en `fixed inset-0 z-50` : pas besoin de portail. Le pied de page
/// se projette via l'attribut `dialogFooter`.
@Component({
  selector: 'app-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './dialog.component.html',
})
export class DialogComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly description = input<string | null>(null);
  readonly className = input('');
  readonly close = output<void>();

  protected readonly XIcon = X;

  constructor() {
    installOverlayBehavior(this.open, () => this.close.emit());
  }

  protected readonly panelClasses = computed(() =>
    cn(
      'animate-fade-in relative w-full max-w-md rounded-xl border border-border bg-white shadow-subtle focus:outline-none',
      this.className(),
    ),
  );
}
