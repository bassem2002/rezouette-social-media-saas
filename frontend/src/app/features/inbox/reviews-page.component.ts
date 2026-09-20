import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { FilterSelectComponent } from '@shared/components/filter-select.component';
import { InboxSplitLayoutComponent } from '@shared/components/inbox-split-layout.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import {
  previewAccountFilters,
  previewPlatformFilters,
  previewProfileFilters,
  previewReviews,
  previewSortFilters,
} from '@/core/config/frontend-preview-data';

/// Inbox — Reviews.
///
/// APERÇU FRONTEND intégral : aucun endpoint d'avis n'existe. La liste reste
/// vide — une note inventée serait immédiatement lue comme un avis client réel,
/// et pourrait orienter une décision commerciale.
@Component({
  selector: 'app-inbox-reviews-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FrontendPreviewNoticeComponent,
    FilterSelectComponent,
    InboxSplitLayoutComponent,
    PreviewBadgeComponent,
  ],
  templateUrl: './reviews-page.component.html',
})
export class InboxReviewsPage {
  protected readonly platformOptions = previewPlatformFilters;
  protected readonly profileOptions = previewProfileFilters;
  protected readonly accountOptions = previewAccountFilters;
  protected readonly sortOptions = previewSortFilters;

  protected readonly platform = signal('all');
  protected readonly profile = signal('all');
  protected readonly account = signal('all');
  protected readonly sort = signal('newest');
  protected readonly selectedId = signal<string | null>(null);

  protected readonly reviews = computed(() => {
    const platform = this.platform();
    return previewReviews.filter(
      (review) => platform === 'all' || review.platform === platform,
    );
  });

  protected readonly hasReviews = computed(() => this.reviews().length > 0);
}
