import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  CardComponent,
  CardHeaderComponent,
  CardTitleComponent,
  CardContentComponent,
} from '@/shared/ui/card.component';
import { LabelComponent } from '@shared/components/label.component';
import { TextareaDirective } from '@shared/directives/textarea.directive';
import { InputDirective } from '@shared/directives/input.directive';
import { ButtonComponent } from '@/shared/ui/button.component';
import { PlatformIconComponent } from '@shared/components/platform-icon.component';
import { PlatformBadgeComponent } from '@shared/components/badges';
import { PostPreviewComponent } from './post-preview.component';
import { ImageUploaderComponent } from './image-uploader.component';
import { YouTubeOptionsComponent } from './youtube-options.component';
import type { YouTubeChannelChoice } from './youtube-channel-choice';
import { ToastService } from '@core/services/toast.service';
import { cn } from '@shared/utils/utils';
import { appConfig } from '@/core/config/app-config';
import {
  injectMutation,
  injectQuery,
  injectQueryClient,
} from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';
import type { HttpErrorResponse } from '@angular/common/http';
import { queryKeys } from '@core/data-access/query-keys';
import { PublishService } from '@core/data-access/publish.service';
import { ScheduledPostsService } from '@core/data-access/scheduled-posts.service';
import { TokenService } from '@core/data-access/token.service';
import { YouTubeService } from '@core/data-access/youtube.service';
import {
  LucideAngularModule,
  CalendarClock,
  CheckCircle2,
  Send,
  XCircle,
  Zap,
} from '@/shared/ui/icons';
import type {
  PublishPlatform,
  PublishPlatformResult,
  PublishRequest,
  CreateScheduledPostRequest,
  YouTubeAccount,
  YouTubePublishOptions,
  YouTubeTokenStatusAccount,
} from '@core/models';
import {
  CAPTION_MAX,
  MESSAGE_MAX,
  composerDefaults,
  parseYouTubeTags,
  validateComposer,
  type ComposerErrors,
  type ComposerValues,
} from './post-composer.schema';

type PublishMode = 'now' | 'schedule';

