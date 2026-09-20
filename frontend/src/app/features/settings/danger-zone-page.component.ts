import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import { ToastService } from '@core/services/toast.service';
import { demoProfile } from '@/core/config/frontend-demo.config';
import { SETTINGS_PREVIEW_MESSAGES } from '@/core/config/frontend-preview-settings';
import { SettingsSectionComponent } from './settings-section.component';

/// Settings — Danger Zone.
///
/// APERÇU FRONTEND : aucun service de compte n'existe, donc aucune suppression
/// n'est possible.
///
/// ⚠️ Les deux actions sont DÉSACTIVÉES plutôt que « simulées ». Ailleurs, un
/// bouton d'aperçu affiche un message et c'est sans conséquence ; ici, laisser
/// croire qu'un code de confirmation part par email, ou qu'une suppression
/// définitive a été enclenchée, provoquerait une inquiétude réelle sur une
/// action irréversible. Le champ de code reste donc inerte.
@Component({
  selector: 'app-settings-danger-zone-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SettingsSectionComponent,
    FrontendPreviewNoticeComponent,
    PreviewBadgeComponent,
  ],
  template: `
    <app-settings-section
      title="Danger Zone"
      description="Irreversible actions on your account."
    >
      <app-frontend-preview-notice />

      <div class="mt-4 rounded-xl border border-border bg-surface p-5">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-base font-semibold text-error">Danger Zone</h2>
          <app-preview-badge />
        </div>
        <p class="mt-0.5 text-sm text-muted">
          Actions irréversibles affectant votre compte
        </p>

        <div class="mt-4 rounded-lg border border-[#fecdca] bg-error-soft p-4">
          <p class="text-sm font-semibold text-error">Delete Account</p>
          <p class="mt-1 text-sm text-foreground">
            Supprimer définitivement votre compte et toutes les données
            associées. Cette action ne peut pas être annulée.
          </p>

          <div class="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled
              class="h-10 cursor-not-allowed rounded-xl border border-[#fecdca] bg-surface px-4 text-sm font-medium text-error opacity-60"
            >
              Email me a confirmation code
            </button>
            <label for="delete-code" class="sr-only">
              Code de confirmation — saisie désactivée
            </label>
            <input
              id="delete-code"
              type="text"
              disabled
              readonly
              placeholder="Saisie désactivée"
              class="h-10 w-44 cursor-not-allowed rounded-xl border border-[#fecdca] bg-surface px-3 text-sm text-muted placeholder:text-subtle"
            />
            <button
              type="button"
              disabled
              class="h-10 cursor-not-allowed rounded-xl bg-error/40 px-4 text-sm font-medium text-white"
            >
              Confirm deletion
            </button>
          </div>

          <p class="mt-3 text-sm text-error">
            {{ message }} Aucun code ne sera envoyé à
            <span class="font-medium">{{ email }}</span> et aucune donnée ne peut
            être supprimée depuis cet écran.
          </p>
        </div>
      </div>
    </app-settings-section>
  `,
})
export class SettingsDangerZonePage {
  private readonly toast = inject(ToastService);

  protected readonly email = demoProfile.email;
  protected readonly message = SETTINGS_PREVIEW_MESSAGES.deleteAccount;

  /// Conservé pour un éventuel usage futur : aucune action de cet écran ne doit
  /// aboutir tant que le service de compte n'existe pas.
  protected notify(): void {
    this.toast.info(SETTINGS_PREVIEW_MESSAGES.deleteAccount);
  }
}
