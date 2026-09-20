# Zernio — Migration Frontend React → Angular 21

> Nouveau frontend **`zernio-angular-frontend/`** qui reproduit à l'identique le
> frontend React (`zernio-frontend/`). **Le backend NestJS n'est pas modifié par la migration**
> et **toutes les APIs `/api/v1/...` restent inchangées.**

> 🎵 **Front actif + intégration TikTok.** Le frontend Angular est désormais le **front actif**
> du projet : il porte l'**intégration TikTok** (composer vidéo, upload vidéo, compte TikTok,
> badges/icônes, historique, calendrier, analytics) — détails en **§10**. Le **front React est gelé**
> (maintenance uniquement) et **n'a pas reçu TikTok**.

État : ✅ **compile sans erreur** (`ng build` dev + prod, AOT + budgets) et démarre (`ng serve`).

---

## 1. Architecture finale (feature-first hybride)

- **Angular 21**, composants **100 % standalone** (aucun NgModule applicatif).
- **Feature-first hybride** : `core/` (singletons app-wide) · `shared/` (100 % présentationnel) · `layout/` (shell) · `features/` (pages autonomes).
- **Signals** partout pour l'état local et dérivé (`signal`, `computed`, `effect`, `input`, `output`, `viewChild`).
- **Zone.js** conservé (change detection classique) pour une compatibilité maximale avec les Reactive Forms et RxJS.
- **HttpClient** + **intercepteur fonctionnel** (`api.interceptor.ts`) qui rejoue le rôle de l'instance axios : préfixe `baseURL`, `withCredentials`, redirection 401.
- **@tanstack/angular-query** (`injectQuery` / `injectMutation` / `injectQueryClient`) pour tout le data-fetching : cache par clé, `isPending`/`isError`, `refetch`, **invalidation ciblée** (`invalidateQueries`) et `refetchInterval`. La configuration vit dans `core/http/query.provider.ts` (`provideAppQuery()`, `staleTime` 5 min, `retry` 1).
- **Reactive Forms** pour les formulaires (composer de publication, profil Paramètres).
- **Tailwind CSS v4** (mêmes tokens `@theme`, thème clair uniquement) — les classes utilitaires sont portées telles quelles depuis React.
- **Icônes** : `lucide-angular` (équivalent de `lucide-react`).
- **Composants UI sur mesure** (pas d'Angular Material) fidèles au design system Shadcn-like existant.
- **Lazy-loading** d'une page par route (`loadComponent`).

### Conventions (règles d'entreprise appliquées)

- **Nommage Angular officiel** : `*.component.ts` · `*.directive.ts` · `*.service.ts` · `*.model.ts` (racine incluse : `app.component.ts`).
- **`shared/` 100 % présentationnel** : aucun service métier ni logique applicative (le `ToastService` vit dans `core/services`).
- **Toute la couche data dans `core/data-access`** (services HTTP + `query-keys.ts`).
- **Modèles découpés par domaine** (`account.model.ts`, `scheduled-post.model.ts`, `analytics.model.ts`…), jamais un fichier unique.
- **Un composant = un fichier** : les regroupements React (cards, badges, states, charts) sont splittés en un fichier par composant, avec un **barrel** de ré-export conservé au chemin d'origine pour la lisibilité des imports.
- **Templates externes `.html`** pour les composants conséquents ; inline toléré pour les petits/triviaux (`<ng-content>` wrappers, badges, breadcrumb…) — exception assumée.
- **`.css`** uniquement quand un style encapsulé existe (aucun fichier vide) — avec Tailwind, quasi aucun.
- **Alias TS** : `@core/*`, `@shared/*`, `@layout/*`, `@features/*` (+ `@/*` historique).

```
features (pages) ─► core/data-access (services + injectQuery/injectMutation) ─► Backend NestJS (/api/v1)
      │                        │
      ├─ shared (UI pur)       └─ @tanstack/angular-query (cache + invalidation)
      └─ layout (shell)
```

---

## 2. Arborescence réelle

```
zernio-angular-frontend/
├── angular.json · package.json · tsconfig*.json · .postcssrc.json · proxy.conf.json
├── src/
│   ├── index.html                    # lang="fr", <title>Zernio — Suite Meta</title>
│   ├── main.ts                       # bootstrapApplication(AppComponent, appConfig)
│   ├── styles.css                    # @import tailwindcss + tokens @theme (thème clair)
│   └── app/
│       ├── app.component.ts          # racine : <router-outlet/> + <app-toaster/>
│       ├── app.config.ts             # providers : router · HttpClient+intercepteur · provideAppQuery() · zone CD
│       ├── app.routes.ts             # shell AppLayout + 7 pages lazy (loadComponent)
│       │
│       ├── core/
│       │   ├── config/app-config.ts               # apiUrl (relatif) · demoUserId · metaReconnectUrl
│       │   ├── http/
│       │   │   └── query.provider.ts              # provideAppQuery() → provideTanStackQuery(QueryClient)
│       │   ├── interceptors/api.interceptor.ts    # baseURL + withCredentials + 401
│       │   ├── data-access/                       # couche données (services HTTP + clés de cache)
│       │   │   ├── accounts.service.ts            # GET /social/accounts
│       │   │   ├── analytics.service.ts           # GET /analytics/*
│       │   │   ├── media.service.ts               # POST /media/upload (progression)
│       │   │   ├── posts.service.ts               # GET /social/posts(/user/:id|/:id)
│       │   │   ├── publish.service.ts             # POST /social/publish
│       │   │   ├── scheduled-posts.service.ts     # POST/GET/DELETE /social/scheduled-posts (+ videoUrl)
│       │   │   ├── token.service.ts               # GET /social/meta/token-status + /social/tiktok/token-status
│       │   │   └── query-keys.ts                  # clés TanStack (tuples, dont tiktokTokenStatus)
│       │   ├── models/                            # contrats backend, un fichier par domaine
│       │   │   ├── account.model.ts · analytics.model.ts · chart.model.ts · media.model.ts
│       │   │   ├── publish.model.ts · scheduled-post.model.ts · social-post.model.ts · token.model.ts
│       │   │   └── index.ts                       # barrel de ré-export
│       │   └── services/toast.service.ts          # ToastService (singleton, logique d'état)
│       │
│       ├── shared/                                # 100 % présentationnel (aucun service métier)
│       │   ├── ui/                                # design system : button · badge · card · dialog · drawer
│       │   │                                      #   spinner · skeleton · switch · icons · overlay (*.component.ts)
│       │   ├── directives/                        # input · textarea · select (*.directive.ts)
│       │   ├── components/                        # composites : page-header · metric-card · stat-card
│       │   │   │                                  #   status-badge · scheduled-status-badge · platform-badge
│       │   │   │                                  #   platform-icon · search-bar · pagination · upload-progress
│       │   │   │                                  #   image-preview-card · confirm-dialog · label
│       │   │   │                                  #   empty-state · error-state · loading-state · skeleton-card
│       │   │   │                                  #   (barrels : cards.ts · badges.ts · states.ts)
│       │   │   └── charts/                        # bar-chart · donut-chart · hbar-chart (+ barrel charts.ts)
│       │   └── utils/                             # utils(cn) · format · metrics · upload (TS pur)
│       │
│       ├── layout/                                # shell applicatif (hors shared)
│       │   ├── app-layout.component.ts · sidebar.component.ts · topbar.component.ts
│       │   ├── breadcrumb.component.ts · toaster.component.ts · nav-items.ts
│       │
│       └── features/                              # une feature = un dossier autonome
│           ├── dashboard/dashboard-page.component.ts (+ .html)
│           ├── publication/                       # publication-page · post-composer · image-uploader
│           │                                      #   post-preview · post-composer.schema
│           ├── history/                           # history-page · post-details-drawer
│           ├── calendar/                          # calendar-page · scheduled-post-details-drawer · calendar-utils
│           ├── accounts/                          # connected-accounts-page · account-card · account-state
│           ├── analytics/analytics-page.component.ts (+ .html)
│           └── settings/settings-page.component.ts (+ .html)
```

> **Templates externes** (`templateUrl` + `.html`) pour les composants conséquents :
> `button`, `dialog`, `drawer`, `switch`, `metric-card`, `stat-card`, `empty-state`,
> `error-state`, les 3 charts, `sidebar`, `topbar`, `toaster`, `label`, et **toutes les
> pages/drawers/composer**. Les composants très courts restent inline (exception assumée).

---

## 3. Correspondance React → Angular

| React | Angular | Notes |
|-------|---------|-------|
| `react-router-dom` (`<Routes>`, `<NavLink>`) | `@angular/router` (`provideRouter`, `routerLink`, `routerLinkActive`) | Shell `AppLayout` + routes enfants lazy |
| TanStack `useQuery` / `useMutation` | **`injectQuery` / `injectMutation`** (`@tanstack/angular-query`) | Cache par clé (tuples), `isPending`/`isError`/`refetch` |
| `QueryClient.invalidateQueries` | `injectQueryClient().invalidateQueries({ queryKey })` | Après publish / programmation / annulation |
| `react-hook-form` + `zod` | **Reactive Forms** + `validateComposer()` | Validation croisée portée en fonction pure |
| `axios` instance | `HttpClient` + `api.interceptor.ts` | baseURL, `withCredentials`, 401 |
| `react-hot-toast` | `ToastService` (core) + `<app-toaster>` (layout) | Signal-list, auto-dismiss 3,5 s |
| `lucide-react` | `lucide-angular` (`<lucide-icon [img]="…">`) | Icônes renommées résolues via alias |
| Hooks `useState/useMemo/useEffect` | `signal/computed/effect` | — |
| `createPortal` (Dialog/Drawer) | overlay `position: fixed` + `installOverlayBehavior` | Échap + lock du scroll |
| `useDebounce` | `effect` + `setTimeout` (Historique) | 250 ms |
| `useMediaQuery`/`useClickOutside` | CSS responsive + backdrop cliquable | Simplifié, même comportement |
| `cn`, `format`, `metrics`, `upload`, types | **portés tels quels** (`shared/utils` + `core/models`) | Aucune divergence de contrat |

---

## 4. Couche données (`core/data-access`)

`AccountsService`, `AnalyticsService`, `MediaService`, `PostsService`, `PublishService`,
`ScheduledPostsService`, `TokenService` — tous `@Injectable({ providedIn: 'root' })`,
exposant des `Observable`, ciblant exactement les routes backend
(`/social/publish`, `/social/scheduled-posts`, `/media/upload`, `/social/posts`,
`/social/accounts`, `/social/meta/token-status`, **`/social/tiktok/token-status`**, `/analytics/*`).

Consommation via TanStack Query dans les composants :

```ts
readonly query = injectQuery(() => ({
  queryKey: queryKeys.posts(appConfig.demoUserId),
  queryFn: () => lastValueFrom(this.postsService.listByUser(appConfig.demoUserId)),
}));
// mutation + invalidation :
readonly publish = injectMutation(() => ({
  mutationFn: (p: PublishRequest) => lastValueFrom(this.publishService.publish(p)),
  onSuccess: () => this.queryClient.invalidateQueries({ queryKey: queryKeys.posts(userId) }),
}));
```

## 5. Pages

`DashboardPage`, `PublicationPage`, `HistoryPage`, `CalendarPage`, `ConnectedAccountsPage`,
`AnalyticsPage`, `SettingsPage` (routes `/`, `/publication`, `/history`, `/calendar`,
`/accounts`, `/analytics`, `/settings`).

## 6. Composants (un fichier par composant)

- **UI (`shared/ui`)** : `ButtonComponent`, `BadgeComponent`, `Card*`, `SwitchComponent`,
  `DialogComponent`, `DrawerComponent`, `SpinnerComponent`, `SkeletonComponent`.
- **Directives (`shared/directives`)** : `InputDirective`, `TextareaDirective`, `SelectDirective`.
- **Composants (`shared/components`)** : `PageHeaderComponent`, `LabelComponent`,
  `MetricCardComponent`, `StatCardComponent`, `StatusBadgeComponent`,
  `ScheduledStatusBadgeComponent`, `PlatformBadgeComponent`, `PlatformIconComponent`,
  `SearchBarComponent`, `PaginationComponent`, `UploadProgressComponent`,
  `ImagePreviewCardComponent`, `ConfirmDialogComponent`,
  `EmptyStateComponent`, `ErrorStateComponent`, `LoadingStateComponent`, `SkeletonCardComponent`.
- **Charts (`shared/components/charts`)** : `BarChartComponent`, `DonutChartComponent`, `HBarChartComponent`.
- **Layout (`layout`)** : `AppLayoutComponent`, `SidebarComponent`, `TopbarComponent`,
  `BreadcrumbComponent`, `ToasterComponent`.
- **Features** : `PostComposerComponent`, `ImageUploaderComponent`, `PostPreviewComponent`,
  `PostDetailsDrawerComponent`, `ScheduledPostDetailsDrawerComponent`, `AccountCardComponent`.

---

## 7. Commandes d'installation

```bash
cd zernio-angular-frontend
npm install            # inclut lucide-angular + @tanstack/angular-query-experimental
npm start              # = ng serve  → http://localhost:4200 (proxy /api/v1 → :3000)
npm run build          # build de production (AOT + budgets) → dist/
```

> Dépendances ajoutées au scaffold Angular : `lucide-angular`,
> `@tanstack/angular-query-experimental`. Tailwind v4 est configuré par le CLI
> (`--style=tailwind`, `.postcssrc.json`).

### Proxy de dev & CORS (backend non modifié)

Le backend n'autorise que l'origine `FRONTEND_URL` (défaut `http://localhost:5173`,
le front React). Pour éviter tout blocage CORS **sans toucher au backend**, la base
API est **relative** (`/api/v1`) et `ng serve` utilise un **proxy** (`proxy.conf.json`)
qui redirige `/api/v1` et `/uploads` vers `http://localhost:3000` côté serveur :
le navigateur ne fait que des requêtes same-origin (`localhost:4200`). Aucune
configuration backend n'est requise ; démarrer simplement le backend sur `:3000`.

### Configuration (optionnelle)

Valeurs par défaut identiques au front React (backend local) :

| Variable | Défaut | Rôle |
|----------|--------|------|
| `apiUrl` | `/api/v1` (relatif → proxy dev vers `:3000`) | Base de l'API backend |
| `demoUserId` | `00000000-0000-0000-0000-000000000001` | Utilisateur stand-in (tant que pas de JWT) |

Surcharge runtime possible sans rebuild en exposant `window.__zernioEnv = { VITE_API_URL, VITE_DEMO_USER_ID }`
avant le chargement du bundle (voir `core/config/app-config.ts`).

---

## 8. Historique de la migration (par phases, compilable à chaque étape)

1. **Scaffold** Angular 21 (`ng new … --style=tailwind --routing`) + `lucide-angular`. ✅
2. **Portage initial** : socle Tailwind, intercepteur HTTP, services, design system, layout, 7 pages (fonctionnel de bout en bout). ✅
3. **Phase 0** — installation de `@tanstack/angular-query-experimental` + `provideAppQuery()`. ✅
4. **Phase 1** — fondations feature-first : `core/models` (par domaine), `shared/utils`, `core/data-access`, `core/interceptors`, alias TS. ✅
5. **Phase 2** — bascule complète vers TanStack (`injectQuery`/`injectMutation`), suppression de la couche « query » maison. ✅
6. **Phase 3** — structure finale : `layout/` sorti de `shared/`, `shared/` rendu 100 % présentationnel, `ToastService`→`core/services`, directives isolées, nommage `*.component.ts`, split un composant/fichier, templates externes des composants conséquents. ✅
7. **À venir** : conversion optionnelle des formatages en pipes (`shared/pipes`), tests e2e, bascule du déploiement de `zernio-frontend` vers `zernio-angular-frontend`, puis retrait de l'ancien front.

---

## 9. Checklist de validation

- [x] Backend NestJS inchangé ; aucune route `/api/v1` modifiée.
- [x] Architecture **feature-first hybride** (`core` / `shared` / `layout` / `features`).
- [x] `shared/` **100 % présentationnel** (services/logique déplacés dans `core`).
- [x] Couche données dans **`core/data-access`** ; modèles **par domaine** (`*.model.ts`).
- [x] **@tanstack/angular-query** partout ; couche maison supprimée.
- [x] Conventions de nommage Angular (`*.component.ts`/`*.directive.ts`/`*.service.ts`/`*.model.ts`).
- [x] **Un composant = un fichier** (cards/badges/states/charts splittés + barrels).
- [x] Templates externes `.html` pour les gros composants ; inline pour les petits.
- [x] 7 pages recréées avec parité fonctionnelle ; toutes les APIs branchées.
- [x] Publication immédiate **et** programmée ; upload validé + progression ; calendrier + annulation ; historique (recherche debouncée, filtre, pagination, drawer) ; comptes + reconnexion OAuth ; analytics (KPI + 4 graphiques).
- [x] Thème clair conservé, ergonomie SaaS (sidebar 260px, topbar, breadcrumb) ; toasts succès/erreur.
- [x] **Intégration TikTok** (composer vidéo, upload vidéo, compte, badges/icônes, historique, calendrier, analytics) — voir §10.
- [x] **Front React non modifié** pour TikTok (gelé).
- [x] `ng build` **dev** et **prod** (AOT + budgets) : **0 erreur / 0 warning** (y compris après TikTok).
- [x] `ng serve` démarre et sert l'application (proxy → pas de CORS, backend non modifié).
- [ ] Backend lancé en parallèle pour un test bout-en-bout réel (hors périmètre).
- [ ] Test TikTok réel (credentials + audit app côté backend — voir `PROJECT_STATUS.md` §10).

---

## 10. Intégration TikTok (Angular uniquement)

> Ajout de TikTok au frontend **Angular** exclusivement. Le **front React n'est pas touché**.
> Aucun nouvel endpoint backend : réutilisation des routes existantes (OAuth, publication, token,
> scheduled, analytics, media). `ng build` **dev + prod verts**. Contrainte respectée : **architecture
> feature-first** (data/models dans `core/`, présentation dans `shared/`, logique de page dans `features/`).

### Modèles (`core/models`)
- `publish.model.ts` : `PublishPlatform` += `tiktok` ; `PublishRequest` += `videoUrl?`.
- `account.model.ts` : `AccountPlatform` += `tiktok`.
- `scheduled-post.model.ts` : `ScheduledPlatform` += `TIKTOK` ; `ScheduledPost` + `CreateScheduledPostRequest` += `videoUrl`.
- `social-post.model.ts` : `PostPlatform` += `TIKTOK`.
- `media.model.ts` : `UploadResponse` += `mediaType` (`'image' | 'video'`).
- `token.model.ts` : nouveau **`TikTokTokenStatus`** (compte unique, ≠ Meta FB+IG).

### Couche données & config
- `token.service.ts` : **`getTikTokStatus()`** → `GET /social/tiktok/token-status`.
- `query-keys.ts` : clé **`tiktokTokenStatus`**.
- `core/config/app-config.ts` : **`tiktokConnectUrl(userId)`** (démarre l'OAuth TikTok, pendant de `metaReconnectUrl`).
- `publish.service.ts` / `scheduled-posts.service.ts` : inchangés (les payloads portent `videoUrl`).

### Design system partagé (`shared/`)
- **`platform-icon.component.ts`** : 3 réseaux via `@switch` (glyphe **TikTok** SVG inline, comme FB/IG).
- **`platform-badge.component.ts`** : libellés + accent d'icône par plateforme (maps `facebook`/`instagram`/`tiktok`).
- **`image-preview-card.component.ts`** : input `isVideo` → aperçu `<video>` au lieu de `<img>`.
- **`shared/utils/upload.ts`** : généralisé image **+ vidéo** — `validateMediaFile(file, kind)`,
  `acceptAttrFor(kind)`, `ALLOWED_VIDEO_TYPES` (MP4/MOV/WEBM), `MAX_VIDEO_BYTES` (100 Mo).
- **`shared/utils/metrics.ts`** : `chartColors.tiktok` (`#0f172a`).

### Feature Publication (`features/publication`)
- **`image-uploader.component`** : nouvel input **`kind: 'image' | 'video'`** — `accept`, validation, copie
  et aperçu pilotés par `kind` (composant média réutilisable, monté 2× dans le composer).
- **`post-composer.schema.ts`** : `ComposerValues` += `tiktok` + `videoUrl` ; **validation `videoUrl`
  obligatoire si TikTok** (symétrique d'`imageUrl` pour Instagram) ; « au moins une plateforme » inclut TikTok.
- **`post-composer.component`** : contrôles `tiktok`/`videoUrl`, bascule TikTok, uploader **image** si FB/IG
  et uploader **vidéo** si TikTok (états d'upload distincts agrégés), `videoUrl` transmis en immédiat **et** programmé.
- **`post-preview.component`** : inputs `tiktok`/`videoUrl`, `<video>` en aperçu, audience 3 réseaux.

### Feature Comptes connectés (`features/accounts`)
- **`account-card.component`** : `platform` élargi à `tiktok` (libellé + fond d'icône dédiés).
- **`connected-accounts-page`** : carte **TikTok** + `injectQuery` sur `getTikTokStatus()`, dialogue de
  (re)connexion **dynamique** (redirige vers `tiktokConnectUrl` pour TikTok, `metaReconnectUrl` sinon).

### Historique · Calendrier · Analytics
- **Historique** : `PlatformFilter` += `tiktok` (+ `<option>`), badge TikTok via le composant partagé.
- **Calendrier** : badge TikTok (composant partagé) + lien **« Ouvrir la vidéo »** dans le drawer (`videoUrl`).
- **Analytics** : `platformSeries` piloté par des maps libellé/couleur (FB/IG/**TikTok**), plus de ternaire FB/IG en dur.

### Piège rencontré (Angular)
Insérer un `const`/`type` **entre le décorateur `@Component` et la classe** casse la liaison décorateur↔classe
(erreurs « Unsupported call to input.required »). ➜ Toujours déclarer ces constantes **avant** `@Component`.
