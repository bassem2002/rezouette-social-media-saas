import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule, Bell, Menu } from '@/shared/ui/icons';
import { BreadcrumbComponent } from './breadcrumb.component';
import { SearchBarComponent } from '@shared/components/search-bar.component';
import { TokenService } from '@core/data-access/token.service';
import { appConfig } from '@/core/config/app-config';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';
import { queryKeys } from '@core/data-access/query-keys';

/// Barre supérieure historique : menu mobile, fil d'Ariane, recherche,
/// notifications, avatar.
///
/// ⚠️ N'est PLUS montée dans le shell : la charte Rezouette proscrit la barre
/// supérieure globale (chaque page porte son propre en-tête, et le tiroir mobile
/// est ouvert par `MobileTopbarComponent`). Le composant est conservé car sa
/// logique — badge de reconnexion issu du statut de token, renvoi vers la
/// recherche de l'historique — reste réutilisable telle quelle. Aucune
/// fonctionnalité n'est perdue : la recherche existe dans la page Historique et
/// l'alerte de reconnexion est reprise par le Dashboard et par Connections.
@Component({
  selector: 'app-topbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, BreadcrumbComponent, SearchBarComponent],
  templateUrl: './topbar.component.html',
})
export class TopbarComponent {
  private readonly router = inject(Router);
  private readonly tokenService = inject(TokenService);

  readonly menuClick = output<void>();

  protected readonly MenuIcon = Menu;
  protected readonly BellIcon = Bell;

  protected readonly search = signal('');
  protected readonly notifOpen = signal(false);

  private readonly tokenQuery = injectQuery(() => ({
    queryKey: queryKeys.tokenStatus(appConfig.demoUserId),
    queryFn: () =>
      lastValueFrom(this.tokenService.getStatus(appConfig.demoUserId)),
    retry: false,
  }));

  protected readonly needsReconnect = computed(
    () => this.tokenQuery.data()?.needsReconnect ?? false,
  );

  protected submitSearch(event: Event): void {
    event.preventDefault();
    const q = this.search().trim();
    this.router.navigateByUrl(
      q ? `/history?q=${encodeURIComponent(q)}` : '/history',
    );
  }

  protected goToAccounts(): void {
    this.notifOpen.set(false);
    this.router.navigateByUrl('/accounts');
  }

  protected goToSettings(): void {
    this.router.navigateByUrl('/settings');
  }
}
