import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { cn } from '@shared/utils/utils';
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronRight,
  ChevronsUpDown,
  Code2,
  LucideAngularModule,
  Sun,
  X,
} from '@/shared/ui/icons';
import {
  isSettingsPath,
  settingsNavItems,
  type SettingsNavItem,
} from './settings-nav.config';
import { brand } from '@/core/config/brand.config';
import {
  demoCredits,
  demoDocumentation,
} from '@/core/config/frontend-demo.config';
import {
  groupContainsPath,
  navEntries,
  type NavGroup,
} from './navigation.config';

/// Colonne de navigation (304 px). Fixe sur desktop, tiroir superposé en
/// dessous de `lg`. Elle porte l'identité de l'application, la navigation
/// complète et le pied de colonne — la barre supérieure historique n'existe
/// plus dans le shell.
@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent {
  private readonly router = inject(Router);

  readonly mobileOpen = input(false);
  /// Identité affichée dans le bloc utilisateur. Fournie par le shell : la
  /// sidebar ne fabrique JAMAIS de nom ni d'adresse email.
  readonly userName = input<string | null>(null);
  readonly userEmail = input<string | null>(null);
  readonly close = output<void>();

  protected readonly brand = brand;
  protected readonly credits = demoCredits;
  protected readonly documentation = demoDocumentation;
  protected readonly navEntries = navEntries;

  protected readonly XIcon = X;
  protected readonly BackIcon = ArrowLeft;
  protected readonly ChevronRightIcon = ChevronRight;
  protected readonly settingsNavItems = settingsNavItems;

  /// URL courante, en signal : la sidebar doit se redessiner à chaque
  /// navigation (bascule vers la sous-navigation Settings, état actif des
  /// groupes). Lire `router.url` directement ne l'aurait pas garanti.
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /// Dans la section Settings, la colonne affiche ses propres entrées — comme
  /// dans la maquette — au lieu du menu principal.
  protected readonly inSettings = computed(() => isSettingsPath(this.url()));
  protected readonly ChevronsUpDownIcon = ChevronsUpDown;
  protected readonly CodeIcon = Code2;
  protected readonly ArrowUpRightIcon = ArrowUpRight;
  protected readonly SunIcon = Sun;

  /// Groupes dépliés. Un groupe dont un enfant est actif s'ouvre tout seul,
  /// sinon on n'aurait aucun moyen de savoir où l'on se trouve après un accès
  /// direct par URL.
  private readonly expanded = signal<ReadonlySet<string>>(new Set());

  constructor() {
    effect(() => {
      const url = this.url();
      this.expanded.update((current) => {
        const next = new Set(current);
        for (const entry of navEntries) {
          if (entry.kind === 'group' && groupContainsPath(entry, url)) {
            next.add(entry.id);
          }
        }
        return next;
      });
    });
  }

  protected readonly initials = computed(() => {
    const source = this.userName() ?? this.userEmail() ?? '';
    const letters = source
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '');
    return letters.join('') || brand.initial;
  });

  protected isExpanded(group: NavGroup): boolean {
    return this.expanded().has(group.id);
  }

  protected toggleGroup(group: NavGroup): void {
    this.expanded.update((current) => {
      const next = new Set(current);
      if (next.has(group.id)) next.delete(group.id);
      else next.add(group.id);
      return next;
    });
  }

  /// Un groupe est « courant » quand l'une de ses routes l'est : le repère
  /// visuel doit survivre au repli du groupe.
  protected isGroupActive(group: NavGroup): boolean {
    return groupContainsPath(group, this.url());
  }

  /// Style d'une entrée de la sous-navigation Settings.
  protected settingsLinkClasses(item: SettingsNavItem, isActive: boolean): string {
    return cn(
      'flex h-10 items-center gap-2 rounded-md px-3 text-sm transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
      item.danger
        ? 'text-error hover:bg-error-soft'
        : isActive
          ? 'bg-active font-medium text-foreground'
          : 'font-normal text-muted hover:bg-muted-soft hover:text-foreground',
      isActive && item.danger && 'bg-error-soft font-medium',
    );
  }

  /// État actif conforme à la charte : fond gris, texte et icône noirs — aucun
  /// aplat bleu, aucun décalage de mise en page au survol.
  protected linkClasses(isActive: boolean, nested = false): string {
    return cn(
      'flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
      nested && 'h-9 pl-8 text-[13px]',
      isActive
        ? 'bg-active font-medium text-foreground'
        : 'font-normal text-muted hover:bg-muted-soft hover:text-foreground',
    );
  }

  protected iconClasses(isActive: boolean): string {
    return cn('size-[18px] shrink-0', isActive ? 'text-foreground' : 'text-muted');
  }
}
