/// Formes brutes des réponses Meta Graph API utilisées par l'OAuth.

export interface MetaTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
}

export interface MetaPage {
  id: string
  name: string
  access_token: string
  category?: string
}

export interface MetaPagesResponse {
  data: MetaPage[]
}

export interface MetaInstagramBusinessAccount {
  id: string
  username?: string
  name?: string
}

export interface MetaPageWithInstagram {
  id: string
  instagram_business_account?: MetaInstagramBusinessAccount
}
