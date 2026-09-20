import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import { LucideAngularModule, Lock } from '@/shared/ui/icons';
import { AccountsService } from '@core/data-access/accounts.service';
import { queryKeys } from '@core/data-access/query-keys';
import { appConfig } from '@/core/config/app-config';
import { brand } from '@/core/config/brand.config';
import { SLACK_UNLOCK_THRESHOLD } from '@/core/config/frontend-preview-settings';
import { SettingsSectionComponent } from './settings-section.component';

/// Settings — Slack.
///
/// ÉCRAN MIXTE : le seuil de déblocage et Slack Connect lui-même sont un
/// aperçu, mais le NOMBRE de comptes connectés est bien réel
/// (`GET /social/accounts`). Afficher un compteur inventé alors que la donnée
/// existe aurait été gratuitement faux.
@Component({
  selector: 'app-settings-slack-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SettingsSectionComponent,
    FrontendPreviewNoticeComponent,
    PreviewBadgeComponent,
    LucideAngularModule,
  ],
  template: `
    <app-settings-section
      title="Slack"
      description="Get updates where your team already works."
    >
      <app-frontend-preview-notice
        variant="partial"
        detail="Le nombre de comptes connectés est réel ; Slack Connect n’est pas encore disponible."
      />

      <div class="mt-4 rounded-xl border border-border bg-surface p-5">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-base font-semibold text-foreground">Slack Connect</h2>
          <app-preview-badge />
        </div>
        <p class="mt-0.5 text-sm text-muted">
          Un canal Slack dédié avec l’équipe {{ brandName }} pour un support
          prioritaire.
        </p>

        <div
          class="mt-4 flex flex-col items-center justify-center gap-2 rounded-lg border border-border px-4 py-12 text-center"
        >
          <span class="flex size-12 items-center justify-center rounded-full bg-card text-subtle">
            <lucide-icon [img]="LockIcon" class="size-5" aria-hidden="true" />
          </span>
          <p class="text-base font-semibold text-foreground">
            Se débloque à {{ threshold }}+ comptes connectés
          </p>
          <p class="text-sm text-muted">{{ progressLabel() }}</p>
        </div>
      </div>
    </app-settings-section>
  `,
})
export class SettingsSlackPage {
  private readonly accountsService = inject(AccountsService);

  protected readonly LockIcon = Lock;
  protected readonly brandName = brand.name;
  protected readonly threshold = SLACK_UNLOCK_THRESHOLD;

  /// Comptes réellement connectés — même source que la page Connections.
  private readonly query = injectQuery(() => ({
    queryKey: queryKeys.accounts(appConfig.demoUserId),
    queryFn: () =>
      lastValueFrom(this.accountsService.list(appConfig.demoUserId)),
  }));

  protected readonly progressLabel = computed(() => {
    if (this.query.isPending()) return 'Chargement de vos comptes connectés…';
    if (this.query.isError()) {
      return 'Le nombre de comptes connectés n’a pas pu être récupéré.';
    }
    const count = this.query.data()?.length ?? 0;
    const remaining = Math.max(0, SLACK_UNLOCK_THRESHOLD - count);
    const accounts = count === 1 ? '1 compte connecté' : `${count} comptes connectés`;
    return remaining === 0
      ? `Vous avez ${accounts}.`
      : `Vous avez ${accounts}, encore ${remaining} avant le déblocage.`;
  });
}
