import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/// Barre de progression d'upload (accessible : role=progressbar + valeurs ARIA).
@Component({
  selector: 'app-upload-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="space-y-1.5" role="status" aria-live="polite">
      <div class="flex items-center justify-between text-xs text-muted">
        <span>{{ label() }}</span>
        <span class="tabular-nums">{{ percent() }}%</span>
      </div>
      <div
        class="h-2 w-full overflow-hidden rounded-full bg-muted-soft"
        role="progressbar"
        [attr.aria-valuenow]="percent()"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="h-full rounded-full bg-primary transition-[width] duration-150"
          [style.width.%]="percent()"
        ></div>
      </div>
    </div>
  `,
})
export class UploadProgressComponent {
  readonly percent = input.required<number>();
  readonly label = input('Téléversement…');
}
