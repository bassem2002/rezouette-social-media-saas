import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { SelectDirective } from '@shared/directives/select.directive';
import { LucideAngularModule, ChevronDown } from '@/shared/ui/icons';
import { cn } from '@shared/utils/utils';

export interface FilterOption {
  value: string;
  label: string;
}

/// Select de filtrage compact : `<select>` NATIF (le plus accessible et le plus
/// fiable au clavier) habillé du chevron de la charte, avec son label associé.
///
/// Ce composant existe parce que le même bloc — wrapper relatif, label masqué,
/// chevron positionné — était répété sur chaque page de filtres.
@Component({
  selector: 'app-filter-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [SelectDirective, LucideAngularModule],
  template: `
    <div [class]="wrapperClasses()">
      <label [attr.for]="controlId()" class="sr-only">{{ label() }}</label>
      <select
        [id]="controlId()"
        appSelect
        className="h-9 rounded-md text-[13px]"
        [value]="value()"
        (change)="valueChange.emit($any($event.target).value)"
      >
        @for (option of options(); track option.value) {
          <option [value]="option.value">{{ option.label }}</option>
        }
      </select>
      <lucide-icon
        [img]="ChevronDownIcon"
        class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
        aria-hidden="true"
      />
    </div>
  `,
})
export class FilterSelectComponent {
  readonly controlId = input.required<string>();
  /// Libellé accessible — visuellement masqué, l'option sélectionnée servant
  /// d'étiquette visible (comme dans la maquette).
  readonly label = input.required<string>();
  readonly options = input.required<readonly FilterOption[]>();
  readonly value = input('all');
  readonly className = input('w-[152px]');
  readonly valueChange = output<string>();

  protected readonly ChevronDownIcon = ChevronDown;
  protected readonly wrapperClasses = computed(() =>
    cn('relative', this.className()),
  );
}
