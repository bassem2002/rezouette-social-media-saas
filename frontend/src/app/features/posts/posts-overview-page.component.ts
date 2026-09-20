import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { ErrorStateComponent } from '@shared/components/states';
import { FilterSelectComponent } from '@shared/components/filter-select.component';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { DialogComponent } from '@/shared/ui/dialog.component';
import { BadgeComponent } from '@/shared/ui/badge.component';
import { SkeletonComponent } from '@/shared/ui/skeleton.component';
import { PlatformIconComponent } from '@shared/components/platform-icon.component';
import {
  CalendarDays,
  LayoutGrid,
  List,
  LucideAngularModule,
  Minus,
  Plus,
  Upload,
} from '@/shared/ui/icons';
import { PostsService } from '@core/data-access/posts.service';
import { queryKeys } from '@core/data-access/query-keys';
import { appConfig } from '@/core/config/app-config';
import { brand } from '@/core/config/brand.config';
import { INBOX_PREVIEW_MESSAGES } from '@/core/config/frontend-preview-data';
import { formatDateTime } from '@shared/utils/format';
import { platformLabel } from '@/features/dashboard/dashboard-labels';
import { PostCardComponent } from './post-card.component';
import { PostDetailsDrawerComponent } from './post-details-drawer.component';
import { CreatePostDrawerComponent } from './create-post-drawer.component';
import {
  POST_GROUP_STATUS_CONFIG,
  groupSocialPosts,
  postTitle,
  type PostGroup,
} from './post-group';

type PostView = 'grid' | 'list';

const MIN_COLUMNS = 2;
const MAX_COLUMNS = 6;

/// Vue d'ensemble des publications.
///
/// DONNÉES RÉELLES : l'historique provient de `GET /social/posts/user/:userId`.
/// Les filtres s'appliquent EN MÉMOIRE sur ce résultat, car aucun de ces
/// critères n'existe côté API — envoyer un paramètre inconnu serait au mieux
/// ignoré, au pire une erreur 400.
///
/// Les seules parties non connectées sont l'import CSV et les filtres
/// « profils » / « utilisateurs », signalés comme tels.
@Component({
  selector: 'app-posts-overview-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    ErrorStateComponent,
    FilterSelectComponent,
    FrontendPreviewNoticeComponent,
    ButtonComponent,
    DialogComponent,
    BadgeComponent,
    SkeletonComponent,
    PlatformIconComponent,
    PostCardComponent,
    PostDetailsDrawerComponent,
    CreatePostDrawerComponent,
    LucideAngularModule,
  ],
  templateUrl: './posts-overview-page.component.html',
})
export class PostsOverviewPage {
  private readonly postsService = inject(PostsService);
  private readonly router = inject(Router);

  protected readonly PlusIcon = Plus;
  protected readonly UploadIcon = Upload;
  protected readonly GridIcon = LayoutGrid;
  protected readonly ListIcon = List;
  protected readonly CalendarIcon = CalendarDays;
  protected readonly MinusIcon = Minus;

  protected readonly brand = brand;
  protected readonly csvMessage = INBOX_PREVIEW_MESSAGES.csvImport;
  protected readonly formatDateTime = formatDateTime;
  protected readonly platformLabel = platformLabel;
  protected readonly statusConfig = POST_GROUP_STATUS_CONFIG;
  protected readonly postTitle = postTitle;

