import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideAngularModule, Info } from '@/shared/ui/icons';

/// Texte des écrans dont AUCUNE donnée ne vient du backend.
export const PREVIEW_NOTICE_TEXT =
  'Aperçu frontend — cette fonctionnalité n’est pas encore connectée au backend Rezouette. ' +
  'Les données affichées sont des exemples et les actions ne sont pas réellement exécutées.';

/// Texte des écrans MIXTES : une partie des informations est réelle.
export const PARTIAL_NOTICE_TEXT =
  'Données partielles — Rezouette affiche les informations actuellement disponibles dans le backend. ' +
  'Les éléments marqués « Aperçu » sont uniquement des démonstrations frontend.';

/// Bandeau d'honnêteté des écrans non (ou partiellement) branchés au backend.
///
/// Il porte une promesse simple : tant que ce bandeau est présent, ce qu'il
/// annonce est vrai — soit rien ne vient du serveur, soit seuls les éléments
/// explicitement marqués « Aperçu » sont fictifs. Volontairement discret pour
/// informer sans écraser la page, mais toujours au-dessus du contenu concerné.
@Component({
  selector: 'app-frontend-preview-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  imports: [LucideAngularModule],
  template: `
    <div
      class="flex items-start gap-2.5 rounded-lg border border-[#ffd9cf] bg-primary-soft px-3 py-2.5"
      role="note"
    >
      <lucide-icon
        [img]="InfoIcon"
        class="mt-px size-4 shrink-0 text-primary"
        aria-hidden="true"
      />
      <p class="text-[13px] leading-snug text-foreground">{{ text() }}</p>
    </div>
  `,
})
export class FrontendPreviewNoticeComponent {
  /// `preview` : rien n'est réel. `partial` : seules certaines sections le sont.
  readonly variant = input<'preview' | 'partial'>('preview');
  /// Précision optionnelle ajoutée au texte standard. Elle peut détailler la
  /// limite, jamais l'adoucir.
  readonly detail = input<string | null>(null);

  protected readonly InfoIcon = Info;

  protected readonly text = computed(() => {
    const base =
      this.variant() === 'partial' ? PARTIAL_NOTICE_TEXT : PREVIEW_NOTICE_TEXT;
    const detail = this.detail();
    return detail ? `${base} ${detail}` : base;
  });
}
