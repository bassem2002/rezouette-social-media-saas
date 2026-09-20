import { SocialPlatform } from '../../shared/ports/social-provider.port.js'

/// Cycle de vie d'une connexion. Un compte n'est jamais supprimé : on le révoque.
export type SocialAccountStatus = 'active' | 'expired' | 'revoked' | 'error'

export interface SocialAccountProps {
  id: string
  userId: string
  platform: SocialPlatform
  externalAccountId: string
  accountName: string
  /// Token chiffré au repos — le chiffrement est géré dans la couche infra.
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: Date | null
  scopes: string[]
  status: SocialAccountStatus
  metadata: Record<string, unknown> | null
  /// Dernier rafraîchissement de token réussi (prépare le refresh automatique).
  lastRefreshAt: Date | null
  /// Vrai quand Meta exige une reconnexion OAuth (ex. erreur 190+460).
  needsReconnect: boolean
  createdAt: Date
  updatedAt: Date
}

export class SocialAccount {
  private constructor(private readonly props: SocialAccountProps) {}

  static create(input: {
    userId: string
    platform: SocialPlatform
    externalAccountId: string
    accountName: string
    accessToken: string
    refreshToken?: string | null
    tokenExpiresAt?: Date | null
    scopes?: string[]
    metadata?: Record<string, unknown> | null
  }): SocialAccount {
    const now = new Date()
    return new SocialAccount({
      id: crypto.randomUUID(),
      userId: input.userId,
      platform: input.platform,
      externalAccountId: input.externalAccountId,
      accountName: input.accountName,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken ?? null,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      scopes: input.scopes ?? [],
      status: 'active',
      metadata: input.metadata ?? null,
      lastRefreshAt: null,
      needsReconnect: false,
      createdAt: now,
      updatedAt: now,
    })
  }

  static reconstitute(props: SocialAccountProps): SocialAccount {
    return new SocialAccount(props)
  }

  /// Rafraîchit le token après un échange OAuth (ou un futur refresh
  /// automatique) : trace la date de refresh et lève le drapeau de reconnexion.
  updateTokens(input: {
    accessToken: string
    refreshToken?: string | null
    tokenExpiresAt?: Date | null
  }): void {
    this.props.accessToken = input.accessToken
    this.props.refreshToken = input.refreshToken ?? this.props.refreshToken
    this.props.tokenExpiresAt = input.tokenExpiresAt ?? this.props.tokenExpiresAt
    this.props.status = 'active'
    this.props.lastRefreshAt = new Date()
    this.props.needsReconnect = false
    this.touch()
  }

  /// Met à jour les informations de profil rapportées par le réseau lors d'une
  /// (re)connexion : libellé, scopes réellement accordés, métadonnées provider.
  /// Distinct de `updateTokens` : aucun secret n'est touché ici. Un champ absent
  /// (`undefined`) est laissé inchangé ; `metadata: null` efface explicitement.
  updateProfile(input: {
    accountName?: string
    scopes?: string[]
    metadata?: Record<string, unknown> | null
  }): void {
    if (input.accountName !== undefined) {
      this.props.accountName = input.accountName
    }
    if (input.scopes !== undefined) {
      this.props.scopes = [...input.scopes]
    }
    if (input.metadata !== undefined) {
      this.props.metadata = input.metadata
    }
    this.touch()
  }

  markExpired(): void {
    this.props.status = 'expired'
    this.touch()
  }

  /// Marque le compte comme nécessitant une reconnexion OAuth (token irrécupérable
  /// sans intervention utilisateur — ex. erreur Meta 190+460 RECONNECT_REQUIRED).
  markNeedsReconnect(): void {
    this.props.needsReconnect = true
    this.touch()
  }

  markError(): void {
    this.props.status = 'error'
    this.touch()
  }

  /// Déconnexion logique : on conserve l'historique des diffusions.
  revoke(): void {
    this.props.status = 'revoked'
    this.touch()
  }

  private touch(): void {
    this.props.updatedAt = new Date()
  }

  get isActive(): boolean {
    return this.props.status === 'active'
  }

  get id(): string {
    return this.props.id
  }
  get userId(): string {
    return this.props.userId
  }
  get platform(): SocialPlatform {
    return this.props.platform
  }
  get externalAccountId(): string {
    return this.props.externalAccountId
  }
  get accountName(): string {
    return this.props.accountName
  }
  get accessToken(): string {
    return this.props.accessToken
  }
  get refreshToken(): string | null {
    return this.props.refreshToken
  }
  get tokenExpiresAt(): Date | null {
    return this.props.tokenExpiresAt
  }
  get scopes(): string[] {
    return this.props.scopes
  }
  get status(): SocialAccountStatus {
    return this.props.status
  }
  get metadata(): Record<string, unknown> | null {
    return this.props.metadata
  }
  get lastRefreshAt(): Date | null {
    return this.props.lastRefreshAt
  }
  get needsReconnect(): boolean {
    return this.props.needsReconnect
  }
  get createdAt(): Date {
    return this.props.createdAt
  }
  get updatedAt(): Date {
    return this.props.updatedAt
  }
}
