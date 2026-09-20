import type { ScheduledPost as PrismaScheduledPost } from '../../../../generated/prisma/client.js'
import { Prisma } from '../../../../generated/prisma/client.js'
import { ScheduledPostMapper } from './scheduled-post.mapper.js'
import { ScheduledPost } from '../../../domain/scheduled-post/entities/scheduled-post.entity.js'
import { createYouTubeScheduleOptions } from '../../../domain/scheduled-post/value-objects/youtube-schedule-options.js'

const SCHEDULED_AT = new Date('2099-01-01T10:00:00.000Z')
const CREATED_AT = new Date('2026-07-30T08:00:00.000Z')

/// Ligne Prisma minimale, surchargeable champ par champ.
function row(overrides: Partial<PrismaScheduledPost> = {}): PrismaScheduledPost {
  return {
    id: 'b3f1c2d4-0000-0000-0000-000000000abc',
    userId: '00000000-0000-0000-0000-000000000001',
    platforms: ['FACEBOOK'],
    message: 'Bonjour',
    caption: null,
    imageUrl: null,
    videoUrl: null,
    platformOptions: null,
    scheduledAt: SCHEDULED_AT,
    status: 'SCHEDULED',
    attempts: 0,
    lastError: null,
    processedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  } as PrismaScheduledPost
}

describe('ScheduledPostMapper', () => {
  describe('Prisma → domaine', () => {
    it('traduit YOUTUBE en youtube', () => {
      const post = ScheduledPostMapper.toDomain(
        row({ platforms: ['YOUTUBE', 'FACEBOOK'] }),
      )

      expect(post.platforms).toEqual(['youtube', 'facebook'])
    })

    it('restaure platformOptions.youtube depuis le JSON', () => {
      const post = ScheduledPostMapper.toDomain(
        row({
          platformOptions: {
            youtube: {
              title: 'Ma vidéo',
              description: 'Description',
              tags: ['a', 'b'],
              categoryId: '22',
              privacyStatus: 'unlisted',
              madeForKids: true,
              notifySubscribers: false,
              accountId: '11111111-1111-1111-1111-111111111111',
            },
          },
        }),
      )

      expect(post.platformOptions?.youtube).toEqual({
        title: 'Ma vidéo',
        description: 'Description',
        tags: ['a', 'b'],
        categoryId: '22',
        privacyStatus: 'unlisted',
        madeForKids: true,
        notifySubscribers: false,
        accountId: '11111111-1111-1111-1111-111111111111',
      })
    })

    it('restaure null quand la colonne est NULL', () => {
      expect(ScheduledPostMapper.toDomain(row()).platformOptions).toBeNull()
    })

    it.each([
      ['un tableau', [] as unknown],
      ['une chaîne', 'oops' as unknown],
      ['un nombre', 42 as unknown],
      ['un objet sans réseau connu', { twitter: {} } as unknown],
      ['une valeur youtube non objet', { youtube: 'oops' } as unknown],
    ])('ignore un JSON inattendu (%s) et renvoie null', (_label, value) => {
      const post = ScheduledPostMapper.toDomain(
        row({ platformOptions: value as Prisma.JsonValue }),
      )

      expect(post.platformOptions).toBeNull()
    })

    it('préserve les absences d’une ligne héritée (aucun défaut inventé)', () => {
      const post = ScheduledPostMapper.toDomain(
        row({ platformOptions: { youtube: { description: 'seule' } } }),
      )

      // Seule la visibilité reçoit un défaut (la moins exposante). Titre et
      // déclaration COPPA restent ABSENTS : les inventer ferait mentir la donnée
      // persistée — la ligne échouera proprement à l'échéance.
      expect(post.platformOptions?.youtube).toEqual({
        privacyStatus: 'private',
        description: 'seule',
      })
    })

    it('écarte une visibilité inconnue au profit de private', () => {
      const post = ScheduledPostMapper.toDomain(
        row({ platformOptions: { youtube: { privacyStatus: 'secret' } } }),
      )

      expect(post.platformOptions?.youtube?.privacyStatus).toBe('private')
    })

    it('ne partage aucune référence avec la ligne Prisma', () => {
      const source = row({
        platformOptions: { youtube: { title: 'T', tags: ['a'] } },
      })
      const post = ScheduledPostMapper.toDomain(source)

      post.platformOptions?.youtube?.tags?.push('injecté')

      expect(
        (source.platformOptions as { youtube: { tags: string[] } }).youtube.tags,
      ).toEqual(['a'])
    })
  })

  describe('domaine → Prisma', () => {
    it('traduit youtube en YOUTUBE', () => {
      const post = ScheduledPost.schedule({
        userId: 'user-1',
        platforms: ['youtube', 'linkedin'],
        scheduledAt: SCHEDULED_AT,
      })

      expect(ScheduledPostMapper.toPersistence(post).platforms).toEqual([
        'YOUTUBE',
        'LINKEDIN',
      ])
    })

    it('sérialise platformOptions en objet JSON simple', () => {
      const post = ScheduledPost.schedule({
        userId: 'user-1',
        platforms: ['facebook'],
        scheduledAt: SCHEDULED_AT,
        platformOptions: {
          youtube: createYouTubeScheduleOptions({
            title: 'Ma vidéo',
            tags: ['a'],
            privacyStatus: 'public',
            madeForKids: false,
          }),
        },
      })

      expect(ScheduledPostMapper.toPersistence(post).platformOptions).toEqual({
        youtube: {
          title: 'Ma vidéo',
          privacyStatus: 'public',
          madeForKids: false,
          tags: ['a'],
        },
      })
    })

    it('écrit un VRAI NULL SQL (Prisma.DbNull) en l’absence d’options', () => {
      const post = ScheduledPost.schedule({
        userId: 'user-1',
        platforms: ['facebook'],
        scheduledAt: SCHEDULED_AT,
      })

      expect(ScheduledPostMapper.toPersistence(post).platformOptions).toBe(
        Prisma.DbNull,
      )
    })
  })

  describe('aller-retour', () => {
    it('conserve la plateforme et les options', () => {
      const original = ScheduledPost.schedule({
        userId: '00000000-0000-0000-0000-000000000001',
        platforms: ['youtube'],
        scheduledAt: SCHEDULED_AT,
        videoUrl: 'https://example.test/clip.mp4',
        platformOptions: {
          youtube: createYouTubeScheduleOptions({
            title: 'Aller-retour',
            tags: ['x', 'y'],
            privacyStatus: 'unlisted',
            madeForKids: true,
            containsSyntheticMedia: true,
          }),
        },
      })

      const persisted = ScheduledPostMapper.toPersistence(original)
      const restored = ScheduledPostMapper.toDomain(
        row({
          platforms: persisted.platforms,
          videoUrl: persisted.videoUrl,
          platformOptions: persisted.platformOptions as Prisma.JsonValue,
        }),
      )

      expect(restored.platforms).toEqual(['youtube'])
      expect(restored.platformOptions).toEqual(original.platformOptions)
    })
  })
})
