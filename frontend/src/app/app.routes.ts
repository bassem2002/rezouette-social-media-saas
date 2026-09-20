import { Routes } from '@angular/router';
import { AppLayoutComponent } from '@layout/app-layout.component';

/// Pages annoncées dans le menu mais sans service backend. Elles partagent la
/// même page d'attente, qui n'émet aucune requête (voir `ComingSoonPage`).
const comingSoon: { path: string; title: string }[] = [
  { path: 'documentation', title: 'Documentation' },
];

/// Section Settings — entièrement en aperçu frontend (aucun controller
/// utilisateur, sécurité, notifications ou intégration côté backend), sauf la
/// page Slack qui affiche le nombre RÉEL de comptes connectés.
const settingsRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'profile' },
  {
    path: 'profile',
    loadComponent: () =>
      import('@/features/settings/profile-page.component').then(
        (m) => m.SettingsProfilePage,
      ),
  },
  {
    path: 'security',
    loadComponent: () =>
      import('@/features/settings/security-page.component').then(
        (m) => m.SettingsSecurityPage,
      ),
  },
  {
    path: 'notifications',
    loadComponent: () =>
      import('@/features/settings/notifications-page.component').then(
        (m) => m.SettingsNotificationsPage,
      ),
  },
  {
    path: 'connected-apps',
    loadComponent: () =>
      import('@/features/settings/connected-apps-page.component').then(
        (m) => m.SettingsConnectedAppsPage,
      ),
  },
  {
    path: 'slack',
    loadComponent: () =>
      import('@/features/settings/slack-page.component').then(
        (m) => m.SettingsSlackPage,
      ),
  },
  {
    path: 'ai-providers',
    loadComponent: () =>
      import('@/features/settings/ai-providers-page.component').then(
        (m) => m.SettingsAiProvidersPage,
      ),
  },
  {
    path: 'sso',
    loadComponent: () =>
      import('@/features/settings/sso-page.component').then(
        (m) => m.SettingsSsoPage,
      ),
  },
  {
    path: 'danger-zone',
    loadComponent: () =>
      import('@/features/settings/danger-zone-page.component').then(
        (m) => m.SettingsDangerZonePage,
      ),
  },
  // Usage et Billing pointeraient vers un portail externe : sans service, elles
  // mènent à la page d'attente générique plutôt qu'à une adresse morte.
  ...(['usage', 'billing'] as const).map((path) => ({
    path,
    data: { title: path === 'usage' ? 'Usage' : 'Billing' },
    loadComponent: () =>
      import('@/features/placeholder/coming-soon-page.component').then(
        (m) => m.ComingSoonPage,
      ),
  })),
];

/// Écrans Inbox — tous des aperçus frontend sauf Comments, dont la liste de
/// publications est réelle (voir `feature-capabilities.ts`).
const inboxRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'messages' },
  {
    path: 'messages',
    loadComponent: () =>
      import('@/features/inbox/messages-page.component').then(
        (m) => m.InboxMessagesPage,
      ),
  },
  {
    path: 'comments',
    loadComponent: () =>
      import('@/features/inbox/comments-page.component').then(
        (m) => m.InboxCommentsPage,
      ),
  },
  {
    path: 'reviews',
    loadComponent: () =>
      import('@/features/inbox/reviews-page.component').then(
        (m) => m.InboxReviewsPage,
      ),
  },
  {
    path: 'campaigns',
    loadComponent: () =>
      import('@/features/inbox/campaigns-page.component').then(
        (m) => m.InboxCampaignsPage,
      ),
  },
  {
    path: 'workflows',
    loadComponent: () =>
      import('@/features/inbox/workflows-page.component').then(
        (m) => m.InboxWorkflowsPage,
      ),
  },
  {
    path: 'contacts',
    loadComponent: () =>
      import('@/features/inbox/contacts-page.component').then(
        (m) => m.InboxContactsPage,
      ),
  },
];

const comingSoonRoutes: Routes = comingSoon.map(({ path, title }) => ({
  path,
  data: { title },
  loadComponent: () =>
    import('@/features/placeholder/coming-soon-page.component').then(
      (m) => m.ComingSoonPage,
    ),
}));

