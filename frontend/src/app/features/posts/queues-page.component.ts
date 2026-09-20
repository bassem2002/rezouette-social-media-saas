import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  injectMutation,
  injectQuery,
  injectQueryClient,
} from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { ErrorStateComponent } from '@shared/components/states';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog.component';
import { FilterSelectComponent } from '@shared/components/filter-select.component';
import { BadgeComponent, type BadgeTone } from '@/shared/ui/badge.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { SkeletonComponent } from '@/shared/ui/skeleton.component';
import { PlatformIconComponent } from '@shared/components/platform-icon.component';
import { LucideAngularModule, CalendarClock } from '@/shared/ui/icons';
import { ScheduledPostsService } from '@core/data-access/scheduled-posts.service';
import { queryKeys } from '@core/data-access/query-keys';
import { appConfig } from '@/core/config/app-config';
import { ToastService } from '@core/services/toast.service';
import { formatDateTime } from '@shared/utils/format';
import { platformLabel } from '@/features/dashboard/dashboard-labels';
import type { ScheduledPost, ScheduledPostStatus } from '@core/models';

/// Libellé et tonalité de chaque état de planification. Le texte accompagne
/// toujours la couleur.
const STATUS_CONFIG: Record<
  ScheduledPostStatus,
  { label: string; tone: BadgeTone }
> = {
  SCHEDULED: { label: 'scheduled', tone: 'primary' },
  PROCESSING: { label: 'processing', tone: 'warning' },
  PUBLISHED: { label: 'published', tone: 'success' },
  FAILED: { label: 'failed', tone: 'error' },
  CANCELLED: { label: 'cancelled', tone: 'muted' },
};

/// File d'attente de publication.
///
/// DONNÉES RÉELLES : `GET /social/scheduled-posts?userId=` fournit l'état, le
/// nombre de tentatives et l'échéance de chaque planification ; l'annulation
/// passe par `DELETE /social/scheduled-posts/:id`, qui bascule la ligne en
/// CANCELLED. Aucun aperçu, aucune donnée fabriquée sur cet écran.
@Component({
  selector: 'app-queues-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    FilterSelectComponent,
    BadgeComponent,
    ButtonComponent,
    SkeletonComponent,
    PlatformIconComponent,
    LucideAngularModule,
  ],
  templateUrl: './queues-page.component.html',
})
export class QueuesPage {
  private readonly scheduledPosts = inject(ScheduledPostsService);
  private readonly queryClient = injectQueryClient();
  private readonly toast = inject(ToastService);

  protected readonly CalendarIcon = CalendarClock;
  protected readonly formatDateTime = formatDateTime;
  protected readonly platformLabel = platformLabel;
  protected readonly statusConfig = STATUS_CONFIG;

  protected readonly statusOptions = [
    { value: 'all', label: 'All statuses' },
    { value: 'SCHEDULED', label: 'Scheduled' },
    { value: 'PROCESSING', label: 'Processing' },
    { value: 'PUBLISHED', label: 'Published' },
    { value: 'FAILED', label: 'Failed' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  protected readonly status = signal('all');
  protected readonly pendingCancel = signal<ScheduledPost | null>(null);

  protected readonly query = injectQuery(() => ({
    queryKey: queryKeys.scheduledPosts(appConfig.demoUserId),
    queryFn: () =>
      lastValueFrom(this.scheduledPosts.listByUser(appConfig.demoUserId)),
  }));

  protected readonly cancelMutation = injectMutation(() => ({
    mutationFn: (id: string) => lastValueFrom(this.scheduledPosts.cancel(id)),
    onSuccess: () => {
      // La liste vient de changer côté serveur : on la relit plutôt que de
      // deviner le nouvel état localement.
      this.queryClient.invalidateQueries({
        queryKey: queryKeys.scheduledPosts(appConfig.demoUserId),
      });
      this.toast.success('Publication programmée annulée.');
    },
    onError: () => {
      this.toast.error(
        'L’annulation a échoué. La planification est peut-être déjà en cours de traitement.',
      );
    },
  }));

  protected readonly rows = computed(() => {
    const status = this.status();
    const posts = this.query.data() ?? [];
    const filtered =
      status === 'all' ? posts : posts.filter((p) => p.status === status);
    return [...filtered].sort((a, b) =>
      a.scheduledAt.localeCompare(b.scheduledAt),
    );
  });

  protected readonly hasRows = computed(() => this.rows().length > 0);
  protected readonly isEmpty = computed(
    () => (this.query.data() ?? []).length === 0,
  );

  protected readonly cancelDescription = computed(() => {
    const post = this.pendingCancel();
    if (!post) return null;
    return `Cette planification du ${formatDateTime(post.scheduledAt)} passera à l’état « cancelled ». L’opération est définitive.`;
  });

  /// Extrait affiché dans la colonne Contenu — le message, à défaut la légende.
  protected excerpt(post: ScheduledPost): string {
    const text = (post.message ?? post.caption ?? '').trim();
    if (!text) return 'Sans contenu textuel';
    return text.length > 70 ? `${text.slice(0, 69)}…` : text;
  }

  /// Seules les planifications encore en attente sont annulables : le backend
  /// refuse les autres états.
  protected canCancel(post: ScheduledPost): boolean {
    return post.status === 'SCHEDULED';
  }

  protected confirmCancel(): void {
    const post = this.pendingCancel();
    if (!post) return;
    this.cancelMutation.mutate(post.id);
    this.pendingCancel.set(null);
  }
}
