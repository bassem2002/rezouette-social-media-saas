import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { cn } from '@shared/utils/utils';

/// Interrupteur accessible (role="switch", pilotable au clavier via le bouton).
@Component({
  selector: 'app-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  templateUrl: './switch.component.html',
})
export class SwitchComponent {
  readonly checked = input(false);
  readonly disabled = input(false);
  readonly controlId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly checkedChange = output<boolean>();

  protected toggle(): void {
    if (!this.disabled()) this.checkedChange.emit(!this.checked());
  }

  protected readonly trackClasses = computed(() =>
    cn(
      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      this.checked() ? 'bg-primary' : 'bg-border',
    ),
  );

  protected readonly thumbClasses = computed(() =>
    cn(
      'inline-block size-5 transform rounded-full bg-white shadow-subtle transition-transform duration-150',
      this.checked() ? 'translate-x-5' : 'translate-x-0.5',
    ),
  );
}
