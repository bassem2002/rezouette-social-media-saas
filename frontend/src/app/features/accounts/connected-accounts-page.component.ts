import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { ErrorStateComponent, SkeletonCardComponent } from '@shared/components/states';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog.component';
import { DialogComponent } from '@/shared/ui/dialog.component';
import { ButtonComponent } from '@/shared/ui/button.component';
import { SelectDirective } from '@shared/directives/select.directive';
import { PlatformIconComponent } from '@shared/components/platform-icon.component';
import { LucideAngularModule, ChevronDown, Plus } from '@/shared/ui/icons';
import { ConnectionCardComponent } from './connection-card.component';
import { AccountsService } from '@core/data-access/accounts.service';
import { TokenService } from '@core/data-access/token.service';
import { ActivatedRoute, Router } from '@angular/router';
import {
  injectQuery,
  injectQueryClient,
} from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';
import { ToastService } from '@core/services/toast.service';
import { parseOAuthCallback } from './oauth-callback-result';
import { queryKeys } from '@core/data-access/query-keys';
import {
  appConfig,
  metaReconnectUrl,
  tiktokConnectUrl,
  linkedinConnectUrl,
  youtubeConnectUrl,
} from '@/core/config/app-config';
import { brand } from '@/core/config/brand.config';
import {
  COMING_SOON_MESSAGE,
  demoProfiles,
} from '@/core/config/frontend-demo.config';
import type { HttpErrorResponse } from '@angular/common/http';
import { YouTubeService } from '@core/data-access/youtube.service';
import type {
  AccountPlatform,
  ConnectedAccount,
  TokenStatus,
  YouTubeAccount,
  YouTubeTokenStatusAccount,
} from '@core/models';
import { deriveAccountState, type AccountDisplayState } from './account-state';
import {
  PLATFORM_FILTERS,
  PLATFORM_LABELS,
  STATUS_FILTERS,
  type ConnectionView,
} from './connection-view';

/// Vue d'une chaîne YouTube : croise le compte persisté et le statut de son
/// token. Préparée ICI (et non dans la carte, qui reste générique).
export interface YouTubeChannelView {
  id: string;
  name: string;
  subtitle: string;
  status: TokenStatus | null;
  expiresAt: string | null;
  createdAt: string | null;
  needsReconnect: boolean;
  warning: string;
}

/// Compteur d'abonnés/vidéos en ligne secondaire. `hiddenSubscriberCount`
/// signifie que la chaîne masque volontairement son audience : on ne l'invente
/// pas, on ne l'affiche simplement pas.
function channelSubtitle(account: YouTubeAccount): string {
  const parts: string[] = [];
  const metadata = account.metadata;
  if (metadata?.subscriberCount && !metadata.hiddenSubscriberCount) {
    parts.push(`${metadata.subscriberCount} abonné(s)`);
  }
  if (metadata?.videoCount) parts.push(`${metadata.videoCount} vidéo(s)`);
  if (metadata?.customUrl) parts.push(metadata.customUrl);
  return parts.join(' · ');
}

/// Identifiant public affiché en ligne secondaire, UNIQUEMENT s'il existe
/// réellement dans les métadonnées du compte. Aucun handle n'est fabriqué.
function accountHandle(account: ConnectedAccount | undefined): string | null {
  const username = account?.metadata?.['username'];
  return typeof username === 'string' && username ? `@${username}` : null;
}

@Component({
  selector: 'app-connected-accounts-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    ErrorStateComponent,
    SkeletonCardComponent,
    ConfirmDialogComponent,
    ConnectionCardComponent,
    DialogComponent,
    ButtonComponent,
    SelectDirective,
    PlatformIconComponent,
    LucideAngularModule,
  ],
  templateUrl: './connected-accounts-page.component.html',
})
export class ConnectedAccountsPage {
  private readonly accountsService = inject(AccountsService);
  private readonly tokenService = inject(TokenService);
  private readonly youtubeService = inject(YouTubeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly queryClient = injectQueryClient();

  constructor() {
    this.handleOAuthCallback();
  }

  /// Traite le retour d'un flux OAuth (backend → /accounts?oauthProvider=…,
  /// redirigé vers /connections en conservant les paramètres).
  ///
  /// Les paramètres sont validés contre des listes fermées, le message provient
  /// d'une table locale, puis l'URL est nettoyée en `replaceUrl` — sans quoi un
  /// rechargement rejouerait la notification.
  private handleOAuthCallback(): void {
    const result = parseOAuthCallback(this.route.snapshot.queryParamMap);
    if (!result) return;

    if (result.status === 'success') {
      this.toast.success(result.message);
      // Les comptes viennent de changer : on invalide les lectures du provider.
      this.queryClient.invalidateQueries({
        queryKey: queryKeys.accounts(appConfig.demoUserId),
      });
      if (result.provider === 'youtube') {
        this.queryClient.invalidateQueries({
          queryKey: queryKeys.youtube.all(appConfig.demoUserId),
        });
      } else if (result.provider === 'linkedin') {
        this.queryClient.invalidateQueries({
          queryKey: queryKeys.linkedinTokenStatus(appConfig.demoUserId),
        });
      } else {
        this.queryClient.invalidateQueries({
          queryKey: queryKeys.tiktokTokenStatus(appConfig.demoUserId),
        });
      }
    } else {
      this.toast.error(result.message);
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true,
    });
  }

