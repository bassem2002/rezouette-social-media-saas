import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { LucideAngularModule, ShieldCheck } from '@/shared/ui/icons';
import { ToastService } from '@core/services/toast.service';
import {
  SETTINGS_PREVIEW_MESSAGES,
  previewBrands,
} from '@/core/config/frontend-preview-settings';

/// SMS — 10DLC.
///
/// APERÇU FRONTEND : aucun service SMS n'existe côté backend. L'enregistrement
/// 10DLC est une démarche réglementaire auprès des opérateurs américains ;
/// laisser croire qu'elle a été engagée serait particulièrement trompeur.
@Component({
  selector: 'app-sms-tendlc-page',
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
        title="10DLC"
        description="The registration US carriers require before a US number can send texts. Numbers elsewhere need none."
      >
        <app-preview-badge titleBadge />
        <div pageActions class="flex items-center gap-2">
          <app-button size="sm" className="rounded-md" (click)="notify()">
            Register
          </app-button>
        </div>
      </app-page-header>

      <app-frontend-preview-notice />

      @if (!hasBrands()) {
        <div
          class="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface px-6 py-20 text-center"
        >
          <span class="flex size-14 items-center justify-center rounded-full bg-card text-subtle">
            <lucide-icon [img]="ShieldIcon" class="size-6" aria-hidden="true" />
          </span>
          <p class="text-xl font-semibold text-foreground">
            No brand registered yet
          </p>
          <p class="mx-auto max-w-md text-sm text-muted">
            Register a brand so your US numbers can send texts.
          </p>
        </div>
      }
    </div>
  `,
})
export class SmsTenDlcPage {
  private readonly toast = inject(ToastService);

  protected readonly ShieldIcon = ShieldCheck;
  protected readonly brands = signal(previewBrands);
  protected readonly hasBrands = computed(() => this.brands().length > 0);

  protected notify(): void {
    this.toast.info(SETTINGS_PREVIEW_MESSAGES.sms);
  }
}
