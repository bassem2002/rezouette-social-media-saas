import type { BadgeTone } from '@/shared/ui/badge.component';
import type { AccountStatus, TokenStatus } from '@core/models';

/// État d'affichage d'un compte, dérivé du statut de token, du statut persisté
/// du compte et de sa simple présence.
export type AccountDisplayState =
  | 'CONNECTED'
  | 'TOKEN_EXPIRED'
  | 'RECONNECT_REQUIRED'
  | 'ERROR'
  | 'NOT_CONNECTED';

/// Règle de priorité : un compte ne peut afficher qu'UN état. L'ordre part du
/// plus bloquant (absence de compte) vers le plus favorable, afin qu'un compte
/// à la fois en erreur et expiré n'apparaisse jamais comme « connecté ».
///
/// `accountStatus` est optionnel : les appelants historiques qui ne le
/// fournissent pas conservent exactement le comportement précédent.
export function deriveAccountState(
  token: TokenStatus | null,
  hasAccount: boolean,
  accountStatus?: AccountStatus | null,
): AccountDisplayState {
  if (!hasAccount) return 'NOT_CONNECTED';
  if (accountStatus === 'revoked') return 'NOT_CONNECTED';
  if (accountStatus === 'error') return 'ERROR';
  if (token === 'EXPIRED' || accountStatus === 'expired') return 'TOKEN_EXPIRED';
  if (token === 'RECONNECT_REQUIRED') return 'RECONNECT_REQUIRED';
  return 'CONNECTED';
}

export const accountStateConfig: Record<
  AccountDisplayState,
  { label: string; tone: BadgeTone; needsAction: boolean }
> = {
  CONNECTED: { label: 'connected', tone: 'success', needsAction: false },
  TOKEN_EXPIRED: { label: 'expired', tone: 'error', needsAction: true },
  RECONNECT_REQUIRED: {
    label: 'reconnect required',
    tone: 'warning',
    needsAction: true,
  },
  ERROR: { label: 'error', tone: 'error', needsAction: true },
  NOT_CONNECTED: { label: 'not connected', tone: 'muted', needsAction: true },
};
