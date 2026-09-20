import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { BadgeComponent } from '@/shared/ui/badge.component';

/// Marque « Aperçu » apposée sur un titre, une section, une ligne ou un
/// graphique dont les valeurs ne viennent pas du backend.
///
/// Sur un écran MIXTE, c'est ce badge qui fait la frontière : ce qui le porte
/// est une démonstration, tout le reste vient du serveur. Il doit donc rester
/// visible partout où la confusion serait possible.
@Component({
  selector: 'app-preview-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [BadgeComponent],
  template: `<app-badge tone="warning">{{ label() }}</app-badge>`,
})
export class PreviewBadgeComponent {
  readonly label = input('Aperçu');
}