/// Toutes les routes vivent sous le shell AppLayout (sidebar + contenu).
/// Les pages sont chargées en lazy (un bundle par feature).
///
/// L'accueil mène au Dashboard : c'est la première entrée du menu et l'écran
/// affiché après connexion. Aucune redirection ne pointe vers Connections.
export const routes: Routes = [
  {
    path: '',
    component: AppLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('@/features/dashboard/dashboard-page.component').then((m) => m.DashboardPage),
      },
      {
        path: 'publication',
        loadComponent: () =>
          import('@/features/publication/publication-page.component').then((m) => m.PublicationPage),
      },
      {
        path: 'history',
        loadComponent: () =>
          import('@/features/history/history-page.component').then((m) => m.HistoryPage),
      },
      {
        path: 'calendar',
        loadComponent: () =>
          import('@/features/calendar/calendar-page.component').then((m) => m.CalendarPage),
      },
      {
        path: 'connections',
        loadComponent: () =>
          import('@/features/accounts/connected-accounts-page.component').then(
            (m) => m.ConnectedAccountsPage,
          ),
      },
      // Ancienne adresse de la page : conservée pour ne casser aucun lien, et
      // surtout parce que les flux OAuth du backend y reviennent avec leurs
      // paramètres (`?oauthProvider=…&status=…`). Le routeur Angular reporte
      // les query params sur la redirection : le résultat de connexion reste
      // donc affiché à l'identique.
      { path: 'accounts', pathMatch: 'full', redirectTo: 'connections' },
      {
        path: 'analytics',
        loadComponent: () =>
          import('@/features/analytics/analytics-page.component').then((m) => m.AnalyticsPage),
      },

      // ── Posts ────────────────────────────────────────────────────────────
      // Données RÉELLES (historique + planifications). Les routes historiques
      // `/publication`, `/calendar` et `/history` restent intactes au-dessus :
      // aucun ancien lien n'est cassé.
      {
        path: 'posts',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'overview' },
          {
            path: 'overview',
            loadComponent: () =>
              import('@/features/posts/posts-overview-page.component').then(
                (m) => m.PostsOverviewPage,
              ),
          },
          {
            path: 'queues',
            loadComponent: () =>
              import('@/features/posts/queues-page.component').then(
                (m) => m.QueuesPage,
              ),
          },
        ],
      },

      // ── Inbox ────────────────────────────────────────────────────────────
      { path: 'inbox', children: inboxRoutes },
      { path: 'settings', children: settingsRoutes },

      {
        path: 'ads',
        loadComponent: () =>
          import('@/features/ads/ads-page.component').then((m) => m.AdsPage),
      },
      {
        path: 'sms',
        children: [
          { path: '', pathMatch: 'full', redirectTo: '10dlc' },
          {
            path: '10dlc',
            loadComponent: () =>
              import('@/features/sms/tendlc-page.component').then(
                (m) => m.SmsTenDlcPage,
              ),
          },
          {
            path: 'sender-ids',
            loadComponent: () =>
              import('@/features/sms/sender-ids-page.component').then(
                (m) => m.SmsSenderIdsPage,
              ),
          },
        ],
      },

      // ── Écrans d'APERÇU FRONTEND ────────────────────────────────────────
      // Aucun service backend ne les alimente : ils travaillent sur des
      // constantes de démonstration et signalent leur état à l'écran.
      {
        path: 'numbers',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'overview' },
          {
            path: 'overview',
            loadComponent: () =>
              import('@/features/numbers/numbers-overview-page.component').then(
                (m) => m.NumbersOverviewPage,
              ),
          },
          {
            path: 'calls',
            loadComponent: () =>
              import('@/features/numbers/calls-page.component').then((m) => m.CallsPage),
          },
        ],
      },
      {
        path: 'api-keys',
        loadComponent: () =>
          import('@/features/api-keys/api-keys-page.component').then((m) => m.ApiKeysPage),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('@/features/users/team-page.component').then((m) => m.TeamPage),
      },
      {
        path: 'webhooks',
        loadComponent: () =>
          import('@/features/webhooks/webhooks-page.component').then((m) => m.WebhooksPage),
      },
      {
        path: 'logs',
        loadComponent: () =>
          import('@/features/logs/logs-page.component').then((m) => m.LogsPage),
      },

      ...comingSoonRoutes,
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
