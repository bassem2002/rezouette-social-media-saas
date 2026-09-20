import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import { SwitchComponent } from '@/shared/ui/switch.component';
import { ToastService } from '@core/services/toast.service';
import {
  SETTINGS_PREVIEW_MESSAGES,
  previewNotificationPrefs,
} from '@/core/config/frontend-preview-settings';
import { SettingsSectionComponent } from './settings-section.component';

interface NotificationPref {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

/// Settings — Notifications.
///
/// APERÇU FRONTEND : aucun service de préférences n'existe. Les interrupteurs
/// réagissent (l'écran doit rester utilisable) mais leur état vit uniquement en
/// mémoire, et le message le rappelle à chaque changement.
@Component({
  selector: 'app-settings-notifications-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SettingsSectionComponent,
    FrontendPreviewNoticeComponent,
    PreviewBadgeComponent,
    SwitchComponent,
  ],
  template: `
    <app-settings-section
      title="Notifications"
      description="Choose which emails and alerts you receive."
    >
      <app-frontend-preview-notice />

      <div class="mt-4 rounded-xl border border-border bg-surface p-5">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-base font-semibold text-foreground">Notifications</h2>
          <app-preview-badge />
        </div>
        <p class="mt-0.5 text-sm text-muted">
          Choose which emails you want to receive
        </p>

        <ul class="mt-4 space-y-2.5">
          @for (pref of prefs(); track pref.id) {
            <li
              class="flex items-center justify-between gap-4 rounded-lg bg-card px-4 py-3.5"
            >
              <div class="min-w-0">
                <label
                  [attr.for]="'notif-' + pref.id"
                  class="text-sm font-medium text-foreground"
                >
                  {{ pref.label }}
                </label>
                <p class="text-sm text-muted">{{ pref.description }}</p>
              </div>
              <app-switch
                [controlId]="'notif-' + pref.id"
                [ariaLabel]="pref.label"
                [checked]="pref.enabled"
                (checkedChange)="toggle(pref.id, $event)"
              />
            </li>
          }
        </ul>

        <p class="mt-4 text-xs text-muted">
          Ces préférences ne sont pas enregistrées : elles reviendront à leur
          valeur initiale au rechargement de la page.
        </p>
      </div>
    </app-settings-section>
  `,
})
export class SettingsNotificationsPage {
  private readonly toast = inject(ToastService);

  protected readonly prefs = signal<NotificationPref[]>(
    previewNotificationPrefs.map((pref) => ({ ...pref })),
  );

  protected toggle(id: string, enabled: boolean): void {
    this.prefs.update((prefs) =>
      prefs.map((pref) => (pref.id === id ? { ...pref, enabled } : pref)),
    );
    this.toast.info(SETTINGS_PREVIEW_MESSAGES.notifications);
  }
}
