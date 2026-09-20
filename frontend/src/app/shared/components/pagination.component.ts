import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonComponent } from '@/shared/ui/button.component';
import { LucideAngularModule, ChevronLeft, ChevronRight } from '@/shared/ui/icons';

/// Pagination simple et accessible (libellés explicites, état désactivé clair).
@Component({
  selector: 'app-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, LucideAngularModule],
  template: `
    @if (pageCount() > 1) {
      <nav aria-label="Pagination" class="flex items-center justify-between gap-3">
        <p class="text-sm text-muted">
          Page <span class="font-medium text-foreground">{{ page() }}</span> sur
          {{ pageCount() }}
        </p>
        <div class="flex items-center gap-2">
          <app-button
            variant="secondary"
            size="sm"
            [disabled]="page() <= 1"
            (click)="pageChange.emit(page() - 1)"
          >
            <lucide-icon buttonIcon [img]="ChevronLeftIcon" class="size-4" />
            Précédent
          </app-button>
          <app-button
            variant="secondary"
            size="sm"
            [disabled]="page() >= pageCount()"
            (click)="pageChange.emit(page() + 1)"
          >
            Suivant
            <lucide-icon [img]="ChevronRightIcon" class="size-4" />
          </app-button>
        </div>
      </nav>
    }
  `,
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly pageCount = input.required<number>();
  readonly pageChange = output<number>();

  protected readonly ChevronLeftIcon = ChevronLeft;
  protected readonly ChevronRightIcon = ChevronRight;
}
