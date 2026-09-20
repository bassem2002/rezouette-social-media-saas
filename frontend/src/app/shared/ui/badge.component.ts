import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { cn } from '@shared/utils/utils';

export type BadgeTone = 'primary' | 'success' | 'warning' | 'error' | 'muted';

/// Fonds doux + texte foncé : contraste suffisant pour WCAG AA sur petit texte.
/// Les teintes de texte sont assombries par rapport à l'accent pur, qui ne
/// passerait pas le contraste requis sur un fond clair en 12 px.
const toneClasses: Record<BadgeTone, string> = {
  primary: 'bg-primary-soft text-[#b32410]',
  success: 'bg-success-soft text-[#05663b]',
  warning: 'bg-warning-soft text-[#96600a]',
  error: 'bg-error-soft text-[#a91d16]',
  muted: 'bg-muted-soft text-[#4a4a4a]',
};

/// Badge générique. L'icône optionnelle se projette via l'attribut `badgeIcon`.
@Component({
  selector: 'app-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
  template: `
    <ng-content select="[badgeIcon]" />
    <ng-content />
  `,
})
export class BadgeComponent {
  readonly tone = input<BadgeTone>('muted');
  readonly className = input('');

  protected readonly classes = computed(() =>
    cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
      toneClasses[this.tone()],
      this.className(),
    ),
  );
}
