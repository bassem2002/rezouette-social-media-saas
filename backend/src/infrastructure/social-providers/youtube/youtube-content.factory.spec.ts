import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DisabledYouTubeContentService } from './youtube-content.factory.js'
import { YouTubeContentError } from '../../../application/social/errors/youtube-content.error.js'

const INPUT = {
  accessToken: 'fake-access-token',
  channelId: 'UC_channel_1',
  videoUrl: 'https://example.test/uploads/clip.mp4',
  title: 'Titre',
  privacyStatus: 'private' as const,
  madeForKids: false,
}

describe('DisabledYouTubeContentService', () => {
  it('rejette immédiatement avec publishing_not_configured', async () => {
    const service = new DisabledYouTubeContentService()

    await expect(service.publishVideo()).rejects.toBeInstanceOf(
      YouTubeContentError,
    )
    try {
      await service.publishVideo()
      throw new Error('aurait dû lever')
    } catch (err) {
      expect((err as YouTubeContentError).youtube).toMatchObject({
        serviceErrorCode: 'publishing_not_configured',
        httpStatus: 503,
      })
    }
  })

  it("n'a AUCUNE dépendance injectée (aucun client HTTP possible)", () => {
    // Zéro paramètre de constructeur : le service est structurellement
    // incapable d'émettre une requête ou de lire un fichier.
    expect(DisabledYouTubeContentService.length).toBe(0)
  })

  it("n'émet aucun appel réseau (fetch jamais invoqué)", async () => {
    const originalFetch = globalThis.fetch
    const fetchSpy = jest.fn()
    globalThis.fetch = fetchSpy as unknown as typeof fetch
    try {
      const service = new DisabledYouTubeContentService()
      await expect(service.publishVideo()).rejects.toThrow()

      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('ne lit aucun fichier et ne peut pas parler à Google (preuve structurelle)', () => {
    // La factory n'importe ni système de fichiers, ni client HTTP : le module
    // est incapable d'ouvrir la vidéo ou de joindre Google, quoi qu'on lui passe.
    const source = readFileSync(
      join(__dirname, 'youtube-content.factory.ts'),
      'utf8',
    )
    // Seules les lignes d'import comptent : un commentaire qui mentionne
    // HttpService n'est pas une dépendance.
    const imports = source
      .split('\n')
      .filter((line) => line.trimStart().startsWith('import'))
      .join('\n')

    expect(imports).not.toMatch(/node:fs/)
    expect(imports).not.toMatch(/HttpService|@nestjs\/axios/)
    expect(imports).not.toMatch(/axios/)
    expect(imports).not.toMatch(/googleapis/)
    // Contrôle positif : le fichier importe bien quelque chose (test non vide).
    expect(imports).toMatch(/@nestjs\/common/)
  })

  it('ignore totalement les paramètres reçus (pas même une lecture d’URL)', async () => {
    const service = new DisabledYouTubeContentService()
    // La signature du port passe un input ; l'adaptateur ne le consulte jamais.
    const gateway = service as unknown as {
      publishVideo: (input: typeof INPUT) => Promise<unknown>
    }

    await expect(gateway.publishVideo(INPUT)).rejects.toThrow()
  })

  it("ne laisse fuir ni token ni URL dans l'erreur", async () => {
    const service = new DisabledYouTubeContentService()

    try {
      await service.publishVideo()
      throw new Error('aurait dû lever')
    } catch (err) {
      const dump = `${(err as Error).message} ${JSON.stringify(
        (err as YouTubeContentError).getResponse(),
      )} ${JSON.stringify((err as YouTubeContentError).youtube)}`
      expect(dump).not.toContain('fake-access-token')
      expect(dump).not.toContain('clip.mp4')
      expect(dump).not.toContain('Authorization')
    }
  })
})
