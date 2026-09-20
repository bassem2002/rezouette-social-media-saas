import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalMediaStorageService } from './local-media-storage.service.js'
import { MediaAccessError } from '../../application/media/errors/media-access.error.js'
import { TEMP_UPLOAD_SUBDIR } from '../../config/media.config.js'

const PUBLIC_BASE_URL = 'https://api.zernio.test'
const VIDEO_BYTES = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz')

function makeService(uploadsRoot: string) {
  const config = {
    getOrThrow: () => ({
      publicBaseUrl: PUBLIC_BASE_URL,
      uploadsRoot,
      socialSubdir: 'social',
      allowedImageMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      allowedVideoMimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
      maxImageBytes: 10 * 1024 * 1024,
      maxVideoBytes: 100 * 1024 * 1024,
    }),
  } as never
  return new LocalMediaStorageService(config)
}

/// Consomme un flux en Buffer — uniquement pour VÉRIFIER le contenu d'une
/// petite tranche de test ; le code de production ne fait jamais cela.
async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function codeOf(err: unknown): string {
  return (err as MediaAccessError).code
}

describe('LocalMediaStorageService — lecture sécurisée', () => {
  let uploadsRoot: string
  let service: LocalMediaStorageService
  let videoPath: string

  beforeEach(() => {
    uploadsRoot = mkdtempSync(join(tmpdir(), 'zernio-uploads-'))
    mkdirSync(join(uploadsRoot, 'social', '2026', '08'), { recursive: true })
    videoPath = join(uploadsRoot, 'social', '2026', '08', 'clip.mp4')
    writeFileSync(videoPath, VIDEO_BYTES)
    service = makeService(uploadsRoot)
  })

  afterEach(() => {
    rmSync(uploadsRoot, { recursive: true, force: true })
  })

  describe('résolution valide', () => {
    it('résout une URL publique absolue', async () => {
      const media = await service.resolvePublicUrl(
        `${PUBLIC_BASE_URL}/uploads/social/2026/08/clip.mp4`,
      )

      expect(media.size).toBe(VIDEO_BYTES.length)
      expect(media.mimeType).toBe('video/mp4')
      expect(media.filename).toBe('clip.mp4')
      expect(media.ref).toBe('social/2026/08/clip.mp4')
    })

    it('résout un chemin relatif /uploads/...', async () => {
      const media = await service.resolvePublicUrl('/uploads/social/2026/08/clip.mp4')

      expect(media.ref).toBe('social/2026/08/clip.mp4')
      expect(media.size).toBe(VIDEO_BYTES.length)
    })

    it('ignore query string et fragment', async () => {
      const media = await service.resolvePublicUrl(
        '/uploads/social/2026/08/clip.mp4?v=1#t=10',
      )

      expect(media.filename).toBe('clip.mp4')
    })

    it('ne renvoie JAMAIS de chemin absolu dans la référence', async () => {
      const media = await service.resolvePublicUrl('/uploads/social/2026/08/clip.mp4')

      expect(media.ref).not.toContain(uploadsRoot)
      expect(media.ref.startsWith('/')).toBe(false)
    })
  })

  describe('lecture par plages', () => {
    it('lit la première plage', async () => {
      const { ref } = await service.resolvePublicUrl('/uploads/social/2026/08/clip.mp4')

      const bytes = await readStream(await service.openRange(ref, 0, 9))
      expect(bytes.toString()).toBe('0123456789')
    })

    it('lit une plage centrale', async () => {
      const { ref } = await service.resolvePublicUrl('/uploads/social/2026/08/clip.mp4')

      const bytes = await readStream(await service.openRange(ref, 10, 14))
      expect(bytes.toString()).toBe('abcde')
    })

    it('lit la dernière plage', async () => {
      const { ref, size } = await service.resolvePublicUrl(
        '/uploads/social/2026/08/clip.mp4',
      )

      const bytes = await readStream(await service.openRange(ref, size - 3, size - 1))
      expect(bytes.toString()).toBe('xyz')
    })

    it('reconstitue exactement le fichier bloc par bloc', async () => {
      const { ref, size } = await service.resolvePublicUrl(
        '/uploads/social/2026/08/clip.mp4',
      )

      const parts: Buffer[] = []
      for (let start = 0; start < size; start += 10) {
        const end = Math.min(start + 9, size - 1)
        parts.push(await readStream(await service.openRange(ref, start, end)))
      }
      expect(Buffer.concat(parts).equals(VIDEO_BYTES)).toBe(true)
    })

    it.each([
      ['plage négative', -1, 5],
      ['start > end', 10, 5],
      ['end hors fichier', 0, VIDEO_BYTES.length],
      ['bornes non entières', 0.5, 5],
    ])('refuse une %s', async (_label, start, end) => {
      const { ref } = await service.resolvePublicUrl('/uploads/social/2026/08/clip.mp4')

      await expect(service.openRange(ref, start, end)).rejects.toMatchObject({
        code: 'invalid_media_range',
      })
    })

    it('refuse une référence qui tente de sortir de la racine', async () => {
      await expect(
        service.openRange('../../../etc/passwd', 0, 1),
      ).rejects.toMatchObject({ code: 'media_not_managed_by_zernio' })
    })
  })

  describe('refus des médias non gérés', () => {
    it.each([
      ['URL externe', 'https://example.com/video.mp4'],
      ['autre origine', 'https://evil.test/uploads/social/2026/08/clip.mp4'],
      ['schéma file', 'file:///etc/passwd'],
      ['schéma ftp', 'ftp://host/video.mp4'],
      ['localhost fourni par le client', 'http://localhost:3000/uploads/social/2026/08/clip.mp4'],
      ['IP interne', 'http://169.254.169.254/uploads/social/x.mp4'],
      ['hors /uploads', `${PUBLIC_BASE_URL}/private/secret.mp4`],
      ['URL invalide', 'pas-une-url'],
      ['chaîne vide', ''],
    ])('refuse %s', async (_label, url) => {
      await expect(service.resolvePublicUrl(url)).rejects.toMatchObject({
        code: 'media_not_managed_by_zernio',
      })
    })

    it.each([
      ['traversée ../', '/uploads/../../../etc/passwd'],
      ['traversée encodée', '/uploads/%2e%2e/%2e%2e/etc/passwd'],
      ['traversée doublement encodée', '/uploads/social/..%2f..%2fetc%2fpasswd'],
      ['antislash Windows', '/uploads/social\\..\\..\\windows\\system32'],
      ['segment courant', '/uploads/./social/2026/08/clip.mp4'],
      ['caractère NUL encodé', '/uploads/social/clip.mp4%00.txt'],
      ['racine seule', '/uploads/'],
      ['répertoire temporaire', `/uploads/${TEMP_UPLOAD_SUBDIR}/abcdef`],
    ])('refuse %s', async (_label, url) => {
      await expect(service.resolvePublicUrl(url)).rejects.toMatchObject({
        code: 'media_not_managed_by_zernio',
      })
    })

    it('refuse un répertoire au lieu d’un fichier', async () => {
      await expect(
        service.resolvePublicUrl('/uploads/social/2026'),
      ).rejects.toMatchObject({ code: 'media_not_found' })
    })

    it('refuse un fichier inexistant', async () => {
      await expect(
        service.resolvePublicUrl('/uploads/social/2026/08/absent.mp4'),
      ).rejects.toMatchObject({ code: 'media_not_found' })
    })

    it('refuse un fichier vide', async () => {
      const emptyPath = join(uploadsRoot, 'social', '2026', '08', 'empty.mp4')
      writeFileSync(emptyPath, '')

      await expect(
        service.resolvePublicUrl('/uploads/social/2026/08/empty.mp4'),
      ).rejects.toMatchObject({ code: 'empty_media' })
    })

    it('refuse une extension non reconnue', async () => {
      writeFileSync(join(uploadsRoot, 'social', '2026', '08', 'doc.pdf'), 'data')

      await expect(
        service.resolvePublicUrl('/uploads/social/2026/08/doc.pdf'),
      ).rejects.toMatchObject({ code: 'invalid_media_type' })
    })

    it('refuse un lien symbolique sortant de la racine', async () => {
      const outside = mkdtempSync(join(tmpdir(), 'zernio-outside-'))
      const secret = join(outside, 'secret.mp4')
      writeFileSync(secret, 'contenu confidentiel')
      const linkPath = join(uploadsRoot, 'social', '2026', '08', 'link.mp4')
      try {
        symlinkSync(secret, linkPath)
      } catch {
        // Windows sans privilège de création de lien : test non applicable.
        rmSync(outside, { recursive: true, force: true })
        return
      }

      try {
        await expect(
          service.resolvePublicUrl('/uploads/social/2026/08/link.mp4'),
        ).rejects.toMatchObject({ code: 'media_not_managed_by_zernio' })
      } finally {
        rmSync(outside, { recursive: true, force: true })
      }
    })

    it("n'expose jamais le chemin absolu dans le message d'erreur", async () => {
      for (const url of [
        'https://example.com/video.mp4',
        '/uploads/social/2026/08/absent.mp4',
        '/uploads/../../../etc/passwd',
      ]) {
        try {
          await service.resolvePublicUrl(url)
          throw new Error('aurait dû lever')
        } catch (err) {
          const message = (err as Error).message
          expect(message).not.toContain(uploadsRoot)
          expect(message).not.toContain(tmpdir())
          expect(codeOf(err)).toEqual(expect.any(String))
        }
      }
    })
  })
})