  protected readonly accountsQuery = injectQuery(() => ({
    queryKey: queryKeys.accounts(appConfig.demoUserId),
    queryFn: () =>
      lastValueFrom(this.accountsService.list(appConfig.demoUserId)),
  }));
  private readonly tokenQuery = injectQuery(() => ({
    queryKey: queryKeys.tokenStatus(appConfig.demoUserId),
    queryFn: () =>
      lastValueFrom(this.tokenService.getStatus(appConfig.demoUserId)),
    retry: false,
  }));
  private readonly tiktokTokenQuery = injectQuery(() => ({
    queryKey: queryKeys.tiktokTokenStatus(appConfig.demoUserId),
    queryFn: () =>
      lastValueFrom(this.tokenService.getTikTokStatus(appConfig.demoUserId)),
    retry: false,
  }));
  private readonly linkedinTokenQuery = injectQuery(() => ({
    queryKey: queryKeys.linkedinTokenStatus(appConfig.demoUserId),
    queryFn: () =>
      lastValueFrom(this.tokenService.getLinkedInStatus(appConfig.demoUserId)),
    retry: false,
  }));

  // YouTube est MULTI-CHAÎNES : deux requêtes distinctes, croisées ensuite.
  // `retry: false` pour qu'un 503 (intégration non configurée) soit connu
  // immédiatement au lieu d'entretenir un spinner.
  protected readonly youtubeAccountsQuery = injectQuery(() => ({
    queryKey: queryKeys.youtube.accounts(appConfig.demoUserId),
    queryFn: () =>
      lastValueFrom(this.youtubeService.getAccounts(appConfig.demoUserId)),
    retry: false,
  }));
  private readonly youtubeStatusQuery = injectQuery(() => ({
    queryKey: queryKeys.youtube.tokenStatus(appConfig.demoUserId),
    queryFn: () =>
      lastValueFrom(this.youtubeService.getTokenStatus(appConfig.demoUserId)),
    retry: false,
  }));

  protected readonly pending = signal<AccountPlatform | null>(null);
  /// Empêche le double-clic et l'ouverture de deux fenêtres OAuth.
  protected readonly redirecting = signal(false);
  /// Sélecteur de plateforme du bouton « New Connection ».
  protected readonly chooserOpen = signal(false);

  protected readonly PlusIcon = Plus;
  protected readonly ChevronDownIcon = ChevronDown;
  protected readonly platformFilters = PLATFORM_FILTERS;
  protected readonly statusFilters = STATUS_FILTERS;
  protected readonly platformLabels = PLATFORM_LABELS;
  protected readonly profiles = demoProfiles;

  // ── Filtres (locaux : aucun n'est transmis au backend) ────────────────────
  protected readonly profileFilter = signal<string>('all');
  protected readonly platformFilter = signal<'all' | AccountPlatform>('all');
  protected readonly statusFilter = signal<'all' | AccountDisplayState>('all');

  private readonly accounts = computed(() => this.accountsQuery.data() ?? []);
  private readonly token = computed(() => this.tokenQuery.data() ?? null);
  private readonly tiktokToken = computed(
    () => this.tiktokTokenQuery.data() ?? null,
  );
  private readonly linkedinToken = computed(
    () => this.linkedinTokenQuery.data() ?? null,
  );

  private accountFor(platform: AccountPlatform): ConnectedAccount | undefined {
    return this.accounts().find((a) => a.platform === platform);
  }

  /// LinkedIn non configuré côté backend : le token-status renvoie 503. On
  /// désactive alors l'action (plutôt que de rediriger vers une 503). Un 404
  /// (connecté mais aucun compte lié) N'est PAS une absence de configuration.
  private readonly linkedinNotConfigured = computed(() => {
    const error = this.linkedinTokenQuery.error() as HttpErrorResponse | null;
    return error?.status === 503;
  });

