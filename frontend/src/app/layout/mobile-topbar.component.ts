import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { LucideAngularModule, Menu } from '@/shared/ui/icons';
import { brand } from '@/core/config/brand.config';

/// Barre supérieure MINIMALE, visible uniquement sous `lg` : elle n'existe que
/// pour ouvrir le tiroir de navigation. Sur desktop, la sidebar suffit et
/// aucune barre ne surmonte le contenu — chaque page porte son propre en-tête.
@Component({
  selector: 'app-mobile-topbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <header
      class="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background px-4 lg:hidden"
    >
      <button
        type="button"
        (click)="menuClick.emit()"
        aria-label="Ouvrir le menu"
        aria-haspopup="dialog"
        class="flex size-9 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-muted-soft hover:text-foreground"
      >
        <lucide-icon [img]="MenuIcon" class="size-5" />
      </button>
      <span class="text-sm font-semibold tracking-tight text-foreground">
        {{ brand.name }}
      </span>
    </header>
  `,
})
export class MobileTopbarComponent {
  readonly menuClick = output<void>();
  protected readonly MenuIcon = Menu;
  protected readonly brand = brand;
}
