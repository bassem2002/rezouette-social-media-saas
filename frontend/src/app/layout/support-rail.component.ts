import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideAngularModule, LayoutGrid, LifeBuoy } from '@/shared/ui/icons';
import { ToastService } from '@core/services/toast.service';
import { COMING_SOON_MESSAGE } from '@/core/config/frontend-demo.config';

/// Rail d'actions flottant (bas-droite) : cercles blancs bordés, ombre douce,
/// espacement régulier — le repère visuel de la maquette.
///
/// PUREMENT FRONTEND : aucun service externe n'est contacté, aucune session de
/// support n'est ouverte. Les deux boutons annoncent honnêtement leur état.
@Component({
  selector: 'app-support-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <div
      class="pointer-events-none fixed bottom-6 right-5 z-30 hidden flex-col items-end gap-3 sm:flex"
    >
      <button
        type="button"
        (click)="notifyUnavailable()"
        aria-label="Raccourcis — bientôt disponible"
        class="pointer-events-auto flex size-11 items-center justify-center rounded-full border border-border bg-white text-muted shadow-subtle transition-colors duration-150 hover:bg-muted-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <lucide-icon [img]="GridIcon" class="size-[18px]" />
      </button>

      <button
        type="button"
        (click)="notifyUnavailable()"
        aria-label="Support — bientôt disponible"
        class="pointer-events-auto flex size-12 items-center justify-center rounded-full bg-primary text-white shadow-raised transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <lucide-icon [img]="SupportIcon" class="size-5" />
      </button>
    </div>
  `,
})
export class SupportRailComponent {
  private readonly toast = inject(ToastService);

  protected readonly GridIcon = LayoutGrid;
  protected readonly SupportIcon = LifeBuoy;

  protected notifyUnavailable(): void {
    this.toast.info(COMING_SOON_MESSAGE);
  }
}