/// Convertit une Date en valeur d'<input type="datetime-local"> locale.
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/// Composer moderne : sélection plateformes, texte, image (URL publique),
/// compteurs, prévisualisation live, publication immédiate ou programmée.
@Component({
  selector: 'app-post-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    CardComponent,
    CardHeaderComponent,
    CardTitleComponent,
    CardContentComponent,
    LabelComponent,
    TextareaDirective,
    InputDirective,
    ButtonComponent,
    PlatformIconComponent,
    PlatformBadgeComponent,
    PostPreviewComponent,
    ImageUploaderComponent,
    YouTubeOptionsComponent,
    LucideAngularModule,
  ],
  templateUrl: './post-composer.component.html',
})
export class PostComposerComponent {
  private readonly toast = inject(ToastService);
  private readonly queryClient = injectQueryClient();
  private readonly publishService = inject(PublishService);
  private readonly scheduledService = inject(ScheduledPostsService);
  private readonly youtubeService = inject(YouTubeService);
  private readonly tokenService = inject(TokenService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly MESSAGE_MAX = MESSAGE_MAX;
  protected readonly CAPTION_MAX = CAPTION_MAX;
  protected readonly CheckIcon = CheckCircle2;
  protected readonly XIcon = XCircle;
  protected readonly SendIcon = Send;
  protected readonly ZapIcon = Zap;
  protected readonly CalendarClockIcon = CalendarClock;
  protected readonly minScheduledAt = toDatetimeLocalValue(
    new Date(Date.now() + 60_000),
  );

  protected readonly form = new FormGroup({
    facebook: new FormControl(composerDefaults.facebook, { nonNullable: true }),
    instagram: new FormControl(composerDefaults.instagram, { nonNullable: true }),
    tiktok: new FormControl(composerDefaults.tiktok, { nonNullable: true }),
    linkedin: new FormControl(composerDefaults.linkedin, { nonNullable: true }),
    youtube: new FormControl(composerDefaults.youtube, { nonNullable: true }),
    message: new FormControl(composerDefaults.message, { nonNullable: true }),
    caption: new FormControl(composerDefaults.caption, { nonNullable: true }),
    imageUrl: new FormControl(composerDefaults.imageUrl, { nonNullable: true }),
    videoUrl: new FormControl(composerDefaults.videoUrl, { nonNullable: true }),
    linkUrl: new FormControl(composerDefaults.linkUrl, { nonNullable: true }),
    youtubeAccountId: new FormControl(composerDefaults.youtubeAccountId, {
      nonNullable: true,
    }),
    youtubeTitle: new FormControl(composerDefaults.youtubeTitle, {
      nonNullable: true,
    }),
    youtubeDescription: new FormControl(composerDefaults.youtubeDescription, {
      nonNullable: true,
    }),
    youtubeTags: new FormControl(composerDefaults.youtubeTags, {
      nonNullable: true,
    }),
    youtubeCategoryId: new FormControl(composerDefaults.youtubeCategoryId, {
      nonNullable: true,
    }),
    youtubePrivacyStatus: new FormControl(composerDefaults.youtubePrivacyStatus, {
      nonNullable: true,
    }),
    // NULLABLE à dessein : `null` = déclaration COPPA non posée. Un contrôle
    // `nonNullable` avec `false` transformerait l'absence de réponse en « non ».
    youtubeMadeForKids: new FormControl<boolean | null>(
      composerDefaults.youtubeMadeForKids,
    ),
    youtubeContainsSyntheticMedia: new FormControl(
      composerDefaults.youtubeContainsSyntheticMedia,
      { nonNullable: true },
    ),
    youtubeNotifySubscribers: new FormControl(
      composerDefaults.youtubeNotifySubscribers,
      { nonNullable: true },
    ),
  });

  /// Disponibilité LinkedIn : le token-status renvoie 503 (non configuré),
  /// 404 (configuré mais aucun compte connecté) ou 200 (compte connecté). On ne
  /// peut cibler LinkedIn que lorsqu'un compte est réellement connecté.
  private readonly linkedinStatusQuery = injectQuery(() => ({
    queryKey: queryKeys.linkedinTokenStatus(appConfig.demoUserId),
    queryFn: () =>
      lastValueFrom(this.tokenService.getLinkedInStatus(appConfig.demoUserId)),
    retry: false,
  }));
  protected readonly linkedinConnected = computed(
    () => this.linkedinStatusQuery.data() != null,
  );
  protected readonly linkedinNotConfigured = computed(
    () =>
      (this.linkedinStatusQuery.error() as HttpErrorResponse | null)?.status ===
      503,
  );
  /// Cible LinkedIn désactivable tant qu'aucun compte n'est connecté.
  // ── YouTube ───────────────────────────────────────────────────────────────
  // Deux lectures passives : les chaînes et l'état de leurs tokens.
  private readonly youtubeAccountsQuery = injectQuery(() => ({
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

  protected readonly youtubeNotConfigured = computed(
    () =>
      (this.youtubeAccountsQuery.error() as HttpErrorResponse | null)?.status ===
      503,
  );
  protected readonly youtubeLoading = computed(() =>
    this.youtubeAccountsQuery.isLoading(),
  );

  /// Chaînes proposées. Une chaîne à reconnecter est listée mais NON
  /// sélectionnable ; une chaîne au token expiré reste utilisable (le backend
  /// le renouvellera au moment de publier).
  protected readonly youtubeChannels = computed<YouTubeChannelChoice[]>(() => {
    const accounts: YouTubeAccount[] = this.youtubeAccountsQuery.data() ?? [];
    const statuses = new Map(
      (this.youtubeStatusQuery.data()?.accounts ?? []).map(
        (status: YouTubeTokenStatusAccount) => [status.accountId, status],
      ),
    );
    return accounts.map((account) => {
      const status = statuses.get(account.id);
      const needsReconnect = status?.needsReconnect ?? account.needsReconnect;
      const parts: string[] = [];
      if (
        account.metadata?.subscriberCount &&
        !account.metadata.hiddenSubscriberCount
      ) {
        parts.push(`${account.metadata.subscriberCount} abonné(s)`);
      }
      if (account.metadata?.videoCount) {
        parts.push(`${account.metadata.videoCount} vidéo(s)`);
      }
      return {
        id: account.id,
        name: account.accountName,
        subtitle: parts.join(' · '),
        status: status?.status ?? null,
        disabled: needsReconnect,
        warning:
          status && !status.hasRefreshToken
            ? 'Cette chaîne n’a pas d’autorisation durable : la publication pourrait échouer.'
            : '',
      };
    });
  });

  private readonly youtubeSelectable = computed(() =>
    this.youtubeChannels().filter((channel) => !channel.disabled),
  );
  /// YouTube est sélectionnable dès qu'une chaîne utilisable existe.
  protected readonly youtubeDisabled = computed(
    () => this.youtubeSelectable().length === 0,
  );
  protected readonly youtubeHint = computed(() => {
    if (this.youtubeNotConfigured())
      return 'YouTube n’est pas configuré sur ce serveur.';
    if (this.youtubeLoading()) return 'Chargement des chaînes YouTube…';
    if (this.youtubeChannels().length === 0)
      return 'Connectez au moins une chaîne YouTube (page Comptes).';
    if (this.youtubeSelectable().length === 0)
      return 'Reconnectez votre chaîne YouTube pour pouvoir publier.';
    return '';
  });

  /// Tags normalisés pour l'aperçu — mêmes règles qu'à l'envoi.
  protected readonly previewYouTubeTags = computed(() =>
    parseYouTubeTags(this.values().youtubeTags),
  );

  protected readonly linkedinDisabled = computed(() => !this.linkedinConnected());
  protected readonly linkedinHint = computed(() => {
    if (this.linkedinNotConfigured())
      return 'Intégration LinkedIn non configurée côté serveur.';
    if (!this.linkedinConnected())
      return 'Connectez un compte LinkedIn (page Comptes) pour publier.';
    return '';
  });

  private readonly formTick = signal(0);
  protected readonly values = computed<ComposerValues>(() => {
    this.formTick();
    return this.form.getRawValue();
  });

  protected readonly errors = signal<ComposerErrors>({});
  protected readonly mode = signal<PublishMode>('now');
  protected readonly scheduledAt = signal('');
  protected readonly scheduledError = signal<string | null>(null);
  protected readonly results = signal<PublishPlatformResult[] | null>(null);
  // Deux sources d'upload indépendantes (image Meta / vidéo TikTok) → l'état
  // "en cours" agrégé désactive le bouton d'envoi tant qu'un transfert tourne.
  protected readonly imageUploading = signal(false);
  protected readonly videoUploading = signal(false);
  protected readonly uploading = computed(
    () => this.imageUploading() || this.videoUploading(),
  );

  private readonly publish = injectMutation(() => ({
    mutationFn: (payload: PublishRequest) =>
      lastValueFrom(this.publishService.publish(payload)),
    onSuccess: () =>
      this.queryClient.invalidateQueries({
        queryKey: queryKeys.posts(appConfig.demoUserId),
      }),
  }));

  private readonly createScheduled = injectMutation(() => ({
    mutationFn: (payload: CreateScheduledPostRequest) =>
      lastValueFrom(this.scheduledService.create(payload)),
    onSuccess: () =>
      this.queryClient.invalidateQueries({
        queryKey: queryKeys.scheduledPosts(appConfig.demoUserId),
      }),
  }));

  protected readonly submitting = computed(
    () => this.publish.isPending() || this.createScheduled.isPending(),
  );
  protected readonly submitLabel = computed(() => {
    if (this.uploading()) return 'Téléversement…';
    return this.mode() === 'schedule' ? 'Programmer' : 'Publier';
  });

  constructor() {
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.formTick.update((v) => v + 1));
  }

  protected togglePlatform(
    platform: 'facebook' | 'instagram' | 'tiktok' | 'linkedin' | 'youtube',
  ): void {
    // LinkedIn ne peut être ciblé que si un compte est connecté.
    if (platform === 'linkedin' && this.linkedinDisabled()) return;
    if (platform === 'youtube' && this.youtubeDisabled()) return;
    const control = this.form.controls[platform];
    control.setValue(!control.value);
    // Activer YouTube avec une seule chaîne utilisable : on la présélectionne.
    // Avec plusieurs, on NE DEVINE PAS — l'utilisateur choisira.
    if (platform === 'youtube' && control.value) {
      const selectable = this.youtubeSelectable();
      if (selectable.length === 1 && !this.form.controls.youtubeAccountId.value) {
        this.form.controls.youtubeAccountId.setValue(selectable[0].id);
      }
    }
    // Désactiver YouTube ne vide PAS ses champs : l'utilisateur retrouve sa
    // saisie s'il le réactive. Ils sont simplement exclus du payload.
    this.errors.update((e) => ({
      ...e,
      facebook: undefined,
      linkedin: undefined,
      youtube: undefined,
    }));
  }

  /// Construit les options YouTube du payload. Retourne `undefined` si YouTube
  /// n'est pas ciblé : ni `youtubeOptions`, ni `platformOptions.youtube` ne
  /// doivent alors figurer dans la requête.
  private buildYouTubeOptions(
    values: ComposerValues,
  ): YouTubePublishOptions | undefined {
    if (!values.youtube) return undefined;
    const tags = parseYouTubeTags(values.youtubeTags);
    const description = values.youtubeDescription.trim();
    const categoryId = values.youtubeCategoryId.trim();
    return {
      accountId: values.youtubeAccountId,
      title: values.youtubeTitle.trim(),
      privacyStatus: values.youtubePrivacyStatus,
      // Validé en amont : à ce stade, c'est un booléen réel.
      madeForKids: values.youtubeMadeForKids as boolean,
      ...(description ? { description } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(values.youtubeContainsSyntheticMedia
        ? { containsSyntheticMedia: true }
        : {}),
      ...(values.youtubeNotifySubscribers ? { notifySubscribers: true } : {}),
    };
  }

  protected setImageUrl(url: string): void {
    this.form.controls.imageUrl.setValue(url);
    this.errors.update((e) => ({ ...e, imageUrl: undefined }));
  }

  protected setVideoUrl(url: string): void {
    this.form.controls.videoUrl.setValue(url);
    this.errors.update((e) => ({ ...e, videoUrl: undefined }));
  }

  protected onScheduledAtInput(event: Event): void {
    this.scheduledAt.set((event.target as HTMLInputElement).value);
    if (this.scheduledError()) this.scheduledError.set(null);
  }

  protected counterClasses(length: number, max: number): string {
    const tone =
      length > max ? 'text-error' : length > max * 0.9 ? 'text-warning' : 'text-muted';
    return cn('mt-1 text-right text-xs tabular-nums', tone);
  }

  protected toggleClasses(active: boolean): string {
    return cn(
      'flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      active
        ? 'border-primary bg-primary-soft text-primary'
        : 'border-border bg-white text-muted hover:bg-muted-soft',
    );
  }

  protected onSubmit(): void {
    const values = this.form.getRawValue();
    const errors = validateComposer(values);
    this.errors.set(errors);
    if (Object.values(errors).some(Boolean)) return;

    const platforms: PublishPlatform[] = [];
    if (values.facebook) platforms.push('facebook');
    if (values.instagram) platforms.push('instagram');
    if (values.tiktok) platforms.push('tiktok');
    if (values.linkedin) platforms.push('linkedin');
    if (values.youtube) platforms.push('youtube');

    // Le lien LinkedIn n'est pris en charge qu'en publication immédiate (le modèle
    // de programmation ne stocke pas de lien). En mode programmé, LinkedIn exige
    // un texte ou une image.
    if (
      this.mode() === 'schedule' &&
      values.linkedin &&
      !values.message.trim() &&
      !values.imageUrl.trim()
    ) {
      this.errors.set({
        ...this.errors(),
        linkedin:
          'En mode programmé, LinkedIn nécessite un texte ou une image (le lien seul n’est pas programmable).',
      });
      return;
    }

    if (this.mode() === 'schedule') this.schedule(values, platforms);
    else this.publishNow(values, platforms);
  }

  private publishNow(values: ComposerValues, platforms: PublishPlatform[]): void {
    this.results.set(null);
    const youtubeOptions = this.buildYouTubeOptions(values);
    this.publish.mutate(
      {
        userId: appConfig.demoUserId,
        platforms,
        message: values.message.trim() || undefined,
        caption: values.caption.trim() || undefined,
        imageUrl: values.imageUrl.trim() || undefined,
        videoUrl: values.videoUrl.trim() || undefined,
        // Lien LinkedIn (immédiat) : ignoré par les autres plateformes côté backend.
        linkUrl: values.linkedin ? values.linkUrl.trim() || undefined : undefined,
        // Publication IMMÉDIATE : `youtubeOptions` à la racine (la planification
        // utilise, elle, `platformOptions.youtube`).
        ...(youtubeOptions ? { youtubeOptions } : {}),
      },
      {
        onSuccess: (res) => {
          this.results.set(res.results);
          if (res.success) {
            // Une vidéo encore en traitement n'est PAS publiée : le message doit
            // le dire, et le formulaire est conservé pour rester consultable.
            const processing = res.results.some((r) => r.processing);
            if (processing) {
              this.toast.success(
                'Vidéo envoyée à YouTube. Le traitement est en cours — suivez-le dans l’Historique.',
              );
            } else {
              this.toast.success('Publication réussie sur toutes les plateformes.');
            }
            this.reset();
          } else {
            const ok = res.results.filter((r) => r.success).length;
            // Échec partiel : on CONSERVE la saisie pour permettre une correction.
            this.toast.error(
              `Publication partielle : ${ok}/${res.results.length} réussie(s).`,
            );
          }
        },
        onError: () =>
          this.toast.error(
            'La publication a échoué. Vérifiez vos comptes et réessayez.',
          ),
      },
    );
  }

  private schedule(values: ComposerValues, platforms: PublishPlatform[]): void {
    if (!this.scheduledAt()) {
      this.scheduledError.set('Choisissez une date et une heure.');
      return;
    }
    const when = new Date(this.scheduledAt());
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      this.scheduledError.set('La date doit être dans le futur.');
      return;
    }
    this.scheduledError.set(null);
    this.results.set(null);
    const youtubeOptions = this.buildYouTubeOptions(values);
    this.createScheduled.mutate(
      {
        userId: appConfig.demoUserId,
        platforms,
        message: values.message.trim() || undefined,
        caption: values.caption.trim() || undefined,
        imageUrl: values.imageUrl.trim() || undefined,
        videoUrl: values.videoUrl.trim() || undefined,
        // PLANIFICATION : `platformOptions.youtube` — surtout pas
        // `youtubeOptions`, que ce endpoint rejetterait (forbidNonWhitelisted).
        ...(youtubeOptions ? { platformOptions: { youtube: youtubeOptions } } : {}),
        scheduledAt: when.toISOString(),
      },
      {
        onSuccess: () => {
          this.toast.success(
            values.youtube
              ? 'Publication programmée. Pour YouTube, cette date déclenche l’envoi de la vidéo.'
              : 'Publication programmée. Retrouvez-la dans le Calendrier.',
          );
          this.reset();
          this.scheduledAt.set('');
        },
        onError: () =>
          this.toast.error(
            'La programmation a échoué. Vérifiez la date et réessayez.',
          ),
      },
    );
  }

  private reset(): void {
    this.form.reset(composerDefaults);
    this.errors.set({});
  }
}
