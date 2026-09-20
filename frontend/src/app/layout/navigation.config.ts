import {
  Activity,
  BarChart3,
  CalendarDays,
  History,
  Inbox,
  KeyRound,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Phone,
  PhoneCall,
  Radio,
  ScrollText,
  Send,
  Settings,
  Shield,
  SquarePen,
  Star,
  Type,
  Users,
  Webhook,
  Workflow,
  type LucideIconData,
} from '@/shared/ui/icons';

/// Entrée de navigation simple (une route).
export interface NavLink {
  kind: 'link';
  to: string;
  label: string;
  icon: LucideIconData;
  /// `end` réserve l'état actif à la correspondance exacte.
  end?: boolean;
}

/// Entrée dépliable regroupant plusieurs routes (« Posts »).
export interface NavGroup {
  kind: 'group';
  id: string;
  label: string;
  icon: LucideIconData;
  children: NavLink[];
}

export type NavEntry = NavLink | NavGroup;

function link(
  to: string,
  label: string,
  icon: LucideIconData,
  end = false,
): NavLink {
  return { kind: 'link', to, label, icon, end };
}

/// Source UNIQUE de la navigation — consommée par la sidebar et le fil
/// d'Ariane. Aucun libellé de route n'est dupliqué ailleurs.
///
/// Inbox, Ads et SMS n'ont ni backend ni écran dédié : ils mènent à la page
/// d'attente générique. Numbers, API Keys, Users, Webhooks et Logs ont, eux,
/// un écran d'APERÇU complet — visuellement abouti mais toujours signalé comme
/// non branché au serveur (voir `frontend-preview.config.ts`).
export const navEntries: NavEntry[] = [
  link('/dashboard', 'Dashboard', LayoutDashboard),
  link('/connections', 'Connections', Link2),
  {
    kind: 'group',
    id: 'posts',
    label: 'Posts',
    icon: SquarePen,
    children: [
      link('/posts/overview', 'Overview', LayoutGrid),
      link('/posts/queues', 'Queues', Layers),
      link('/publication', 'Publication', Send),
      link('/calendar', 'Calendrier', CalendarDays),
      link('/history', 'Historique', History),
    ],
  },
  link('/analytics', 'Analytics', BarChart3),
  {
    kind: 'group',
    id: 'inbox',
    label: 'Inbox',
    icon: Inbox,
    children: [
      link('/inbox/messages', 'Messages', MessageSquare),
      link('/inbox/comments', 'Comments', MessageCircle),
      link('/inbox/reviews', 'Reviews', Star),
      link('/inbox/campaigns', 'Campaigns', Radio),
      link('/inbox/workflows', 'Workflows', Workflow),
      link('/inbox/contacts', 'Contacts', Users),
    ],
  },
  link('/ads', 'Ads', Megaphone),
  {
    kind: 'group',
    id: 'numbers',
    label: 'Numbers',
    icon: Phone,
    children: [
      link('/numbers/overview', 'Overview', LayoutGrid),
      link('/numbers/calls', 'Calls', PhoneCall),
    ],
  },
  {
    kind: 'group',
    id: 'sms',
    label: 'SMS',
    icon: MessageSquare,
    children: [
      link('/sms/10dlc', '10DLC', Shield),
      link('/sms/sender-ids', 'Sender IDs', Type),
    ],
  },
  link('/api-keys', 'API Keys', KeyRound),
  link('/users', 'Users', Users),
  link('/webhooks', 'Webhooks', Webhook),
  link('/logs', 'Logs', ScrollText),
  link('/settings', 'Settings', Settings),
];

/// Icône de la page d'attente générique (aucune route dédiée ne la fournit).
export const PLACEHOLDER_ICON = Activity;

/// Liste plate de toutes les routes navigables (groupes aplatis).
export const navLinks: NavLink[] = navEntries.flatMap((entry) =>
  entry.kind === 'group' ? entry.children : [entry],
);

/// Vrai si l'une des routes du groupe correspond au chemin courant : le groupe
/// doit rester ouvert quand on navigue directement sur l'un de ses enfants.
export function groupContainsPath(group: NavGroup, pathname: string): boolean {
  const path = pathname.split('?')[0];
  return group.children.some(
    (child) => path === child.to || path.startsWith(`${child.to}/`),
  );
}

/// Libellé d'une route (fil d'Ariane). Repli sur « Dashboard », route d'accueil.
export function labelForPath(pathname: string): string {
  const path = pathname.split('?')[0];
  const exact = navLinks.find((i) => i.to === path);
  if (exact) return exact.label;
  const prefix = navLinks.find((i) => path.startsWith(`${i.to}/`));
  return prefix?.label ?? 'Dashboard';
}
