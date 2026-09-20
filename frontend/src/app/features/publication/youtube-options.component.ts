import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { LabelComponent } from '@shared/components/label.component';
import { InputDirective } from '@shared/directives/input.directive';
import { TextareaDirective } from '@shared/directives/textarea.directive';
import { SelectDirective } from '@shared/directives/select.directive';
import { PlatformIconComponent } from '@shared/components/platform-icon.component';
import {
  YOUTUBE_DESCRIPTION_MAX,
  YOUTUBE_PRIVACY_LABELS,
  YOUTUBE_PRIVACY_STATUSES,
  YOUTUBE_TITLE_MAX,
} from '@core/models';
import type { ComposerErrors } from './post-composer.schema';
import type { YouTubeChannelChoice } from './youtube-channel-choice';

/// Bloc d'options YouTube du composer. STRICTEMENT présentationnel : il lit et
/// écrit dans le FormGroup fourni, mais ne construit aucun payload et ne décide
/// d'aucune règle — l'orchestration reste au composer principal.
@Component({
  selector: 'app-youtube-options',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    LabelComponent,
    InputDirective,
    TextareaDirective,
    SelectDirective,
    PlatformIconComponent,
  ],
  templateUrl: './youtube-options.component.html',
})
export class YouTubeOptionsComponent {
  /// FormGroup du composer (contrôles `youtube*`).
  readonly form = input.required<FormGroup>();
  readonly errors = input.required<ComposerErrors>();
  readonly channels = input.required<YouTubeChannelChoice[]>();
  readonly loading = input(false);
  readonly notConfigured = input(false);
  /// `schedule` ajoute l'avertissement sur la sémantique de scheduledAt.
  readonly mode = input<'now' | 'schedule'>('now');

  protected readonly TITLE_MAX = YOUTUBE_TITLE_MAX;
  protected readonly DESCRIPTION_MAX = YOUTUBE_DESCRIPTION_MAX;
  protected readonly privacyStatuses = YOUTUBE_PRIVACY_STATUSES;
  protected readonly privacyLabel = (status: string): string =>
    YOUTUBE_PRIVACY_LABELS[status as keyof typeof YOUTUBE_PRIVACY_LABELS] ?? status;

  protected readonly selectableChannels = computed(() =>
    this.channels().filter((channel) => !channel.disabled),
  );
  /// Une seule chaîne disponible : la pré-sélection est faite par le composer.
  /// Plusieurs : on demande un choix explicite plutôt que de deviner.
  protected readonly needsExplicitChoice = computed(
    () => this.selectableChannels().length > 1,
  );
  protected readonly hasChannels = computed(() => this.channels().length > 0);

  protected readonly titleLength = computed(
    () => String(this.form().get('youtubeTitle')?.value ?? '').length,
  );
  protected readonly descriptionLength = computed(
    () => String(this.form().get('youtubeDescription')?.value ?? '').length,
  );

  /// Avertissement de la chaîne actuellement choisie (ex. pas de refresh token).
  protected readonly selectedWarning = computed(() => {
    const id = this.form().get('youtubeAccountId')?.value as string;
    return this.channels().find((channel) => channel.id === id)?.warning ?? '';
  });
}
