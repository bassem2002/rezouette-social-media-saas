import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { cn } from '@shared/utils/utils';
import { LucideAngularModule, Search } from '@/shared/ui/icons';

/// Champ de recherche contrôlé, label accessible via aria-label.
@Component({
  selector: 'app-search-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  host: { class: 'block' },
  template: `
    <div [class]="wrapperClasses()">
      <lucide-icon
        [img]="SearchIcon"
        class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
      <input
        type="search"
        [value]="value()"
        (input)="onInput($event)"
        [placeholder]="placeholder()"
        [attr.aria-label]="ariaLabel()"
        class="h-10 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm text-foreground placeholder:text-muted/70 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary"
      />
    </div>
  `,
})
export class SearchBarComponent {
  readonly value = input('');
  readonly placeholder = input('Rechercher…');
  readonly ariaLabel = input('Rechercher');
  readonly className = input('');
  readonly valueChange = output<string>();

  protected readonly SearchIcon = Search;
  protected readonly wrapperClasses = computed(() =>
    cn('relative', this.className()),
  );

  protected onInput(event: Event): void {
    this.valueChange.emit((event.target as HTMLInputElement).value);
  }
}