  /// 503 = intégration YouTube absente du serveur. Un tableau vide, lui, est un
  /// état NORMAL (« aucune chaîne connectée »), pas une erreur.
  protected readonly youtubeNotConfigured = computed(
    () =>
      (this.youtubeAccountsQuery.error() as HttpErrorResponse | null)?.status ===
      503,
  );
  protected readonly youtubeLoading = computed(
    () =>
      this.youtubeAccountsQuery.isLoading() || this.youtubeStatusQuery.isLoading(),
  );
  /// Erreur réelle : ni un 503 (état connu), ni un tableau vide.
  protected readonly youtubeFailed = computed(
    () => this.youtubeAccountsQuery.isError() && !this.youtubeNotConfigured(),
  );

  /// Croise comptes et statuts. Le statut peut manquer (requête en erreur) :
  /// on affiche alors la chaîne sans état de token plutôt que rien.
  protected readonly youtubeChannels = computed<YouTubeChannelView[]>(() => {
    const accounts = this.youtubeAccountsQuery.data() ?? [];
    const statuses = new Map(
      (this.youtubeStatusQuery.data()?.accounts ?? []).map(
        (status: YouTubeTokenStatusAccount) => [status.accountId, status],
      ),
    );
    return accounts.map((account) => {
      const status = statuses.get(account.id);
      const needsReconnect = status?.needsReconnect ?? account.needsReconnect;
      return {
        id: account.id,
        name: account.accountName,
        subtitle: channelSubtitle(account),
        status: status?.status ?? null,
        expiresAt: status?.expiresAt ?? account.tokenExpiresAt,
        // `GET /social/youtube/accounts` n'expose pas de date de connexion :
        // la carte n'en affichera donc aucune plutôt qu'une date approchée.
        createdAt: null,
        needsReconnect,
        // Sans refresh token, l'access token (~1 h) ne pourra pas être
        // renouvelé : la publication différée échouera à terme.
        warning:
          status && !status.hasRefreshToken
            ? 'Aucune autorisation durable : reconnectez cette chaîne pour publier de façon fiable.'
            : '',
      };
    });
  });

  /// Liste UNIFIÉE des connexions, toutes plateformes confondues. C'est elle
  /// qui alimente la grille : les cinq réseaux passent par le même composant.
  private readonly allConnections = computed<ConnectionView[]>(() => {
    const views: ConnectionView[] = [];

    const meta: { platform: AccountPlatform; token: TokenStatus | null }[] = [
      { platform: 'facebook', token: this.token()?.facebook ?? null },
      { platform: 'instagram', token: this.token()?.instagram ?? null },
    ];
    for (const { platform, token } of meta) {
      const account = this.accountFor(platform);
      views.push(
        this.buildView(platform, account, token, {
          expiresAt: account?.tokenExpiresAt ?? this.token()?.expiresAt ?? null,
        }),
      );
    }

    const tiktok = this.accountFor('tiktok');
    views.push(
      this.buildView('tiktok', tiktok, this.tiktokToken()?.status ?? null, {
        expiresAt: tiktok?.tokenExpiresAt ?? this.tiktokToken()?.expiresAt ?? null,
      }),
    );

    const linkedin = this.accountFor('linkedin');
    views.push(
      this.buildView('linkedin', linkedin, this.linkedinToken()?.status ?? null, {
        expiresAt:
          linkedin?.tokenExpiresAt ?? this.linkedinToken()?.expiresAt ?? null,
        disabled: this.linkedinNotConfigured(),
        disabledHint: this.linkedinNotConfigured()
          ? 'Intégration LinkedIn non configurée côté serveur.'
          : null,
      }),
    );

    // YouTube : 0, 1 ou N chaînes pour un même compte Google.
    if (this.youtubeNotConfigured()) {
      views.push(
        this.buildView('youtube', undefined, null, {
          disabled: true,
          disabledHint: `YouTube n’est pas encore configuré sur ce serveur.`,
        }),
      );
    } else if (this.youtubeChannels().length === 0) {
      views.push(this.buildView('youtube', undefined, null, {}));
    } else {
      for (const channel of this.youtubeChannels()) {
        views.push({
          key: `youtube:${channel.id}`,
          platform: 'youtube',
          state: deriveAccountState(
            channel.needsReconnect ? 'RECONNECT_REQUIRED' : channel.status,
            true,
          ),
          connected: true,
          name: channel.name,
          handle: channel.subtitle || null,
          connectedAt: channel.createdAt,
          expiresAt: channel.expiresAt,
          warning: channel.warning || null,
          disabled: false,
          disabledHint: null,
        });
      }
    }

    return views;
  });

