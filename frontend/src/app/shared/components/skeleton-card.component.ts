import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CardComponent } from '@/shared/ui/card.component';
import { SkeletonComponent } from '@/shared/ui/skeleton.component';

/// Squelette en forme de carte (chargement des grilles de KPI/contenus).
@Component({
  selector: 'app-skeleton-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardComponent, SkeletonComponent],
  host: { class: 'block' },
  template: `
    <app-card className="p-5">
      <div class="flex items-start justify-between gap-3">
        <div class="w-full space-y-3">
          <app-skeleton className="h-4 w-24" />
          <app-skeleton className="h-7 w-16" />
        </div>
        <app-skeleton className="size-10 rounded-xl" />
      </div>
    </app-card>
  `,
})
export class SkeletonCardComponent {}
