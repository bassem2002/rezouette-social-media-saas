import { BadRequestException, PayloadTooLargeException } from '@nestjs/common'
import {
  UploadMediaUseCase,
  type UploadedMediaFile,
} from './upload-media.use-case.js'

const MEDIA_CONFIG = {
  publicBaseUrl: 'https://api.zernio.test',
  uploadsRoot: '/tmp/uploads',
  socialSubdir: 'social',
  allowedImageMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  allowedVideoMimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
  maxImageBytes: 10 * 1024 * 1024,
  maxVideoBytes: 100 * 1024 * 1024,
}

function file(overrides: Partial<UploadedMediaFile> = {}): UploadedMediaFile {
  return {
    originalname: 'clip.mp4',
    mimetype: 'video/mp4',
    size: 1024,
    path: '/tmp/uploads/.tmp/abcdef0123456789',
    ...overrides,
  }
}

function makeUseCase(saveImpl?: jest.Mock) {
  const storage = {
    save:
      saveImpl ??
      jest.fn().mockResolvedValue({
        url: 'https://api.zernio.test/uploads/social/2026/08/uuid.mp4',
        filename: 'uuid.mp4',
        size: 1024,
        mediaType: 'video',
      }),
    discardTemporary: jest.fn().mockResolvedValue(undefined),
  }
  const config = { getOrThrow: () => MEDIA_CONFIG } as never
  return { useCase: new UploadMediaUseCase(storage as never, config), storage }
}

describe('UploadMediaUseCase — pipeline disque', () => {
  it('ne reçoit AUCUN buffer : le média est désigné par son chemin temporaire', () => {
    // Contrat structurel : le type d'entrée n'a pas de champ `buffer`, donc
    // aucune vidéo ne peut transiter en mémoire par ce chemin.
    const uploaded = file()

    expect('buffer' in uploaded).toBe(false)
    expect(uploaded.path).toContain('.tmp')
  })

  it('transmet le chemin temporaire au stockage', async () => {
    const { useCase, storage } = makeUseCase()

    const stored = await useCase.execute(file())

    expect(storage.save).toHaveBeenCalledWith({
      temporaryPath: '/tmp/uploads/.tmp/abcdef0123456789',
      mimeType: 'video/mp4',
      originalName: 'clip.mp4',
      mediaType: 'video',
    })
    // Réponse publique inchangée.
    expect(stored).toEqual({
      url: 'https://api.zernio.test/uploads/social/2026/08/uuid.mp4',
      filename: 'uuid.mp4',
      size: 1024,
      mediaType: 'video',
    })
  })

  it('accepte toujours une image', async () => {
    const { useCase, storage } = makeUseCase()

    await useCase.execute(
      file({ mimetype: 'image/png', originalname: 'photo.png', size: 2048 }),
    )

    expect(storage.save).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'image' }),
    )
    expect(storage.discardTemporary).not.toHaveBeenCalled()
  })

  it('rejette un fichier absent', async () => {
    const { useCase, storage } = makeUseCase()

    await expect(useCase.execute(undefined)).rejects.toThrow(BadRequestException)
    expect(storage.discardTemporary).not.toHaveBeenCalled()
  })
})

describe('UploadMediaUseCase — nettoyage du temporaire', () => {
  it('supprime le temporaire quand le format est refusé', async () => {
    const { useCase, storage } = makeUseCase()

    await expect(
      useCase.execute(file({ mimetype: 'application/pdf' })),
    ).rejects.toThrow(BadRequestException)

    expect(storage.discardTemporary).toHaveBeenCalledWith(
      '/tmp/uploads/.tmp/abcdef0123456789',
    )
    expect(storage.save).not.toHaveBeenCalled()
  })

  it('supprime le temporaire quand la taille dépasse la limite vidéo', async () => {
    const { useCase, storage } = makeUseCase()

    await expect(
      useCase.execute(file({ size: MEDIA_CONFIG.maxVideoBytes + 1 })),
    ).rejects.toThrow(PayloadTooLargeException)

    expect(storage.discardTemporary).toHaveBeenCalledTimes(1)
    expect(storage.save).not.toHaveBeenCalled()
  })

  it('supprime le temporaire quand la taille dépasse la limite image', async () => {
    const { useCase, storage } = makeUseCase()

    await expect(
      useCase.execute(
        file({ mimetype: 'image/jpeg', size: MEDIA_CONFIG.maxImageBytes + 1 }),
      ),
    ).rejects.toThrow(PayloadTooLargeException)

    expect(storage.discardTemporary).toHaveBeenCalledTimes(1)
  })

  it('supprime le temporaire quand le stockage échoue', async () => {
    const { useCase, storage } = makeUseCase(
      jest.fn().mockRejectedValue(new Error('disque plein')),
    )

    await expect(useCase.execute(file())).rejects.toThrow('disque plein')

    expect(storage.discardTemporary).toHaveBeenCalledWith(
      '/tmp/uploads/.tmp/abcdef0123456789',
    )
  })

  it('ne supprime rien quand tout se passe bien', async () => {
    const { useCase, storage } = makeUseCase()

    await useCase.execute(file())

    // Le déplacement a consommé le temporaire : rien à nettoyer.
    expect(storage.discardTemporary).not.toHaveBeenCalled()
  })
})
