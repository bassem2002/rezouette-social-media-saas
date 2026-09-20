import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DialogComponent } from '@/shared/ui/dialog.component';
import { ButtonComponent, type ButtonVariant } from '@/shared/ui/button.component';

/// Confirmation avant action (notamment destructive). Le bouton de confirmation
/// passe en `danger` quand `destructive` est vrai.
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, ButtonComponent],
  template: `
    <app-dialog
      [open]="open()"
      [title]="title()"
      [description]="description()"
      (close)="close.emit()"
    >
      <div dialogFooter class="contents">
        <app-button variant="secondary" [disabled]="loading()" (click)="close.emit()">
          {{ cancelLabel() }}
        </app-button>
        <app-button [variant]="confirmVariant()" [loading]="loading()" (click)="confirm.emit()">
          {{ confirmLabel() }}
        </app-button>
      </div>
    </app-dialog>
  `,
})
export class ConfirmDialogComponent {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly confirmLabel = input('Confirmer');
  readonly cancelLabel = input('Annuler');
  readonly destructive = input(false);
  readonly loading = input(false);
  readonly close = output<void>();
  readonly confirm = output<void>();

  protected readonly confirmVariant = computed<ButtonVariant>(() =>
    this.destructive() ? 'danger' : 'primary',
  );
}
