import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import { LucideAngularModule, Lock } from '@/shared/ui/icons';
import { ToastService } from '@core/services/toast.service';
import { SETTINGS_PREVIEW_MESSAGES } from '@/core/config/frontend-preview-settings';
import { SettingsSectionComponent } from './settings-section.component';

/// Settings — Single sign-on.
///
/// APERÇU FRONTEND : aucun service d'authentification d'entreprise n'existe.
@Component({
  selector: 'app-settings-sso-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SettingsSectionComponent,
    FrontendPreviewNoticeComponent,
    PreviewBadgeComponent,
    LucideAngularModule,
  ],
  template: `
    <app-settings-section
      title="Single sign-on"
      description="Let your team sign in through your identity provider."
    >
      <app-frontend-preview-notice />

      <div class="mt-4 rounded-xl border border-border bg-surface p-5">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-base font-semibold text-foreground">Single sign-on</h2>
          <app-preview-badge />
        </div>
        <p class="mt-2 max-w-3xl text-sm text-muted">
          Permettez à votre équipe de se connecter avec le fournisseur d’identité
          de votre entreprise, afin que les accès suivent les comptes déjà gérés
          par votre service informatique.
        </p>

        <div class="mt-4 flex items-start gap-3 rounded-lg border border-border bg-card p-4">
          <span class="mt-0.5 text-muted">
            <lucide-icon [img]="LockIcon" class="size-4" aria-hidden="true" />
          </span>
          <div>
            <p class="text-sm font-medium text-foreground">
              Available on Enterprise
            </p>
            <p class="mt-1 text-sm text-muted">
              SAML et OIDC, avec SCIM et journaux d’audit, relèvent d’un accord
              Enterprise.
            </p>
            <button
              type="button"
              (click)="notify()"
              class="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Talk to us about Enterprise
            </button>
          </div>
        </div>
      </div>
    </app-settings-section>
  `,
})
export class SettingsSsoPage {
  private readonly toast = inject(ToastService);
  protected readonly LockIcon = Lock;

  protected notify(): void {
    this.toast.info(SETTINGS_PREVIEW_MESSAGES.sso);
  }
}
