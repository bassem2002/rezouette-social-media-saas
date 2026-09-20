import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/// En-tête de page : titre (h1) + description + zone d'actions à droite,
/// projetée via l'attribut `pageActions`. Espacement homogène sur toutes les pages.
///
/// Un badge peut être accolé au titre via l'attribut `titleBadge` (utilisé par
/// les écrans d'aperçu pour signaler qu'ils ne sont pas branchés au backend).
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-xl font-semibold tracking-tight text-foreground">
            {{ title() }}
          </h1>
          <ng-content select="[titleBadge]" />
        </div>
        @if (description()) {
          <p class="mt-1 text-sm text-muted">{{ description() }}</p>
        }
      </div>
      <div class="flex shrink-0 items-center gap-2 empty:hidden">
        <ng-content select="[pageActions]" />
      </div>
    </div>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
}
