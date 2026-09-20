import { ApiProperty } from '@nestjs/swagger'
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator'

/// Forme UUID (8-4-4-4-12 hex) sans contrainte de version — alignée sur les autres DTO.
const UUID_SHAPE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export const LINKEDIN_VISIBILITIES = ['PUBLIC', 'CONNECTIONS'] as const
export type LinkedInDtoVisibility = (typeof LINKEDIN_VISIBILITIES)[number]

/// Valide qu'au moins un des champs listés est renseigné (texte OU lien OU image).
function AtLeastOne(fields: string[], options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'atLeastOne',
      target: object.constructor,
      propertyName,
      constraints: fields,
      options,
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const obj = args.object as Record<string, unknown>
          return fields.some((f) => {
            const v = obj[f]
            return typeof v === 'string' && v.trim().length > 0
          })
        },
        defaultMessage(): string {
          return `Au moins un des champs suivants est requis : ${fields.join(', ')}`
        },
      },
    })
  }
}

/// Corps de POST /social/linkedin/publish — publication sur le profil MEMBRE.
/// MVP : texte, lien/article ou UNE image. Aucun champ organisation.
export class PublishLinkedInDto {
  @ApiProperty({
    description: "Identifiant de l'utilisateur Zernio propriétaire du compte",
    format: 'uuid',
    example: '00000000-0000-0000-0000-000000000001',
  })
  @IsString()
  @Matches(UUID_SHAPE, { message: 'userId doit être au format UUID' })
  userId!: string

  @ApiProperty({
    description:
      "Identifiant interne du compte LinkedIn (optionnel — le compte membre actif est résolu automatiquement au MVP).",
    format: 'uuid',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(UUID_SHAPE, { message: 'accountId doit être au format UUID' })
  accountId?: string

  @ApiProperty({
    description: 'Texte de la publication (commentaire). Requis si aucun lien/image.',
    example: 'Ravi de partager notre nouvelle fonctionnalité 🚀',
    required: false,
    maxLength: 3000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  @AtLeastOne(['text', 'linkUrl', 'imageUrl'], {
    message: 'Fournissez au moins un texte, un lien (linkUrl) ou une image (imageUrl).',
  })
  text?: string

  @ApiProperty({
    description:
      "URL du lien/article partagé. LinkedIn ne scrape pas l'URL : fournissez titre/description.",
    example: 'https://zernio.com/blog/launch',
    required: false,
  })
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  linkUrl?: string

  @ApiProperty({
    description: "Titre de l'aperçu du lien (article).",
    required: false,
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  linkTitle?: string

  @ApiProperty({
    description: "Description de l'aperçu du lien (article).",
    required: false,
    maxLength: 300,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  linkDescription?: string

  @ApiProperty({
    description:
      "URL publique d'UNE image à téléverser vers LinkedIn (MVP : une seule image).",
    example: 'https://picsum.photos/1200/627',
    required: false,
  })
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  imageUrl?: string

  @ApiProperty({
    description: "Texte alternatif de l'image (accessibilité).",
    required: false,
    maxLength: 300,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageAltText?: string

  @ApiProperty({
    description: 'Visibilité du post.',
    enum: LINKEDIN_VISIBILITIES,
    default: 'PUBLIC',
    required: false,
  })
  @IsOptional()
  @IsIn(LINKEDIN_VISIBILITIES)
  visibility?: LinkedInDtoVisibility
}
