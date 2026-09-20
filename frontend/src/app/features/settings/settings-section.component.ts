import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, ChevronRight } from '@/shared/ui/icons';

/// En-tête commun aux pages de la section Settings : fil d'Ariane local
/// « Settings / <page> », titre et description, puis le contenu projeté.
///
/// Un composant plutôt qu'une répétition : dix pages partagent exactement cette
/// structure, et la faire diverger d'un écran à l'autre se remarquerait.
@Component({
  selector: 'app-settings-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [RouterLink, LucideAngularModule],
  template: `
    <div class="mx-auto w-full max-w-4xl">
      <nav aria-label="Fil d'Ariane" class="flex items-center gap-1 text-sm">
        <a
          routerLink="/settings/profile"
          class="text-muted transition-colors duration-150 hover:text-foreground"
        >
          Settings
        </a>
        <lucide-icon
          [img]="ChevronIcon"
          class="size-3.5 text-subtle"
          aria-hidden="true"
        />
        <span class="font-medium text-foreground" aria-current="page">
          {{ title() }}
        </span>
      </nav>

      <h1 class="mt-3 text-2xl font-semibold tracking-tight text-foreground">
        {{ title() }}
      </h1>
      @if (description()) {
        <p class="mt-1 text-sm text-muted">{{ description() }}</p>
      }

      <div class="mt-5">
        <ng-content />
      </div>
    </div>
  `,
})
export class SettingsSectionComponent {
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  protected readonly ChevronIcon = ChevronRight;
}
