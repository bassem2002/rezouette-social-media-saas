import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { cn } from '@shared/utils/utils';
import { CardComponent } from '@/shared/ui/card.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { LucideAngularModule, AlertTriangle, RefreshCw } from '@/shared/ui/icons';

/// État d'erreur — message explicite + bouton "Réessayer".
@Component({
  selector: 'app-error-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardComponent, ButtonComponent, LucideAngularModule],
  templateUrl: './error-state.component.html',
})
export class ErrorStateComponent {
  readonly title = input('Une erreur est survenue');
  readonly description = input(
    'Impossible de charger les données. Vérifiez votre connexion puis réessayez.',
  );
  readonly className = input('');
  readonly retry = output<void>();

  protected readonly AlertIcon = AlertTriangle;
  protected readonly RefreshIcon = RefreshCw;
  protected readonly cardClasses = computed(() =>
    cn(
      'flex flex-col items-center justify-center gap-3 p-10 text-center',
      this.className(),
    ),
  );
}
