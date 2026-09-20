import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import { BadgeComponent } from '@/shared/ui/badge.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { LucideAngularModule, Monitor } from '@/shared/ui/icons';
import { ToastService } from '@core/services/toast.service';
import { SETTINGS_PREVIEW_MESSAGES } from '@/core/config/frontend-preview-settings';
import { SettingsSectionComponent } from './settings-section.component';

/// Settings — Security.
///
/// APERÇU FRONTEND : aucun service d'authentification n'est connecté.
///
/// ⚠️ Décision assumée : AUCUNE session active n'est fabriquée. La maquette
/// montre des appareils avec adresses IP et horodatages ; inventer ces lignes
/// pousserait l'utilisateur à croire qu'un appareil inconnu accède à son
/// compte — et à réagir à une alerte qui n'existe pas.
@Component({
  selector: 'app-settings-security-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SettingsSectionComponent,
    FrontendPreviewNoticeComponent,
    PreviewBadgeComponent,
    BadgeComponent,
    ButtonComponent,
    LucideAngularModule,
  ],
  template: `
    <app-settings-section
      title="Security"
      description="Two-step verification and the devices signed in to your account."
    >
      <app-frontend-preview-notice />

      <div class="mt-4 space-y-4">
        <section class="rounded-xl border border-border bg-surface p-5">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-base font-semibold text-foreground">
              Two-step verification
            </h2>
            <app-badge tone="muted">Inactive</app-badge>
            <app-preview-badge />
          </div>
          <p class="mt-2 text-sm text-muted">
            Ask for a code from an authenticator app when you sign in with your
            password. You get recovery codes during setup, in case you lose the
            app.
          </p>
          <p class="mt-2 text-sm text-muted">
            L’activation dépend du service d’authentification, qui n’est pas
            encore connecté au backend Rezouette.
          </p>
          <div class="mt-3">
            <app-button variant="secondary" size="sm" className="rounded-md" (click)="notifyTwoStep()">
              Set a password
            </app-button>
          </div>
        </section>

        <section class="rounded-xl border border-border bg-surface p-5">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-base font-semibold text-foreground">Active sessions</h2>
            <app-preview-badge />
          </div>
          <p class="mt-2 text-sm text-muted">
            Devices currently signed in to your account. Sign out any you do not
            recognise.
          </p>

          <!-- Aucune session listée : voir la note de tête du composant. -->
          <div
            class="mt-4 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center"
          >
            <span class="flex size-11 items-center justify-center rounded-full bg-card text-subtle">
              <lucide-icon [img]="DeviceIcon" class="size-5" aria-hidden="true" />
            </span>
            <p class="text-sm font-medium text-foreground">
              Aucune session listée
            </p>
            <p class="max-w-md text-sm text-muted">
              Rezouette n’affiche aucun appareil tant que le service
              d’authentification n’est pas connecté. Aucune session d’exemple
              n’est inventée ici : une ligne fictive pourrait être prise pour une
              connexion inconnue.
            </p>
          </div>

          <div class="mt-4 flex justify-end">
            <app-button variant="secondary" size="sm" className="rounded-md" (click)="notifySignOut()">
              Sign out everywhere
            </app-button>
          </div>
        </section>
      </div>
    </app-settings-section>
  `,
})
export class SettingsSecurityPage {
  private readonly toast = inject(ToastService);
  protected readonly DeviceIcon = Monitor;

  protected notifyTwoStep(): void {
    this.toast.info(SETTINGS_PREVIEW_MESSAGES.twoStep);
  }

  protected notifySignOut(): void {
    this.toast.info(SETTINGS_PREVIEW_MESSAGES.signOut);
  }
}
