import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { FilterSelectComponent } from '@shared/components/filter-select.component';
import { InboxSplitLayoutComponent } from '@shared/components/inbox-split-layout.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import { PlatformIconComponent } from '@shared/components/platform-icon.component';
import { ErrorStateComponent } from '@shared/components/states';
import { SkeletonComponent } from '@/shared/ui/skeleton.component';
import { LucideAngularModule, ImageOff } from '@/shared/ui/icons';
import { PostsService } from '@core/data-access/posts.service';
import { queryKeys } from '@core/data-access/query-keys';
import { appConfig } from '@/core/config/app-config';
import { REZOUETTE_CAPABILITIES } from '@/core/config/feature-capabilities';
import {
  previewAccountFilters,
  previewPlatformFilters,
  previewProfileFilters,
  previewSortFilters,
} from '@/core/config/frontend-preview-data';
import { formatDate } from '@shared/utils/format';
import { platformLabel } from '@/features/dashboard/dashboard-labels';
import { postTitle } from '@/features/posts/post-group';
import type { SocialPost } from '@core/models';

/// Inbox — Comments.
///
/// ÉCRAN HYBRIDE, et la frontière est nette : la liste de gauche affiche les
/// VRAIES publications (`GET /social/posts/user/:userId`), une ligne par envoi
/// vers une plateforme ; le panneau de droite ne peut rien afficher, faute
/// d'endpoint de commentaires. Aucun commentaire fictif n'est rattaché à une
/// publication réelle — ce serait la confusion la plus dommageable possible.
@Component({
  selector: 'app-inbox-comments-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FrontendPreviewNoticeComponent,
    FilterSelectComponent,
    InboxSplitLayoutComponent,
    PreviewBadgeComponent,
    PlatformIconComponent,
    ErrorStateComponent,
    SkeletonComponent,
    LucideAngularModule,
  ],
  templateUrl: './comments-page.component.html',
})
export class InboxCommentsPage {
  private readonly postsService = inject(PostsService);

  protected readonly NoImageIcon = ImageOff;
  protected readonly formatDate = formatDate;
  protected readonly platformLabel = platformLabel;
  protected readonly postTitle = postTitle;

  protected readonly platformOptions = previewPlatformFilters;
  protected readonly profileOptions = previewProfileFilters;
  protected readonly accountOptions = previewAccountFilters;
  protected readonly sortOptions = previewSortFilters;

  protected readonly commentsReason =
    REZOUETTE_CAPABILITIES.comments.reason ?? '';

  protected readonly platform = signal('all');
  protected readonly profile = signal('all');
  protected readonly account = signal('all');
  protected readonly sort = signal('newest');
  protected readonly selected = signal<SocialPost | null>(null);

  protected readonly query = injectQuery(() => ({
    queryKey: queryKeys.posts(appConfig.demoUserId),
    queryFn: () =>
      lastValueFrom(this.postsService.listByUser(appConfig.demoUserId)),
  }));

  /// Une ligne par publication RÉELLE envoyée vers une plateforme. Seules les
  /// publications abouties peuvent porter des commentaires : les lignes en
  /// échec ou en attente sont donc écartées.
  protected readonly posts = computed(() => {
    const platform = this.platform();
    const rows = (this.query.data() ?? []).filter(
      (post) =>
        post.status === 'PUBLISHED' &&
        (platform === 'all' || post.platform === platform),
    );
    const sorted = [...rows].sort((a, b) =>
      (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt),
    );
    return this.sort() === 'oldest' ? sorted.reverse() : sorted;
  });

  protected readonly hasPosts = computed(() => this.posts().length > 0);

  /// Titre d'une ligne — réutilise la règle d'extrait des cartes Posts.
  protected titleOf(post: SocialPost): string {
    return postTitle({
      key: post.id,
      caption: post.caption,
      mediaUrl: post.mediaUrl,
      createdAt: post.createdAt,
      publishedAt: post.publishedAt,
      platforms: [post.platform],
      results: [],
      status: 'published',
      displayId: post.id,
    });
  }
}
