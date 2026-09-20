import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { DrawerComponent } from '@/shared/ui/drawer.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { BadgeComponent } from '@/shared/ui/badge.component';
import { PlatformBadgeComponent, ScheduledStatusBadgeComponent } from '@shared/components/badges';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog.component';
import { ToastService } from '@core/services/toast.service';
import { LucideAngularModule, Ban, ExternalLink } from '@/shared/ui/icons';
import { formatDateTime } from '@shared/utils/format';
import { ScheduledPostsService } from '@core/data-access/scheduled-posts.service';
import {
  injectMutation,
  injectQueryClient,
} from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';
import { queryKeys } from '@core/data-access/query-keys';
import { appConfig } from '@/core/config/app-config';
import { YOUTUBE_PRIVACY_LABELS } from '@core/models';
import type { ScheduledPost, YouTubePrivacyStatus } from '@core/models';

/// Détail d'une publication programmée. Permet l'annulation tant que le statut
/// est SCHEDULED (le backend refuse au-delà). Réutilise Drawer + badges partagés.
@Component({
  selector: 'app-scheduled-post-details-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DrawerComponent,
    ButtonComponent,
    BadgeComponent,
    PlatformBadgeComponent,
    ScheduledStatusBadgeComponent,
    ConfirmDialogComponent,
    LucideAngularModule,
  ],
  templateUrl: './scheduled-post-details-drawer.component.html',
})
export class ScheduledPostDetailsDrawerComponent {
  private readonly toast = inject(ToastService);
  private readonly scheduledService = inject(ScheduledPostsService);
  private readonly queryClient = injectQueryClient();

  readonly post = input<ScheduledPost | null>(null);
  readonly close = output<void>();

  protected readonly formatDateTime = formatDateTime;
  protected readonly BanIcon = Ban;
  protected readonly ExternalLinkIcon = ExternalLink;
  protected readonly confirmOpen = signal(false);

  protected readonly canCancel = computed(
    () => this.post()?.status === 'SCHEDULED',
  );

  /// Options YouTube de la planification, ou `null`. Les valeurs manquantes
  /// restent `null` : une planification héritée est affichée « non renseigné »,
  /// jamais complétée par des valeurs inventées.
  protected readonly youtubeOptions = computed(() => {
    const youtube = this.post()?.platformOptions?.youtube;
    if (!youtube) return null;
    return {
      title: youtube.title ?? null,
      description: youtube.description ?? null,
      tags: youtube.tags ?? [],
      privacyStatus: youtube.privacyStatus ?? null,
      madeForKids: youtube.madeForKids ?? null,
    };
  });

  protected readonly privacyLabel = (
    status: YouTubePrivacyStatus | null,
  ): string =>
    status ? YOUTUBE_PRIVACY_LABELS[status] : 'Confidentialité non renseignée';

  /// `null` ≠ `false` : une déclaration COPPA absente doit se voir comme telle.
  protected readonly kidsLabel = (value: boolean | null): string => {
    if (value === null) return 'Déclaration enfants non renseignée';
    return value ? 'Destiné aux enfants' : 'Pas destiné aux enfants';
  };

  protected readonly cancelMutation = injectMutation(() => ({
    mutationFn: (id: string) => lastValueFrom(this.scheduledService.cancel(id)),
    onSuccess: () =>
      this.queryClient.invalidateQueries({
        queryKey: queryKeys.scheduledPosts(appConfig.demoUserId),
      }),
  }));

  protected handleCancel(): void {
    const current = this.post();
    if (!current) return;
    this.cancelMutation.mutate(current.id, {
      onSuccess: () => {
        this.toast.success('Publication programmée annulée.');
        this.confirmOpen.set(false);
        this.close.emit();
      },
      onError: () => this.toast.error("L'annulation a échoué. Réessayez."),
    });
  }
}
