import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PageHeaderComponent } from '@shared/components/page-header.component';
import { FrontendPreviewNoticeComponent } from '@shared/components/frontend-preview-notice.component';
import { PreviewBadgeComponent } from '@shared/components/preview-badge.component';
import { FilterSelectComponent } from '@shared/components/filter-select.component';
import { SearchBarComponent } from '@shared/components/search-bar.component';
import { LabelComponent } from '@shared/components/label.component';
import { InputDirective } from '@shared/directives/input.directive';
import { TextareaDirective } from '@shared/directives/textarea.directive';
import { SelectDirective } from '@shared/directives/select.directive';
import { ButtonComponent } from '@/shared/ui/button.component';
import { DrawerComponent } from '@/shared/ui/drawer.component';
import {
  ChevronDown,
  LucideAngularModule,
  MessageCircle,
  Plus,
  Radio,
  Workflow,
} from '@/shared/ui/icons';
import { ToastService } from '@core/services/toast.service';
import {
  INBOX_PREVIEW_MESSAGES,
  previewBroadcasts,
  previewCommentToDm,
  previewPlatformFilters,
  previewSequences,
  previewStatusFilters,
} from '@/core/config/frontend-preview-data';

type CampaignTab = 'broadcasts' | 'sequences' | 'comment-to-dm';

/// Inbox — Campaigns (Broadcasts, Sequences, Comment-to-DM).
///
/// APERÇU FRONTEND intégral : aucun endpoint de campagne n'existe. Les
/// formulaires sont réels et validés, mais leur validation n'entraîne AUCUN
/// envoi : ni message groupé, ni séquence, ni surveillance de commentaires.
/// C'est l'écran où la confusion coûterait le plus cher — un « broadcast »
/// que l'on croirait parti ne peut pas être rattrapé.
@Component({
  selector: 'app-inbox-campaigns-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    FrontendPreviewNoticeComponent,
    PreviewBadgeComponent,
    FilterSelectComponent,
    SearchBarComponent,
    LabelComponent,
    InputDirective,
    TextareaDirective,
    SelectDirective,
    ButtonComponent,
    DrawerComponent,
    LucideAngularModule,
  ],
  templateUrl: './campaigns-page.component.html',
})
export class InboxCampaignsPage {
  private readonly toast = inject(ToastService);

  protected readonly PlusIcon = Plus;
  protected readonly ChevronDownIcon = ChevronDown;
  protected readonly BroadcastIcon = Radio;
  protected readonly SequenceIcon = Workflow;
  protected readonly CommentIcon = MessageCircle;

  protected readonly platformOptions = previewPlatformFilters;
  protected readonly statusOptions = previewStatusFilters;

  protected readonly tabs: { id: CampaignTab; label: string }[] = [
    { id: 'broadcasts', label: 'Broadcasts' },
    { id: 'sequences', label: 'Sequences' },
    { id: 'comment-to-dm', label: 'Comment-to-DM' },
  ];
  protected readonly tab = signal<CampaignTab>('broadcasts');

  protected readonly search = signal('');
  protected readonly status = signal('all');
  protected readonly platform = signal('all');

  protected readonly broadcasts = signal(previewBroadcasts);
  protected readonly sequences = signal(previewSequences);
  protected readonly automations = signal(previewCommentToDm);

  protected readonly hasBroadcasts = computed(() => this.broadcasts().length > 0);
  protected readonly hasSequences = computed(() => this.sequences().length > 0);
  protected readonly hasAutomations = computed(
    () => this.automations().length > 0,
  );

  // ── Drawers ──────────────────────────────────────────────────────────────
  protected readonly broadcastOpen = signal(false);
  protected readonly sequenceOpen = signal(false);
  protected readonly automationOpen = signal(false);

  protected readonly broadcastForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    platform: new FormControl('FACEBOOK', { nonNullable: true }),
    message: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(1000)],
    }),
  });

  protected readonly sequenceForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    delayHours: new FormControl(24, { nonNullable: true }),
  });

  protected readonly automationForm = new FormGroup({
    platform: new FormControl('INSTAGRAM', { nonNullable: true }),
    postReference: new FormControl('', { nonNullable: true }),
    keyword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(40)],
    }),
    reply: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(500)],
    }),
  });

  protected readonly submitAttempted = signal(false);

  protected setTab(tab: CampaignTab): void {
    this.tab.set(tab);
  }

  protected openBroadcast(): void {
    this.submitAttempted.set(false);
    this.broadcastForm.reset({ name: '', platform: 'FACEBOOK', message: '' });
    this.broadcastOpen.set(true);
  }

  protected submitBroadcast(): void {
    this.submitAttempted.set(true);
    if (this.broadcastForm.invalid) {
      this.broadcastForm.markAllAsTouched();
      return;
    }
    this.broadcastOpen.set(false);
    this.toast.info(INBOX_PREVIEW_MESSAGES.broadcast);
  }

  protected openSequence(): void {
    this.submitAttempted.set(false);
    this.sequenceForm.reset({ name: '', delayHours: 24 });
    this.sequenceOpen.set(true);
  }

  protected submitSequence(): void {
    this.submitAttempted.set(true);
    if (this.sequenceForm.invalid) {
      this.sequenceForm.markAllAsTouched();
      return;
    }
    this.sequenceOpen.set(false);
    this.toast.info(INBOX_PREVIEW_MESSAGES.sequence);
  }

  protected openAutomation(): void {
    this.submitAttempted.set(false);
    this.automationForm.reset({
      platform: 'INSTAGRAM',
      postReference: '',
      keyword: '',
      reply: '',
    });
    this.automationOpen.set(true);
  }

  protected submitAutomation(): void {
    this.submitAttempted.set(true);
    if (this.automationForm.invalid) {
      this.automationForm.markAllAsTouched();
      return;
    }
    this.automationOpen.set(false);
    this.toast.info(INBOX_PREVIEW_MESSAGES.commentToDm);
  }
}
