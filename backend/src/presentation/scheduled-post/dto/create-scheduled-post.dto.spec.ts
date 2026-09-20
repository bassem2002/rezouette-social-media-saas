import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validateSync, type ValidationError } from 'class-validator'
import { CreateScheduledPostDto } from './create-scheduled-post.dto.js'

/// Reproduit EXACTEMENT le ValidationPipe global déclaré dans main.ts
/// (whitelist + forbidNonWhitelisted + transform + enableImplicitConversion),
/// afin que ces tests reflètent le comportement réel de l'API et non une
/// configuration idéalisée.
function validatePayload(payload: unknown): ValidationError[] {
  const instance = plainToInstance(CreateScheduledPostDto, payload, {
    enableImplicitConversion: true,
  })
  return validateSync(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  })
}

/// Aplatit l'arbre d'erreurs en `chemin:contrainte` (ex. `youtube.privacyStatus:isIn`).
function failedPaths(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((error) => {
    const path = prefix ? `${prefix}.${error.property}` : error.property
    const own = Object.keys(error.constraints ?? {}).map((c) => `${path}:${c}`)
    return [...own, ...failedPaths(error.children ?? [], path)]
  })
}

const BASE = {
  userId: '00000000-0000-0000-0000-000000000001',
  platforms: ['facebook'],
  message: 'Publication programmée',
  scheduledAt: '2099-01-01T09:30:00.000Z',
}

