import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideAngularModule, ArrowLeft } from '@/shared/ui/icons';

/// Layout à deux panneaux des écrans Inbox : liste à gauche, détail à droite.
///
/// Sur mobile, afficher deux colonnes rendrait les deux illisibles : le layout
/// bascule alors en navigation liste → détail, avec un bouton retour. C'est
/// `detailOpen` qui décide, et non une simple règle CSS, pour que le bouton
/// retour et le focus suivent réellement l'état de navigation.
@Component({
  selector: 'app-inbox-split-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [LucideAngularModule],
  template: `
    <div
      class="grid min-h-[calc(100svh-8rem)] grid-cols-1 overflow-hidden rounded-xl border border-border bg-surface lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]"
    >
      <!-- Panneau liste — masqué sur mobile quand un détail est ouvert. -->
      <section
        class="min-w-0 border-border lg:border-r"
        [class.hidden]="detailOpen()"
        [class.lg:block]="true"
        [attr.aria-label]="listLabel()"
      >
        <ng-content select="[inboxList]" />
      </section>

      <!-- Panneau détail — masqué sur mobile tant que rien n'est sélectionné. -->
      <section
        class="min-w-0"
        [class.hidden]="!detailOpen()"
        [class.lg:block]="true"
        [attr.aria-label]="detailLabel()"
      >
        @if (detailOpen()) {
          <button
            type="button"
            (click)="back.emit()"
            class="flex h-12 w-full items-center gap-2 border-b border-border px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
          >
            <lucide-icon [img]="BackIcon" class="size-4" aria-hidden="true" />
            Retour à la liste
          </button>
        }
        <ng-content select="[inboxDetail]" />
      </section>
    </div>
  `,
})
export class InboxSplitLayoutComponent {
  /// Vrai quand un élément est sélectionné (pilote la bascule mobile).
  readonly detailOpen = input(false);
  readonly listLabel = input('Liste');
  readonly detailLabel = input('Détail');
  readonly back = output<void>();

  protected readonly BackIcon = ArrowLeft;
}