  // ── Filtres (tous locaux) ────────────────────────────────────────────────
  protected readonly scopeOptions = [
    { value: 'rezouette', label: `${brand.name} posts` },
  ];
  protected readonly statusOptions = [
    { value: 'all', label: 'All posts' },
    { value: 'published', label: 'Published' },
    { value: 'partial', label: 'Partially published' },
    { value: 'pending', label: 'Pending' },
    { value: 'failed', label: 'Failed' },
  ];
  protected readonly platformOptions = [
    { value: 'all', label: 'All platforms' },
    { value: 'FACEBOOK', label: 'Facebook' },
    { value: 'INSTAGRAM', label: 'Instagram' },
    { value: 'TIKTOK', label: 'TikTok' },
    { value: 'LINKEDIN', label: 'LinkedIn' },
    { value: 'YOUTUBE', label: 'YouTube' },
  ];
  /// Profils et utilisateurs n'existent pas dans le backend : une seule option,
  /// et la notice de la page l'explique.
  protected readonly profileOptions = [{ value: 'all', label: 'All profiles' }];
  protected readonly userOptions = [{ value: 'all', label: 'All users' }];
  protected readonly dateOptions = [
    { value: 'all', label: 'All dates' },
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
  ];
  protected readonly sortOptions = [
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
  ];

  protected readonly scope = signal('rezouette');
  protected readonly status = signal('all');
  protected readonly platform = signal('all');
  protected readonly profile = signal('all');
  protected readonly user = signal('all');
  protected readonly dateRange = signal('all');
  protected readonly sort = signal('newest');

  protected readonly view = signal<PostView>('grid');
  protected readonly columns = signal(4);
  protected readonly importOpen = signal(false);
  protected readonly createOpen = signal(false);
  protected readonly selected = signal<PostGroup | null>(null);

  protected readonly query = injectQuery(() => ({
    queryKey: queryKeys.posts(appConfig.demoUserId),
    queryFn: () =>
      lastValueFrom(this.postsService.listByUser(appConfig.demoUserId)),
  }));

  private readonly groups = computed(() =>
    groupSocialPosts(this.query.data() ?? []),
  );

  protected readonly filtered = computed(() => {
    const status = this.status();
    const platform = this.platform();
    const since = this.sinceTimestamp();

    const rows = this.groups().filter((group) => {
      if (status !== 'all' && group.status !== status) return false;
      if (platform !== 'all' && !group.platforms.includes(platform as never)) {
        return false;
      }
      if (since !== null && new Date(group.createdAt).getTime() < since) {
        return false;
      }
      return true;
    });

    // `groupSocialPosts` trie déjà du plus récent au plus ancien : l'ordre
    // inverse se contente de retourner la liste, sans nouveau tri.
    return this.sort() === 'oldest' ? [...rows].reverse() : rows;
  });

  protected readonly hasResults = computed(() => this.filtered().length > 0);
  protected readonly isEmptyHistory = computed(
    () => this.groups().length === 0,
  );
  protected readonly resultLabel = computed(() => {
    const count = this.filtered().length;
    return count === 1 ? '1 publication' : `${count} publications`;
  });

  /// Style de grille : nombre de colonnes choisi, appliqué seulement à partir
  /// de `lg` (voir `.rz-posts-grid` dans styles.css).
  protected readonly gridStyle = computed(() => ({
    '--rz-post-cols': String(this.columns()),
  }));

  private sinceTimestamp(): number | null {
    const range = this.dateRange();
    if (range === 'all') return null;
    const days = Number(range.replace('d', ''));
    if (!Number.isFinite(days)) return null;
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));
    return since.getTime();
  }

  protected setColumns(delta: number): void {
    this.columns.update((current) =>
      Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, current + delta)),
    );
  }

  protected canDecrease(): boolean {
    return this.columns() > MIN_COLUMNS;
  }

  protected canIncrease(): boolean {
    return this.columns() < MAX_COLUMNS;
  }

  /// Ouvre le panneau de composition. La page `/publication` reste accessible
  /// et utilise le MÊME composer : les deux entrées partagent le même code.
  protected openComposer(): void {
    this.createOpen.set(true);
  }


  /// La vue calendrier réutilise la page Calendrier existante plutôt que d'en
  /// dupliquer l'implémentation.
  protected goToCalendar(): void {
    void this.router.navigateByUrl('/calendar');
  }

  protected resetFilters(): void {
    this.status.set('all');
    this.platform.set('all');
    this.dateRange.set('all');
  }
}
