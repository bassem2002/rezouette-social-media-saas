import { ScheduledPost } from './scheduled-post.entity.js'
import type { ScheduledPlatformOptions } from '../value-objects/scheduled-platform-options.js'
import { createYouTubeScheduleOptions } from '../value-objects/youtube-schedule-options.js'

const FUTURE = new Date('2099-01-01T10:00:00.000Z')

function youtubeOptions(): ScheduledPlatformOptions {
  return {
    youtube: createYouTubeScheduleOptions({
      title: 'Ma vidéo',
      description: 'Description',
      tags: ['zernio', 'saas'],
      categoryId: '22',
      privacyStatus: 'unlisted',
      madeForKids: false,
      notifySubscribers: true,
    }),
  }
}

describe('ScheduledPost — platformOptions', () => {
  describe('comportement historique (sans options)', () => {
    it('planifie sans platformOptions : le champ vaut null', () => {
      const post = ScheduledPost.schedule({
        userId: 'user-1',
        platforms: ['facebook'],
        scheduledAt: FUTURE,
        message: 'Bonjour',
      })

      expect(post.platformOptions).toBeNull()
      expect(post.platforms).toEqual(['facebook'])
      expect(post.message).toBe('Bonjour')
      expect(post.status).toBe('scheduled')
      expect(post.attempts).toBe(0)
    })

    it('normalise un objet d’options vide en null (pas de JSON vide persisté)', () => {
      const post = ScheduledPost.schedule({
        userId: 'user-1',
        platforms: ['facebook'],
        scheduledAt: FUTURE,
        platformOptions: {},
      })

      expect(post.platformOptions).toBeNull()
    })

    it('traite null et undefined de la même façon', () => {
      const withNull = ScheduledPost.schedule({
        userId: 'user-1',
        platforms: ['facebook'],
        scheduledAt: FUTURE,
        platformOptions: null,
      })

      expect(withNull.platformOptions).toBeNull()
    })

    it('conserve les transitions d’état inchangées', () => {
      const post = ScheduledPost.schedule({
        userId: 'user-1',
        platforms: ['facebook'],
        scheduledAt: FUTURE,
        platformOptions: youtubeOptions(),
      })

      post.markProcessing()
      expect(post.status).toBe('processing')
      expect(post.attempts).toBe(1)

      post.markPublished()
      expect(post.status).toBe('published')
      // Les options survivent aux transitions.
      expect(post.platformOptions?.youtube?.title).toBe('Ma vidéo')
    })
  })

  describe('avec platformOptions.youtube', () => {
    it('conserve toutes les valeurs fournies', () => {
      const post = ScheduledPost.schedule({
        userId: 'user-1',
        platforms: ['facebook'],
        scheduledAt: FUTURE,
        platformOptions: youtubeOptions(),
      })

      const youtube = post.platformOptions?.youtube
      expect(youtube).toBeDefined()
      expect(youtube?.title).toBe('Ma vidéo')
      expect(youtube?.description).toBe('Description')
      expect(youtube?.tags).toEqual(['zernio', 'saas'])
      expect(youtube?.categoryId).toBe('22')
      expect(youtube?.privacyStatus).toBe('unlisted')
      expect(youtube?.madeForKids).toBe(false)
      expect(youtube?.notifySubscribers).toBe(true)
      expect(youtube?.containsSyntheticMedia).toBeUndefined()
    })

    it('applique le seul défaut sûr (visibilité privée) et PRÉSERVE les absences', () => {
      const post = ScheduledPost.schedule({
        userId: 'user-1',
        platforms: ['facebook'],
        scheduledAt: FUTURE,
        platformOptions: { youtube: createYouTubeScheduleOptions({}) },
      })

      const youtube = post.platformOptions?.youtube
      expect(youtube?.privacyStatus).toBe('private')
      // `madeForKids` est une DÉCLARATION LÉGALE : son absence n'est jamais
      // comblée par `false`, et le titre n'est jamais inventé.
      expect(youtube?.madeForKids).toBeUndefined()
      expect(youtube?.title).toBeUndefined()
    })
  })

  describe('copies défensives', () => {
    it("muter l'objet passé en entrée n'altère pas l'entité", () => {
      const input = youtubeOptions()
      const post = ScheduledPost.schedule({
        userId: 'user-1',
        platforms: ['facebook'],
        scheduledAt: FUTURE,
        platformOptions: input,
      })

      input.youtube!.title = 'Titre pirate'
      input.youtube!.tags!.push('injecté')
      delete input.youtube

      expect(post.platformOptions?.youtube?.title).toBe('Ma vidéo')
      expect(post.platformOptions?.youtube?.tags).toEqual(['zernio', 'saas'])
    })

    it("muter l'objet renvoyé par le getter n'altère pas l'entité", () => {
      const post = ScheduledPost.schedule({
        userId: 'user-1',
        platforms: ['facebook'],
        scheduledAt: FUTURE,
        platformOptions: youtubeOptions(),
      })

      const leaked = post.platformOptions
      leaked!.youtube!.title = 'Titre pirate'
      leaked!.youtube!.tags!.push('injecté')

      expect(post.platformOptions?.youtube?.title).toBe('Ma vidéo')
      expect(post.platformOptions?.youtube?.tags).toEqual(['zernio', 'saas'])
    })

    it('renvoie une nouvelle référence à chaque lecture', () => {
      const post = ScheduledPost.schedule({
        userId: 'user-1',
        platforms: ['facebook'],
        scheduledAt: FUTURE,
        platformOptions: youtubeOptions(),
      })

      expect(post.platformOptions).not.toBe(post.platformOptions)
      expect(post.platformOptions).toEqual(post.platformOptions)
    })
  })

  describe('plateforme youtube dans le domaine', () => {
    it('accepte youtube comme plateforme planifiable (type domaine)', () => {
      const post = ScheduledPost.schedule({
        userId: 'user-1',
        platforms: ['youtube'],
        scheduledAt: FUTURE,
        videoUrl: 'https://example.test/uploads/clip.mp4',
      })

      expect(post.platforms).toEqual(['youtube'])
    })
  })
})
