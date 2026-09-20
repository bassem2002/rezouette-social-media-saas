import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { CardComponent } from '@/shared/ui/card.component';
import { ErrorStateComponent, LoadingStateComponent } from '@shared/components/states';
import { PlatformIconComponent } from '@shared/components/platform-icon.component';
import { ScheduledPostDetailsDrawerComponent } from './scheduled-post-details-drawer.component';
import {
  LucideAngularModule,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
} from '@/shared/ui/icons';
import { cn } from '@shared/utils/utils';
import { ScheduledPostsService } from '@core/data-access/scheduled-posts.service';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';
import { queryKeys } from '@core/data-access/query-keys';
import { appConfig } from '@/core/config/app-config';
import type { ScheduledPost, ScheduledPostStatus } from '@core/models';
import { WEEKDAYS, buildMonthGrid, monthLabel, postTime } from './calendar-utils';

/// Couleurs de pastille par statut — alignées sur les tons des badges.
const STATUS_CHIP: Record<ScheduledPostStatus, string> = {
  SCHEDULED: 'bg-primary-soft text-[#1d4ed8]',
  PROCESSING: 'bg-warning-soft text-[#b45309]',
  PUBLISHED: 'bg-success-soft text-[#15803d]',
  FAILED: 'bg-error-soft text-[#b91c1c]',
  CANCELLED: 'bg-muted-soft text-[#475569]',
};

/// Calendrier mensuel des publications programmées. Navigation mois précédent/
/// suivant + aujourd'hui ; clic sur une publication ouvre son détail (avec
/// annulation si SCHEDULED). Lecture seule : la programmation se fait depuis
/// la page Publication.
@Component({
  selector: 'app-calendar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    ButtonComponent,
    CardComponent,
    ErrorStateComponent,
    LoadingStateComponent,
    PlatformIconComponent,
    ScheduledPostDetailsDrawerComponent,
    LucideAngularModule,
  ],
  templateUrl: './calendar-page.component.html',
})
export class CalendarPage {
  private readonly scheduledService = inject(ScheduledPostsService);
  private readonly router = inject(Router);

  protected readonly CalendarPlusIcon = CalendarPlus;
  protected readonly ChevronLeftIcon = ChevronLeft;
  protected readonly ChevronRightIcon = ChevronRight;
  protected readonly weekdays = WEEKDAYS;
  protected readonly postTime = postTime;

  private readonly today = new Date();
  protected readonly cursor = signal({
    year: this.today.getFullYear(),
    month: this.today.getMonth(),
  });
  protected readonly selected = signal<ScheduledPost | null>(null);

  protected readonly query = injectQuery(() => ({
    queryKey: queryKeys.scheduledPosts(appConfig.demoUserId),
    queryFn: () =>
      lastValueFrom(this.scheduledService.listByUser(appConfig.demoUserId)),
    refetchInterval: 30_000,
  }));

  private readonly posts = computed(() => this.query.data() ?? []);
  protected readonly cells = computed(() =>
    buildMonthGrid(this.cursor().year, this.cursor().month, this.posts()),
  );
  protected readonly monthLabelText = computed(() =>
    monthLabel(this.cursor().year, this.cursor().month),
  );

  protected goToMonth(delta: number): void {
    this.cursor.update((prev) => {
      const date = new Date(prev.year, prev.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }

  protected goToday(): void {
    this.cursor.set({
      year: this.today.getFullYear(),
      month: this.today.getMonth(),
    });
  }

  protected goToPublication(): void {
    this.router.navigateByUrl('/publication');
  }

  protected cellClasses(inMonth: boolean): string {
    return cn(
      'min-h-[88px] border-b border-r border-border p-1.5 last:border-r-0 sm:min-h-[112px]',
      inMonth ? 'bg-white' : 'bg-muted-soft/30',
    );
  }

  protected dateBadgeClasses(isToday: boolean, inMonth: boolean): string {
    return cn(
      'flex size-6 items-center justify-center rounded-full text-xs',
      isToday
        ? 'bg-primary font-semibold text-white'
        : inMonth
          ? 'text-foreground'
          : 'text-muted/60',
    );
  }

  protected chipClasses(status: ScheduledPostStatus): string {
    return cn(
      'flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] font-medium leading-none',
      'transition-opacity duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      STATUS_CHIP[status],
    );
  }
}
