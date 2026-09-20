import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { EmptyStateComponent } from '@shared/components/states';
import { BadgeComponent } from '@/shared/ui/badge.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { PhoneCall } from '@/shared/ui/icons';
import { ToastService } from '@core/services/toast.service';
import {
  PREVIEW_BADGE,
  PREVIEW_MESSAGES,
} from '@/core/config/frontend-preview.config';

/// Aperçu de la page « Calls ».
///
/// Aucun historique d'appel n'est inventé : le service de téléphonie n'existe
/// pas encore, l'écran s'ouvre donc sur un état vide honnête plutôt que sur
/// des lignes plausibles mais fausses.
@Component({
  selector: 'app-calls-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    FrontendPreviewNoticeComponent,
    EmptyStateComponent,
    BadgeComponent,
    ButtonComponent,
  ],
  template: `
    <div class="space-y-5">
      <app-page-header title="Calls" description="Manage and review phone calls">
        <app-badge titleBadge tone="warning">{{ previewBadge }}</app-badge>
      </app-page-header>

      <app-frontend-preview-notice />

      <app-empty-state
        [icon]="PhoneIcon"
        title="No calls yet"
        description="Call history will appear here when the telephony service is connected."
      >
        <app-button emptyAction variant="secondary" className="rounded-md" (click)="notify()">
          Configure calls
        </app-button>
      </app-empty-state>
    </div>
  `,
})
export class CallsPage {
  private readonly toast = inject(ToastService);

  protected readonly PhoneIcon = PhoneCall;
  protected readonly previewBadge = PREVIEW_BADGE;

  protected notify(): void {
    this.toast.info(PREVIEW_MESSAGES.calls);
  }
}
