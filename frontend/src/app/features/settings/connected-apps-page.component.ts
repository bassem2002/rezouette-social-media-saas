import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import { LucideAngularModule, Unplug } from '@/shared/ui/icons';
import { brand } from '@/core/config/brand.config';
import { SettingsSectionComponent } from './settings-section.component';

/// Settings — Connected apps.
///
/// APERÇU FRONTEND : aucun service OAuth d'assistants tiers n'existe.
///
/// ⚠️ À ne pas confondre avec la page **Connections**, qui gère les comptes
/// sociaux et fonctionne, elle, sur de vraies données. Le renvoi explicite en
/// bas de page évite qu'un utilisateur cherche ici ses comptes Facebook ou
/// Instagram et conclue qu'ils ont été déconnectés.
@Component({
  selector: 'app-settings-connected-apps-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    SettingsSectionComponent,
    FrontendPreviewNoticeComponent,
    PreviewBadgeComponent,
    LucideAngularModule,
  ],
  template: `
    <app-settings-section
      title="Connected apps"
      description="Apps and integrations authorised on your account."
    >
      <app-frontend-preview-notice />

      <div class="mt-4 rounded-xl border border-border bg-surface p-5">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-base font-semibold text-foreground">Connected apps</h2>
          <app-preview-badge />
        </div>
        <p class="mt-2 max-w-3xl text-sm text-muted">
          Assistants et connecteurs autorisés à utiliser votre compte
          {{ brandName }}. La révocation prendra effet immédiatement lorsque le
          service OAuth sera connecté.
        </p>

        <div
          class="mt-6 flex flex-col items-center justify-center gap-2 py-14 text-center"
        >
          <span class="flex size-14 items-center justify-center rounded-full bg-card text-subtle">
            <lucide-icon [img]="PlugIcon" class="size-6" aria-hidden="true" />
          </span>
          <p class="text-base font-semibold text-foreground">
            No AI assistants connected
          </p>
          <p class="mx-auto max-w-md text-sm text-muted">
            Lorsqu’un assistant sera connecté à {{ brandName }} via OAuth, il
            apparaîtra ici avec les accès qui lui ont été accordés.
          </p>
        </div>

        <p class="border-t border-border-soft pt-4 text-sm text-muted">
          Vous cherchez vos comptes Facebook, Instagram, TikTok, LinkedIn ou
          YouTube ? Ils se gèrent sur la page
          <a
            routerLink="/connections"
            class="font-medium text-primary underline-offset-4 hover:underline"
          >
            Connections</a
          >, qui est bien connectée au backend.
        </p>
      </div>
    </app-settings-section>
  `,
})
export class SettingsConnectedAppsPage {
  protected readonly PlugIcon = Unplug;
  protected readonly brandName = brand.name;
}
