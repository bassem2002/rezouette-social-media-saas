import { ScheduledPost } from '../../domain/scheduled-post/entities/scheduled-post.entity.js'
import { createYouTubeScheduleOptions } from '../../domain/scheduled-post/value-objects/youtube-schedule-options.js'
import { toScheduledPostResponse } from './scheduled-post.presenter.js'

const SCHEDULED_AT = new Date('2099-01-01T10:00:00.000Z')

describe('toScheduledPostResponse', () => {
  it('expose YOUTUBE en majuscules', () => {
    const post = ScheduledPost.schedule({
      userId: 'user-1',
      platforms: ['youtube', 'facebook'],
      scheduledAt: SCHEDULED_AT,
    })

    expect(toScheduledPostResponse(post).platforms).toEqual([
      'YOUTUBE',
      'FACEBOOK',
    ])
  })

  it('renvoie platformOptions à null quand aucune option n’est fournie', () => {
    const post = ScheduledPost.schedule({
      userId: 'user-1',
      platforms: ['facebook'],
      scheduledAt: SCHEDULED_AT,
      message: 'Bonjour',
    })

    const response = toScheduledPostResponse(post)
    expect(response.platformOptions).toBeNull()
    // Compatibilité : le reste de la réponse est inchangé.
    expect(response.message).toBe('Bonjour')
    expect(response.videoUrl).toBeNull()
    expect(response.status).toBe('SCHEDULED')
  })

  it('projette les options YouTube en normalisant les champs absents', () => {
    const post = ScheduledPost.schedule({
      userId: 'user-1',
      platforms: ['facebook'],
      scheduledAt: SCHEDULED_AT,
      platformOptions: {
        youtube: createYouTubeScheduleOptions({
          title: 'Ma vidéo',
          privacyStatus: 'unlisted',
          madeForKids: true,
        }),
      },
    })

    expect(toScheduledPostResponse(post).platformOptions).toEqual({
      youtube: {
        title: 'Ma vidéo',
        description: null,
        tags: [],
        categoryId: null,
        privacyStatus: 'unlisted',
        madeForKids: true,
        containsSyntheticMedia: null,
        notifySubscribers: null,
        accountId: null,
      },
    })
  })

  it('recopie les tags sans partager la référence du domaine', () => {
    const post = ScheduledPost.schedule({
      userId: 'user-1',
      platforms: ['facebook'],
      scheduledAt: SCHEDULED_AT,
      platformOptions: {
        youtube: createYouTubeScheduleOptions({ title: 'T', tags: ['a'] }),
      },
    })

    const response = toScheduledPostResponse(post)
    response.platformOptions?.youtube?.tags.push('injecté')

    expect(post.platformOptions?.youtube?.tags).toEqual(['a'])
  })
})
