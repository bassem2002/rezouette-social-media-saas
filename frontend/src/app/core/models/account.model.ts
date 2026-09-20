/// Comptes connectés (GET /social/accounts) — miroir de ConnectedAccountDto.
export type AccountPlatform =
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'youtube';
export type AccountStatus = 'active' | 'expired' | 'revoked' | 'error';

export interface ConnectedAccount {
  id: string;
  platform: AccountPlatform;
  externalAccountId: string;
  accountName: string;
  status: AccountStatus;
  tokenExpiresAt: string | null;
  scopes: string[];
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}
