import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { FilterSelectComponent } from '@shared/components/filter-select.component';
import { SearchBarComponent } from '@shared/components/search-bar.component';
import { BadgeComponent } from '@/shared/ui/badge.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { DialogComponent } from '@/shared/ui/dialog.component';
import { LucideAngularModule, Import, Plus, Send } from '@/shared/ui/icons';
import { ToastService } from '@core/services/toast.service';
import {
  PREVIEW_BADGE,
  PREVIEW_MESSAGES,
  previewCountries,
  previewFeatures,
  previewNumberStatuses,
  previewPhoneNumbers,
  type PreviewPhoneNumber,
} from '@/core/config/frontend-preview.config';

/// Aperçu de la page « Phone numbers ».
///
/// ÉCRAN 100 % FRONTEND : aucun HttpClient, aucune requête, aucun stockage.
/// Les filtres travaillent en mémoire sur les constantes de démonstration, et
/// chaque bouton explique par un message ce qu'il ne fait PAS encore.
@Component({
  selector: 'app-numbers-overview-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    FrontendPreviewNoticeComponent,
    FilterSelectComponent,
    SearchBarComponent,
    BadgeComponent,
    ButtonComponent,
    DialogComponent,
    LucideAngularModule,
  ],
  templateUrl: './numbers-overview-page.component.html',
})
export class NumbersOverviewPage {
  private readonly toast = inject(ToastService);

  protected readonly PlusIcon = Plus;
  protected readonly ImportIcon = Import;
  protected readonly SendIcon = Send;

  protected readonly previewBadge = PREVIEW_BADGE;
  protected readonly countries = previewCountries;
  protected readonly features = previewFeatures;
  protected readonly statuses = previewNumberStatuses;

  protected readonly search = signal('');
  protected readonly country = signal('all');
  protected readonly feature = signal('all');
  protected readonly status = signal('all');

  protected readonly buyOpen = signal(false);
  protected readonly testOpen = signal(false);
  protected readonly testTarget = signal<PreviewPhoneNumber | null>(null);

  /// Filtrage local. `feature` s'appuie sur les capacités réellement décrites
  /// par la donnée d'exemple : un numéro dont le SMS est indisponible ne
  /// ressort pas du filtre « SMS ».
  protected readonly rows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const country = this.country();
    const feature = this.feature();
    const status = this.status();

    return previewPhoneNumbers.filter((row) => {
      if (term && !row.number.toLowerCase().includes(term)) return false;
      if (country !== 'all' && row.country !== country) return false;
      if (status !== 'all' && row.status !== status) return false;
      if (feature === 'sms' && row.sms !== 'available') return false;
      if (feature === 'calls' && row.calls !== 'available') return false;
      if (feature === 'whatsapp' && !row.whatsapp) return false;
      return true;
    });
  });

  protected readonly hasRows = computed(() => this.rows().length > 0);

  protected readonly testMessage = PREVIEW_MESSAGES.numbersTest;
  protected readonly buyMessage = PREVIEW_MESSAGES.numbersBuy;

  protected notifyBringYourOwn(): void {
    this.toast.info('Cette fonctionnalité sera disponible prochainement.');
  }

  protected openTest(row: PreviewPhoneNumber): void {
    this.testTarget.set(row);
    this.testOpen.set(true);
  }

  protected closeTest(): void {
    this.testOpen.set(false);
    this.testTarget.set(null);
  }

  protected resetFilters(): void {
    this.search.set('');
    this.country.set('all');
    this.feature.set('all');
    this.status.set('all');
  }
}
