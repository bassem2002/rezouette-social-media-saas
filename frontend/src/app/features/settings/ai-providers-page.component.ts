import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import { LucideAngularModule, AlertTriangle } from '@/shared/ui/icons';
import { brand } from '@/core/config/brand.config';
import { previewAiProviders } from '@/core/config/frontend-preview-settings';
import { SettingsSectionComponent } from './settings-section.component';

/// Settings — AI providers.
///
/// APERÇU FRONTEND, avec une précaution qui prime sur la fidélité à la maquette.
///
/// ⚠️ Les champs de clé sont VOLONTAIREMENT DÉSACTIVÉS. La maquette propose de
/// coller une clé d'API réelle en promettant un chiffrement au repos ; or aucun
/// backend ne reçoit ni ne chiffre quoi que ce soit. Un champ saisissable
/// inviterait à coller un secret utilisable — facturable, révocable, parfois
/// partagé — dans une page qui ne peut ni le protéger ni l'effacer. Tant que le
/// service n'existe pas, la seule conduite tenable est de rendre la saisie
/// impossible et de le dire.
@Component({
  selector: 'app-settings-ai-providers-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SettingsSectionComponent,
    FrontendPreviewNoticeComponent,
    PreviewBadgeComponent,
    LucideAngularModule,
  ],
  template: `
    <app-settings-section
      title="AI providers"
      description="Use your own AI provider keys instead of ours."
    >
      <app-frontend-preview-notice />

      <!-- Avertissement de sécurité, distinct de la notice d'aperçu : il ne
           s'agit pas seulement d'annoncer une maquette, mais d'empêcher un
           geste risqué. -->
      <div
        class="mt-3 flex items-start gap-2.5 rounded-lg border border-[#fecdca] bg-error-soft px-3 py-2.5"
        role="alert"
      >
        <lucide-icon
          [img]="WarningIcon"
          class="mt-px size-4 shrink-0 text-error"
          aria-hidden="true"
        />
        <p class="text-[13px] leading-snug text-foreground">
          <strong class="font-semibold">Ne collez aucune clé d’API réelle.</strong>
          Les champs sont désactivés : {{ brandName }} n’a aujourd’hui aucun
          moyen de recevoir, chiffrer ou supprimer une clé. Ils seront activés
          quand le service le permettra.
        </p>
      </div>

      <div class="mt-4 rounded-xl border border-border bg-surface p-5">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-base font-semibold text-foreground">AI providers</h2>
          <app-preview-badge />
        </div>
        <p class="mt-2 max-w-3xl text-sm text-muted">
          Les clés serviront aux étapes d’IA des workflows. Elles seront
          facturées directement par le fournisseur, jamais par {{ brandName }}.
        </p>

        <div class="mt-4 grid gap-3 lg:grid-cols-2">
          @for (provider of providers; track provider.id) {
            <div class="rounded-lg bg-card p-4">
              <div class="flex items-center gap-2.5">
                <span
                  class="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface text-xs font-semibold text-muted"
                  aria-hidden="true"
                >
                  {{ provider.name.slice(0, 2) }}
                </span>
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-foreground">
                    {{ provider.name }}
                  </p>
                  <p class="truncate text-xs text-muted">{{ provider.models }}</p>
                </div>
              </div>

              <div class="mt-3 flex items-center gap-2">
                <label [attr.for]="'ai-' + provider.id" class="sr-only">
                  Clé d’API {{ provider.name }} — saisie désactivée
                </label>
                <input
                  [id]="'ai-' + provider.id"
                  type="text"
                  disabled
                  readonly
                  autocomplete="off"
                  placeholder="Saisie désactivée"
                  class="h-10 min-w-0 flex-1 cursor-not-allowed rounded-xl border border-border bg-surface px-3 text-sm text-muted placeholder:text-subtle"
                />
                <button
                  type="button"
                  disabled
                  class="h-10 shrink-0 cursor-not-allowed rounded-xl bg-primary/40 px-4 text-sm font-medium text-white"
                >
                  Save
                </button>
              </div>
              <p class="mt-1.5 text-xs text-subtle">{{ provider.hint }}</p>
            </div>
          }
        </div>
      </div>
    </app-settings-section>
  `,
})
export class SettingsAiProvidersPage {
  protected readonly WarningIcon = AlertTriangle;
  protected readonly brandName = brand.name;
  protected readonly providers = previewAiProviders;
}
