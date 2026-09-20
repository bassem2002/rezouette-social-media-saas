import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SpinnerComponent } from '@/shared/ui/spinner.component';

/// État de chargement centré (spinner + libellé). Template court → inline.
@Component({
  selector: 'app-loading-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SpinnerComponent],
  host: { class: 'block' },
  template: `
    <div
      class="flex flex-col items-center justify-center gap-3 py-16 text-muted"
      role="status"
      aria-live="polite"
    >
      <app-spinner className="size-6 text-primary" />
      <p class="text-sm">{{ label() }}</p>
    </div>
  `,
})
export class LoadingStateComponent {
  readonly label = input('Chargement…');
}
