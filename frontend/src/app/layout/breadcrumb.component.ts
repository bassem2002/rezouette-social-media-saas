import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { LucideAngularModule, ChevronRight } from '@/shared/ui/icons';
import { brand } from '@/core/config/brand.config';
import { labelForPath } from './navigation.config';

/// Fil d'Ariane simple : Rezouette › Page courante.
///
/// N'est plus monté dans le shell (la charte proscrit la barre supérieure
/// globale) mais reste disponible pour une page qui aurait besoin d'un repère
/// hiérarchique local.
@Component({
  selector: 'app-breadcrumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  template: `
    <nav aria-label="Fil d'Ariane" class="flex items-center gap-1.5 text-sm">
      <span class="font-medium text-muted">{{ brand.name }}</span>
      <lucide-icon [img]="ChevronIcon" class="size-4 text-muted" aria-hidden="true" />
      <span class="font-medium text-foreground" aria-current="page">{{ current() }}</span>
    </nav>
  `,
})
export class BreadcrumbComponent {
  private readonly router = inject(Router);
  protected readonly ChevronIcon = ChevronRight;
  protected readonly brand = brand;

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly current = computed(() => labelForPath(this.url()));
}
