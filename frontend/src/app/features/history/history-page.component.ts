import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { SearchBarComponent } from '@shared/components/search-bar.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { CardComponent } from '@/shared/ui/card.component';
import { SelectDirective } from '@shared/directives/select.directive';
import { PaginationComponent } from '@shared/components/pagination.component';
import { StatusBadgeComponent, PlatformBadgeComponent } from '@shared/components/badges';
import {
  EmptyStateComponent,
  ErrorStateComponent,
  LoadingStateComponent,
} from '@shared/components/states';
import { PostDetailsDrawerComponent } from './post-details-drawer.component';
import { LucideAngularModule, ChevronDown, Inbox, Send } from '@/shared/ui/icons';
import { PostsService } from '@core/data-access/posts.service';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';
import { queryKeys } from '@core/data-access/query-keys';
import { appConfig } from '@/core/config/app-config';
import { formatDateTime } from '@shared/utils/format';
import type { SocialPost } from '@core/models';

const PAGE_SIZE = 10;
type PlatformFilter =
  | 'all'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'youtube';

@Component({
  selector: 'app-history-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    SearchBarComponent,
    ButtonComponent,
    CardComponent,
    SelectDirective,
    PaginationComponent,
    StatusBadgeComponent,
    PlatformBadgeComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    LoadingStateComponent,
    PostDetailsDrawerComponent,
    LucideAngularModule,
  ],
  templateUrl: './history-page.component.html',
})
export class HistoryPage {
  private readonly postsService = inject(PostsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly SendIcon = Send;
  protected readonly InboxIcon = Inbox;
  protected readonly ChevronDownIcon = ChevronDown;
  protected readonly formatDateTime = formatDateTime;

  protected readonly query = injectQuery(() => ({
    queryKey: queryKeys.posts(appConfig.demoUserId),
    queryFn: () =>
      lastValueFrom(this.postsService.listByUser(appConfig.demoUserId)),
  }));

  /// Libellé d'attente d'une ligne YouTube PENDING, ou chaîne vide.
  ///
  /// Nuance volontaire : avec un `publishId`, la vidéo est bien PARVENUE à
  /// YouTube et y est encodée ; sans lui, l'envoi n'a pas (encore) abouti — on
  /// reste alors prudent. Le `publishId` lui-même n'est JAMAIS affiché.
  protected readonly youtubePendingLabel = (post: SocialPost): string => {
    if (post.platform !== 'YOUTUBE' || post.status !== 'PENDING') return '';
    return post.publishId
      ? 'Traitement YouTube en cours'
      : 'Publication YouTube en attente';
  };

  protected readonly platform = signal<PlatformFilter>('all');
  protected readonly search = signal('');
  private readonly debounced = signal('');
  protected readonly page = signal(1);
  protected readonly selected = signal<SocialPost | null>(null);

  protected readonly filtered = computed(() => {
    const posts = this.query.data() ?? [];
    const platform = this.platform();
    const term = this.debounced();
    return posts.filter((p) => {
      const matchPlatform =
        platform === 'all' || p.platform.toLowerCase() === platform;
      const haystack = [p.caption, p.errorMessage, p.externalPostId, p.metaReason]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchSearch = !term || haystack.includes(term);
      return matchPlatform && matchSearch;
    });
  });

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)),
  );
  protected readonly safePage = computed(() =>
    Math.min(this.page(), this.pageCount()),
  );
  protected readonly pageRows = computed(() =>
    this.filtered().slice(
      (this.safePage() - 1) * PAGE_SIZE,
      this.safePage() * PAGE_SIZE,
    ),
  );

  protected readonly isEmpty = computed(
    () =>
      !this.query.isPending() &&
      !this.query.isError() &&
      (this.query.data() ?? []).length === 0,
  );

  constructor() {
    // Synchronise la recherche avec le paramètre ?q= (ex. depuis le Topbar).
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const q = params.get('q');
        if (q !== null) {
          this.search.set(q);
          this.page.set(1);
        }
      });

    // Debounce de la recherche (250 ms) pour limiter les recalculs.
    effect((onCleanup) => {
      const value = this.search().trim().toLowerCase();
      const id = setTimeout(() => this.debounced.set(value), 250);
      onCleanup(() => clearTimeout(id));
    });
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  protected onPlatformChange(event: Event): void {
    this.platform.set((event.target as HTMLSelectElement).value as PlatformFilter);
    this.page.set(1);
  }

  protected goToPublication(): void {
    this.router.navigateByUrl('/publication');
  }
}
