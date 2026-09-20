import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';
import { CardComponent } from '@/shared/ui/card.component';
import { LucideAngularModule, Inbox, type LucideIconData } from '@/shared/ui/icons';

/// État vide — guide vers la prochaine action. Icône (défaut Inbox) + titre +
/// description + CTA projeté via `emptyAction`.
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardComponent, LucideAngularModule],
  templateUrl: './empty-state.component.html',
})
export class EmptyStateComponent {
  readonly icon = input<LucideIconData>(Inbox);
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly className = input('');

  protected readonly cardClasses = computed(() =>
    cn(
      'flex flex-col items-center justify-center gap-3 p-10 text-center',
      this.className(),
    ),
  );
}