describe('LocalMediaStorageService — écriture par déplacement', () => {
  let uploadsRoot: string
  let service: LocalMediaStorageService
  let tempDir: string

  beforeEach(() => {
    uploadsRoot = mkdtempSync(join(tmpdir(), 'zernio-uploads-'))
    tempDir = join(uploadsRoot, TEMP_UPLOAD_SUBDIR)
    mkdirSync(tempDir, { recursive: true })
    service = makeService(uploadsRoot)
    process.env['UPLOADS_DIR'] = uploadsRoot
  })

  afterEach(() => {
    delete process.env['UPLOADS_DIR']
    rmSync(uploadsRoot, { recursive: true, force: true })
  })

  it('déplace le fichier temporaire et renvoie une URL publique', async () => {
    const temporaryPath = join(tempDir, 'abcdef0123456789')
    writeFileSync(temporaryPath, VIDEO_BYTES)

    const stored = await service.save({
      temporaryPath,
      mimeType: 'video/mp4',
      originalName: 'ma video.mp4',
      mediaType: 'video',
    })

    expect(stored.url).toMatch(
      new RegExp(`^${PUBLIC_BASE_URL}/uploads/social/\\d{4}/\\d{2}/[0-9a-f-]+\\.mp4$`),
    )
    expect(stored.size).toBe(VIDEO_BYTES.length)
    expect(stored.mediaType).toBe('video')
    // Le temporaire a bien disparu (déplacement, pas copie).
    expect(existsSync(temporaryPath)).toBe(false)
  })

  it('ignore le nom client malveillant pour composer le chemin final', async () => {
    const temporaryPath = join(tempDir, 'fedcba9876543210')
    writeFileSync(temporaryPath, VIDEO_BYTES)

    const stored = await service.save({
      temporaryPath,
      mimeType: 'video/mp4',
      originalName: '../../../../etc/passwd.mp4',
      mediaType: 'video',
    })

    expect(stored.filename).not.toContain('..')
    expect(stored.filename).not.toContain('passwd')
    expect(stored.url).not.toContain('..')
  })

  it('le média stocké est immédiatement relisible par plages', async () => {
    const temporaryPath = join(tempDir, '0011223344556677')
    writeFileSync(temporaryPath, VIDEO_BYTES)

    const stored = await service.save({
      temporaryPath,
      mimeType: 'video/mp4',
      originalName: 'clip.mp4',
      mediaType: 'video',
    })
    const media = await service.resolvePublicUrl(stored.url)
    const bytes = await readStream(await service.openRange(media.ref, 0, 4))

    expect(media.size).toBe(VIDEO_BYTES.length)
    expect(bytes.toString()).toBe('01234')
  })

  describe('discardTemporary', () => {
    it('supprime un fichier du répertoire temporaire', async () => {
      const temporaryPath = join(tempDir, 'aaaabbbbccccdddd')
      writeFileSync(temporaryPath, 'x')

      await service.discardTemporary(temporaryPath)

      expect(existsSync(temporaryPath)).toBe(false)
    })

    it('REFUSE de supprimer un fichier hors du répertoire temporaire', async () => {
      const outside = join(uploadsRoot, 'social', 'precieux.mp4')
      mkdirSync(join(uploadsRoot, 'social'), { recursive: true })
      writeFileSync(outside, 'contenu')

      await service.discardTemporary(outside)

      // Le fichier est intact : ce nettoyage n'est pas une primitive de
      // suppression arbitraire.
      expect(existsSync(outside)).toBe(true)
    })

    it('refuse une traversée depuis le répertoire temporaire', async () => {
      const outside = join(uploadsRoot, 'social', 'cible.mp4')
      mkdirSync(join(uploadsRoot, 'social'), { recursive: true })
      writeFileSync(outside, 'contenu')

      await service.discardTemporary(join(tempDir, '..', 'social', 'cible.mp4'))

      expect(existsSync(outside)).toBe(true)
    })

    it('ne lève pas si le fichier a déjà disparu', async () => {
      await expect(
        service.discardTemporary(join(tempDir, 'inexistant')),
      ).resolves.toBeUndefined()
    })
  })
})
