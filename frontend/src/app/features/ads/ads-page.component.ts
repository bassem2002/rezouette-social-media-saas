import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import { FilterSelectComponent } from '@shared/components/filter-select.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { LucideAngularModule, Megaphone, Plus, TrendingUp, Users, X } from '@/shared/ui/icons';
import { ToastService } from '@core/services/toast.service';
import {
  SETTINGS_PREVIEW_MESSAGES,
  previewAdCampaigns,
  previewAdFilters,
  previewAudiences,
  previewLeadForms,
} from '@/core/config/frontend-preview-settings';

type AdsTab = 'campaigns' | 'audiences' | 'lead-forms';

/// Ads — Campaigns, Audiences, Lead Forms.
///
/// APERÇU FRONTEND intégral : le backend n'expose aucun controller publicitaire.
/// Les listes restent vides — une campagne fictive avec un budget et des
/// résultats serait lue comme une dépense réelle.
@Component({
  selector: 'app-ads-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    FrontendPreviewNoticeComponent,
    PreviewBadgeComponent,
    FilterSelectComponent,
    ButtonComponent,
    LucideAngularModule,
  ],
  templateUrl: './ads-page.component.html',
})
export class AdsPage {
  private readonly toast = inject(ToastService);

  protected readonly PlusIcon = Plus;
  protected readonly BoostIcon = TrendingUp;
  protected readonly AdsIcon = Megaphone;
  protected readonly AudienceIcon = Users;
  protected readonly ClearIcon = X;

  protected readonly filters = previewAdFilters;
  protected readonly campaigns = signal(previewAdCampaigns);
  protected readonly audiences = signal(previewAudiences);
  protected readonly leadForms = signal(previewLeadForms);

  protected readonly tabs: { id: AdsTab; label: string }[] = [
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'audiences', label: 'Audiences' },
    { id: 'lead-forms', label: 'Lead Forms' },
  ];
  protected readonly tab = signal<AdsTab>('campaigns');

  protected readonly profile = signal('all');
  protected readonly ad = signal('all');
  protected readonly platform = signal('all');
  protected readonly account = signal('all');
  protected readonly status = signal('all');
  protected readonly range = signal('30d');
  protected readonly sort = signal('newest');

  protected readonly hasCampaigns = computed(() => this.campaigns().length > 0);
  protected readonly hasAudiences = computed(() => this.audiences().length > 0);
  protected readonly hasLeadForms = computed(() => this.leadForms().length > 0);

  protected setTab(tab: AdsTab): void {
    this.tab.set(tab);
  }

  protected clearFilters(): void {
    this.profile.set('all');
    this.ad.set('all');
    this.platform.set('all');
    this.account.set('all');
    this.status.set('all');
    this.range.set('30d');
    this.sort.set('newest');
  }

  protected notify(): void {
    this.toast.info(SETTINGS_PREVIEW_MESSAGES.ads);
  }
}
