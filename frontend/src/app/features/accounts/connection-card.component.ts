import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BadgeComponent } from '@/shared/ui/badge.component';
import { PlatformIconComponent } from '@shared/components/platform-icon.component';
import { LucideAngularModule, Info, RefreshCw } from '@/shared/ui/icons';
import { cn } from '@shared/utils/utils';
import { formatDate } from '@shared/utils/format';
import { DEMO_DEFAULT_BADGE } from '@/core/config/frontend-demo.config';
import { accountStateConfig } from './account-state';
import {
  PLATFORM_ICON_CLASSES,
  PLATFORM_LABELS,
  type ConnectionView,
} from './connection-view';

/// Carte de connexion compacte, GÉNÉRIQUE : les cinq plateformes passent par ce
/// même composant, y compris les chaînes YouTube multiples.
///
/// Elle ne rend que des actions RÉELLES. Aucun bouton « Disconnect » ni
/// « Manage Pages » n'est affiché tant que le backend n'expose pas les
/// endpoints correspondants : un bouton qui prétendrait avoir déconnecté un
/// compte serait un mensonge visuel.
@Component({
  selector: 'app-connection-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [BadgeComponent, PlatformIconComponent, LucideAngularModule],
  template: `
    <article
      class="flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-subtle"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2.5">
          <span [class]="iconClasses()">
            <app-platform-icon [platform]="view().platform" className="size-4" />
          </span>
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-foreground">
              {{ label() }}
            </p>
            <app-badge [tone]="config().tone" className="mt-1">
              {{ config().label }}
            </app-badge>
          </div>
        </div>

        <!-- Info : l'état exact du compte en texte, pour ceux qui ne peuvent
             pas se fier à la seule couleur du badge. -->
        <span
          class="shrink-0 text-subtle"
          [title]="detail()"
          [attr.aria-label]="detail()"
          role="img"
        >
          <lucide-icon [img]="InfoIcon" class="size-4" />
        </span>
      </div>

      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-foreground">
          {{ view().name || 'Aucun compte connecté' }}
        </p>
        <p class="truncate text-xs text-muted">
          @if (view().handle) {
            <span>{{ view().handle }}</span>
          }
          @if (view().handle && view().connectedAt) {
            <span> · </span>
          }
          @if (view().connectedAt) {
            <span>{{ formatDate(view().connectedAt) }}</span>
          }
          @if (!view().handle && !view().connectedAt) {
            <span>{{ tokenLine() }}</span>
          }
        </p>
      </div>

      @if (view().connected) {
        <!-- Marqueur décoratif (aucun compte « par défaut » n'existe en base). -->
        <span
          class="inline-flex w-fit items-center gap-1.5 rounded-md bg-card px-2 py-1 text-[11px] font-medium text-muted"
        >
          <span class="size-1.5 rounded-full bg-warning" aria-hidden="true"></span>
          {{ defaultBadge }}
        </span>
      }

      @if (view().warning) {
        <p class="rounded-md bg-warning-soft px-2.5 py-1.5 text-xs text-warning" role="status">
          {{ view().warning }}
        </p>
      }

      @if (view().disabled && view().disabledHint) {
        <p class="rounded-md bg-card px-2.5 py-1.5 text-xs text-muted">
          {{ view().disabledHint }}
        </p>
      }

      <div class="mt-auto pt-1">
        <button
          type="button"
          [disabled]="view().disabled || busy()"
          (click)="action.emit()"
          [attr.aria-label]="actionAriaLabel()"
          [class]="actionClasses()"
        >
          <lucide-icon [img]="RefreshIcon" class="size-3.5" aria-hidden="true" />
          {{ actionLabel() }}
        </button>
      </div>
    </article>
  `,
})
export class ConnectionCardComponent {
  readonly view = input.required<ConnectionView>();
  /// Action en cours : empêche le double-clic et l'ouverture de deux flux OAuth.
  readonly busy = input(false);
  readonly action = output<void>();

  protected readonly InfoIcon = Info;
  protected readonly RefreshIcon = RefreshCw;
  protected readonly formatDate = formatDate;
  protected readonly defaultBadge = DEMO_DEFAULT_BADGE;

  protected readonly label = computed(() => PLATFORM_LABELS[this.view().platform]);
  protected readonly config = computed(() => accountStateConfig[this.view().state]);

  protected readonly actionLabel = computed(() =>
    this.view().connected ? 'Reconnect' : 'Connect',
  );

  protected readonly actionAriaLabel = computed(() => {
    const view = this.view();
    const name = view.name ? ` (${view.name})` : '';
    return `${this.actionLabel()} — ${this.label()}${name}`;
  });

  /// Ligne d'expiration affichée quand aucune information secondaire n'existe.
  protected readonly tokenLine = computed(() => {
    const view = this.view();
    if (view.disabled) return 'Intégration indisponible';
    if (!view.connected) return 'Connectez ce réseau pour publier';
    return view.expiresAt
      ? `Token : ${formatDate(view.expiresAt)}`
      : 'Token : n’expire pas';
  });

  /// Description textuelle complète de l'état — jamais uniquement une couleur.
  protected readonly detail = computed(() => {
    const view = this.view();
    const parts = [`${this.label()} — ${this.config().label}`];
    if (view.connected) {
      parts.push(
        view.expiresAt
          ? `expiration du token : ${formatDate(view.expiresAt)}`
          : 'le token n’expire pas',
      );
    }
    return parts.join(', ');
  });

  protected readonly iconClasses = computed(() =>
    cn(
      'flex size-9 shrink-0 items-center justify-center rounded-md',
      PLATFORM_ICON_CLASSES[this.view().platform],
    ),
  );

  /// L'action passe en orange uniquement quand elle est RÉCLAMÉE (compte à
  /// reconnecter ou absent) ; sinon elle reste secondaire et discrète.
  protected readonly actionClasses = computed(() =>
    cn(
      'inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      'disabled:pointer-events-none disabled:opacity-50',
      this.config().needsAction
        ? 'bg-primary text-white hover:bg-primary-hover'
        : 'border border-border bg-surface text-foreground hover:bg-card',
    ),
  );
}