describe('CreateScheduledPostDto', () => {
  describe('compatibilité ascendante', () => {
    it('accepte une planification héritée, sans platformOptions', () => {
      expect(validatePayload(BASE)).toHaveLength(0)
    })

    it('accepte platformOptions absent sur une planification TikTok', () => {
      const errors = validatePayload({
        ...BASE,
        platforms: ['tiktok'],
        videoUrl: 'https://example.test/clip.mp4',
      })

      expect(errors).toHaveLength(0)
    })
  })

  describe('platformOptions.youtube', () => {
    it('accepte un bloc complet et valide', () => {
      const errors = validatePayload({
        ...BASE,
        platformOptions: {
          youtube: {
            title: 'Ma vidéo',
            description: 'Description',
            tags: ['zernio', 'saas'],
            categoryId: '22',
            privacyStatus: 'unlisted',
            madeForKids: false,
            containsSyntheticMedia: false,
            notifySubscribers: true,
            accountId: '11111111-1111-1111-1111-111111111111',
          },
        },
      })

      expect(errors).toHaveLength(0)
    })

    it('accepte un bloc vide (tous les champs sont optionnels à ce stade)', () => {
      expect(
        validatePayload({ ...BASE, platformOptions: { youtube: {} } }),
      ).toHaveLength(0)
    })

    it.each(['private', 'unlisted', 'public'])(
      'accepte la visibilité "%s"',
      (privacyStatus) => {
        expect(
          validatePayload({ ...BASE, platformOptions: { youtube: { privacyStatus } } }),
        ).toHaveLength(0)
      },
    )

    it('rejette une visibilité inconnue', () => {
      const errors = validatePayload({
        ...BASE,
        platformOptions: { youtube: { privacyStatus: 'secret' } },
      })

      expect(failedPaths(errors)).toContain(
        'platformOptions.youtube.privacyStatus:isIn',
      )
    })

    it('rejette un accountId qui n’est pas un UUID', () => {
      const errors = validatePayload({
        ...BASE,
        platformOptions: { youtube: { accountId: 'pas-un-uuid' } },
      })

      expect(failedPaths(errors)).toContain(
        'platformOptions.youtube.accountId:matches',
      )
    })

    it('rejette un titre de plus de 100 caractères', () => {
      const errors = validatePayload({
        ...BASE,
        platformOptions: { youtube: { title: 'x'.repeat(101) } },
      })

      expect(failedPaths(errors)).toContain(
        'platformOptions.youtube.title:maxLength',
      )
    })

    it('rejette des tags qui ne sont pas un tableau', () => {
      const errors = validatePayload({
        ...BASE,
        platformOptions: { youtube: { tags: 'zernio' } },
      })

      expect(failedPaths(errors)).toContain('platformOptions.youtube.tags:isArray')
    })

    it('accepte des booléens réels', () => {
      expect(
        validatePayload({
          ...BASE,
          platformOptions: {
            youtube: {
              madeForKids: true,
              containsSyntheticMedia: false,
              notifySubscribers: true,
            },
          },
        }),
      ).toHaveLength(0)
    })

    it('documente la coercition booléenne du pipe global (enableImplicitConversion)', () => {
      // Comportement PRÉEXISTANT et global au projet : `transformOptions.
      // enableImplicitConversion` convertit la valeur AVANT @IsBoolean, si bien
      // qu'une chaîne non vide serait acceptée et deviendrait `true`.
      //
      // Les trois booléens YouTube utilisent désormais `@IsStrictBoolean`, qui
      // relit la valeur BRUTE du corps et n'accepte que `true`/`false` : une
      // déclaration COPPA ne peut plus être falsifiée par coercition.
      const errors = validatePayload({
        ...BASE,
        platformOptions: { youtube: { madeForKids: 'oui' } },
      })

      expect(failedPaths(errors)).toContain(
        'platformOptions.youtube.madeForKids:isStrictBoolean',
      )
    })

    it.each([
      ['chaîne "true"', 'true'],
      ['chaîne "false"', 'false'],
      ['nombre 1', 1],
      ['nombre 0', 0],
      ['objet', {}],
      ['tableau', []],
    ])('refuse un madeForKids non booléen (%s)', (_label, value) => {
      const errors = validatePayload({
        ...BASE,
        platformOptions: { youtube: { madeForKids: value } },
      })

      expect(failedPaths(errors)).toContain(
        'platformOptions.youtube.madeForKids:isStrictBoolean',
      )
    })

    it.each([true, false])('accepte le booléen réel %s', (value) => {
      const errors = validatePayload({
        ...BASE,
        platformOptions: {
          youtube: {
            madeForKids: value,
            containsSyntheticMedia: value,
            notifySubscribers: value,
          },
        },
      })

      expect(errors).toHaveLength(0)
    })
  })

  describe('champs inconnus (forbidNonWhitelisted)', () => {
    it('rejette un champ inconnu dans les options YouTube', () => {
      const errors = validatePayload({
        ...BASE,
        platformOptions: { youtube: { champInconnu: 1 } },
      })

      expect(failedPaths(errors)).toContain(
        'platformOptions.youtube.champInconnu:whitelistValidation',
      )
    })

    it('rejette une plateforme inconnue dans platformOptions', () => {
      const errors = validatePayload({
        ...BASE,
        platformOptions: { twitter: {} },
      })

      expect(failedPaths(errors)).toContain(
        'platformOptions.twitter:whitelistValidation',
      )
    })
  })

  describe('youtube désormais programmable', () => {
    const YOUTUBE_OPTIONS = {
      accountId: '11111111-1111-1111-1111-111111111111',
      title: 'Ma vidéo',
      privacyStatus: 'private',
      madeForKids: false,
    }
    const YOUTUBE_BASE = {
      ...BASE,
      videoUrl: 'https://api.zernio.test/uploads/social/2026/08/clip.mp4',
      platformOptions: { youtube: YOUTUBE_OPTIONS },
    }

    it('accepte youtube seul avec un bloc complet', () => {
      expect(
        validatePayload({ ...YOUTUBE_BASE, platforms: ['youtube'] }),
      ).toHaveLength(0)
    })

    it.each([
      ['youtube + tiktok', ['youtube', 'tiktok']],
      ['youtube + facebook', ['youtube', 'facebook']],
      ['youtube + instagram', ['youtube', 'instagram']],
      ['youtube + linkedin', ['youtube', 'linkedin']],
    ])('accepte %s', (_label, platforms) => {
      expect(
        validatePayload({ ...YOUTUBE_BASE, platforms, imageUrl: 'https://img.test/a.jpg' }),
      ).toHaveLength(0)
    })

    it('accepte un bloc YouTube complet avec toutes les options', () => {
      const errors = validatePayload({
        ...YOUTUBE_BASE,
        platforms: ['youtube'],
        platformOptions: {
          youtube: {
            ...YOUTUBE_OPTIONS,
            description: 'Description',
            tags: ['zernio', 'saas'],
            categoryId: '22',
            privacyStatus: 'unlisted',
            containsSyntheticMedia: false,
            notifySubscribers: true,
          },
        },
      })

      expect(errors).toHaveLength(0)
    })

    it('accepte encore des options YouTube seules au niveau DTO (le use case tranche)', () => {
      expect(
        validatePayload({
          ...BASE,
          platformOptions: { youtube: { title: 'Prêt pour plus tard' } },
        }),
      ).toHaveLength(0)
    })
  })
})
