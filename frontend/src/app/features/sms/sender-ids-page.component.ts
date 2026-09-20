import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { LucideAngularModule, Plus, Type } from '@/shared/ui/icons';
import { ToastService } from '@core/services/toast.service';
import { brand } from '@/core/config/brand.config';
import {
  SETTINGS_PREVIEW_MESSAGES,
  previewSenderIds,
} from '@/core/config/frontend-preview-settings';

/// SMS — Sender IDs.
///
/// APERÇU FRONTEND : aucun service SMS n'existe côté backend.
@Component({
  selector: 'app-sms-sender-ids-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    FrontendPreviewNoticeComponent,
    PreviewBadgeComponent,
    ButtonComponent,
    LucideAngularModule,
  ],
  template: `
    <div class="space-y-5">
      <app-page-header
        title="Sender IDs"
        description="Branded names shown as the sender of your international SMS, no phone number needed. Text only, no replies, can’t reach the US or Canada."
      >
        <app-preview-badge titleBadge />
        <div pageActions class="flex items-center gap-2">
          <app-button size="sm" className="rounded-md" (click)="notify()">
            <lucide-icon buttonIcon [img]="PlusIcon" class="size-4" />
            New sender ID
          </app-button>
        </div>
      </app-page-header>

      <app-frontend-preview-notice />

      @if (!hasSenderIds()) {
        <div
          class="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface px-6 py-20 text-center"
        >
          <span class="flex size-14 items-center justify-center rounded-full bg-card text-subtle">
            <lucide-icon [img]="TypeIcon" class="size-6" aria-hidden="true" />
          </span>
          <p class="text-xl font-semibold text-foreground">No sender IDs yet</p>
          <p class="mx-auto max-w-md text-sm text-muted">
            Send SMS as your brand name (e.g. {{ brandName }}) instead of a phone
            number.
          </p>
          <app-button className="rounded-md" (click)="notify()">
            <lucide-icon buttonIcon [img]="PlusIcon" class="size-4" />
            New sender ID
          </app-button>
        </div>
      }
    </div>
  `,
})
export class SmsSenderIdsPage {
  private readonly toast = inject(ToastService);

  protected readonly PlusIcon = Plus;
  protected readonly TypeIcon = Type;
  protected readonly brandName = brand.name.toUpperCase();
  protected readonly senderIds = signal(previewSenderIds);
  protected readonly hasSenderIds = computed(() => this.senderIds().length > 0);

  protected notify(): void {
    this.toast.info(SETTINGS_PREVIEW_MESSAGES.sms);
  }
}