  /// Construit la vue d'un réseau à compte unique.
  private buildView(
    platform: AccountPlatform,
    account: ConnectedAccount | undefined,
    token: TokenStatus | null,
    extra: {
      expiresAt?: string | null;
      disabled?: boolean;
      disabledHint?: string | null;
    },
  ): ConnectionView {
    return {
      key: platform,
      platform,
      state: deriveAccountState(token, Boolean(account), account?.status ?? null),
      connected: Boolean(account),
      name: account?.accountName ?? null,
      handle: accountHandle(account),
      connectedAt: account?.createdAt ?? null,
      expiresAt: extra.expiresAt ?? null,
      warning: null,
      disabled: extra.disabled ?? false,
      disabledHint: extra.disabledHint ?? null,
    };
  }

  /// Filtrage 100 % local — aucun de ces critères n'est envoyé au backend, qui
  /// ne les connaît pas.
  protected readonly connections = computed(() => {
    const platform = this.platformFilter();
    const status = this.statusFilter();
    return this.allConnections().filter(
      (view) =>
        (platform === 'all' || view.platform === platform) &&
        (status === 'all' || view.state === status),
    );
  });

  protected readonly hasResults = computed(() => this.connections().length > 0);

  protected readonly isLoading = computed(
    () => this.accountsQuery.isLoading() || this.youtubeLoading(),
  );

  /// Texte du dialogue de (re)connexion, adapté au réseau ciblé.
  protected readonly dialogCopy = computed(() => {
    switch (this.pending()) {
      case 'tiktok':
        return {
          title: 'Connecter TikTok ?',
          description: `Vous allez être redirigé vers TikTok pour autoriser l’accès. Vous reviendrez ensuite sur ${brand.name}.`,
          confirmLabel: 'Continuer vers TikTok',
        };
      case 'linkedin':
        return {
          title: 'Connecter LinkedIn ?',
          description: `Vous allez être redirigé vers LinkedIn pour autoriser l’accès (profil membre). Vous reviendrez ensuite sur ${brand.name}.`,
          confirmLabel: 'Continuer vers LinkedIn',
        };
      case 'youtube':
        return {
          title: 'Connecter YouTube ?',
          description: `Vous allez être redirigé vers Google pour autoriser l’accès à vos chaînes YouTube. Le consentement porte sur le compte Google entier : toutes ses chaînes seront réautorisées, pas seulement celle-ci. Vous reviendrez ensuite sur ${brand.name}.`,
          confirmLabel: 'Continuer vers Google',
        };
      default:
        return {
          title: 'Reconnecter ce compte ?',
          description: `Vous allez être redirigé vers Facebook pour réautoriser l’accès. Vous reviendrez ensuite sur ${brand.name}.`,
          confirmLabel: 'Continuer vers Facebook',
        };
    }
  });

  protected choosePlatform(platform: AccountPlatform): void {
    this.chooserOpen.set(false);
    this.pending.set(platform);
  }

  /// « New Profile » et le sélecteur de profils sont des maquettes : aucune
  /// notion de profil n'existe côté serveur.
  protected notifyComingSoon(): void {
    this.toast.info(COMING_SOON_MESSAGE);
  }

  protected resetFilters(): void {
    this.platformFilter.set('all');
    this.statusFilter.set('all');
  }

  protected onPlatformFilter(value: string): void {
    this.platformFilter.set(value as 'all' | AccountPlatform);
  }

  protected onStatusFilter(value: string): void {
    this.statusFilter.set(value as 'all' | AccountDisplayState);
  }

  protected confirmReconnect(): void {
    const userId = appConfig.demoUserId;
    // Sans utilisateur, aucune redirection : l'endpoint répondrait 400.
    if (!userId || this.redirecting()) return;

    let url: string;
    switch (this.pending()) {
      case 'tiktok':
        url = tiktokConnectUrl(userId);
        break;
      case 'linkedin':
        url = linkedinConnectUrl(userId);
        break;
      case 'youtube':
        url = youtubeConnectUrl(userId);
        break;
      default:
        url = metaReconnectUrl(userId);
    }
    // Navigation COMPLÈTE : le backend répond par une redirection vers le
    // fournisseur, qu'un XHR ne saurait pas suivre.
    this.redirecting.set(true);
    window.location.assign(url);
  }
}
