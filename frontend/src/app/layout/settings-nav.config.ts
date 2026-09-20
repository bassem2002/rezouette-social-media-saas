/// Sous-navigation de la section Settings.
///
/// Quand l'utilisateur entre dans `/settings`, la colonne de navigation bascule
/// sur cette liste (avec un retour vers le menu principal), comme dans la
/// maquette. Source unique : la sidebar et le routeur lisent le même tableau.

export interface SettingsNavItem {
  to: string;
  label: string;
  /// Entrée qui pointerait vers un service externe (facturation, usage). Sans
  /// backend, elle affiche un message au lieu d'ouvrir une page vide.
  external?: boolean;
  /// Mise en avant « attention » (zone dangereuse).
  danger?: boolean;
}

export const settingsNavItems: SettingsNavItem[] = [
  { to: '/settings/profile', label: 'Profile' },
  { to: '/settings/usage', label: 'Usage', external: true },
  { to: '/settings/billing', label: 'Billing', external: true },
  { to: '/settings/security', label: 'Security' },
  { to: '/settings/notifications', label: 'Notifications' },
  { to: '/settings/connected-apps', label: 'Connected apps' },
  { to: '/settings/slack', label: 'Slack' },
  { to: '/settings/ai-providers', label: 'AI providers' },
  { to: '/settings/sso', label: 'Single sign-on' },
  { to: '/settings/danger-zone', label: 'Danger Zone', danger: true },
];

/// Vrai si l'URL courante appartient à la section Settings.
export function isSettingsPath(pathname: string): boolean {
  const path = pathname.split('?')[0];
  return path === '/settings' || path.startsWith('/settings/');
}
