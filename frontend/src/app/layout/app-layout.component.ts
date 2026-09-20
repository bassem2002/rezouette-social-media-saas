import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { SidebarComponent } from './sidebar.component';
import { MobileTopbarComponent } from './mobile-topbar.component';
import { SupportRailComponent } from './support-rail.component';
import { demoProfile } from '@/core/config/frontend-demo.config';

/// Shell applicatif : colonne de navigation fixe à gauche, contenu à droite.
///
/// Aucune barre supérieure sur desktop — ni fil d'Ariane global, ni recherche,
/// ni cloche, ni avatar : chaque page porte son propre en-tête, ce qui laisse
/// au contenu toute la largeur et supprime la ligne horizontale qui coupait la
/// mise en page. Sous `lg`, une barre minimale expose le bouton de menu.
@Component({
  selector: 'app-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    SidebarComponent,
    MobileTopbarComponent,
    SupportRailComponent,
  ],
  host: { '(document:keydown.escape)': 'mobileOpen.set(false)' },
  template: `
    <div class="min-h-svh bg-background">
      <app-sidebar
        [mobileOpen]="mobileOpen()"
        [userName]="userName"
        [userEmail]="userEmail"
        (close)="mobileOpen.set(false)"
      />

      <div class="min-w-0 overflow-x-clip lg:pl-[var(--rz-sidebar-width)]">
        <app-mobile-topbar (menuClick)="mobileOpen.set(true)" />
        <main class="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <router-outlet />
        </main>
      </div>

      <app-support-rail />
    </div>
  `,
})
export class AppLayoutComponent {
  private readonly router = inject(Router);
  protected readonly mobileOpen = signal(false);

  /// Identité affichée dans la sidebar. Tant qu'aucun endpoint utilisateur
  /// n'existe, elle vient du profil de démonstration centralisé — jamais d'une
  /// valeur inventée à la volée.
  protected readonly userName = demoProfile.name;
  protected readonly userEmail = demoProfile.email;

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.mobileOpen.set(false));
  }
}
