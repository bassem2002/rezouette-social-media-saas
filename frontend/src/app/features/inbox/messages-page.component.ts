import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { FilterSelectComponent } from '@shared/components/filter-select.component';
import { SearchBarComponent } from '@shared/components/search-bar.component';
import { InboxSplitLayoutComponent } from '@shared/components/inbox-split-layout.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import { LucideAngularModule, SquarePen } from '@/shared/ui/icons';
import { ToastService } from '@core/services/toast.service';
import {
  INBOX_PREVIEW_MESSAGES,
  previewAccountFilters,
  previewConversations,
  previewPlatformFilters,
  previewProfileFilters,
  previewSortFilters,
} from '@/core/config/frontend-preview-data';

/// Inbox — Messages.
///
/// APERÇU FRONTEND intégral : aucun controller de messagerie n'existe côté
/// backend (voir `feature-capabilities.ts`). La liste reste vide par choix
/// délibéré — inventer des conversations rattachées à de vrais comptes sociaux
/// serait le mensonge le plus difficile à détecter de cet écran.
@Component({
  selector: 'app-inbox-messages-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FrontendPreviewNoticeComponent,
    FilterSelectComponent,
    SearchBarComponent,
    InboxSplitLayoutComponent,
    PreviewBadgeComponent,
    LucideAngularModule,
  ],
  templateUrl: './messages-page.component.html',
})
export class InboxMessagesPage {
  private readonly toast = inject(ToastService);

  protected readonly ComposeIcon = SquarePen;

  protected readonly platformOptions = previewPlatformFilters;
  protected readonly profileOptions = previewProfileFilters;
  protected readonly accountOptions = previewAccountFilters;
  protected readonly sortOptions = previewSortFilters;

  protected readonly platform = signal('all');
  protected readonly profile = signal('all');
  protected readonly account = signal('all');
  protected readonly sort = signal('newest');
  protected readonly search = signal('');
  protected readonly selectedId = signal<string | null>(null);

  protected readonly conversations = computed(() => {
    const term = this.search().trim().toLowerCase();
    const platform = this.platform();
    return previewConversations.filter((conversation) => {
      if (platform !== 'all' && conversation.platform !== platform) return false;
      if (term && !conversation.contact.toLowerCase().includes(term)) return false;
      return true;
    });
  });

  protected readonly hasConversations = computed(
    () => this.conversations().length > 0,
  );

  protected compose(): void {
    this.toast.info(INBOX_PREVIEW_MESSAGES.newMessage);
  }
}
