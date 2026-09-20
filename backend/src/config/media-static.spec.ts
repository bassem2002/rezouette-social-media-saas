import { join } from 'node:path'
import {
  PUBLIC_SOCIAL_PREFIX,
  PUBLIC_UPLOADS_PREFIX,
  SOCIAL_MEDIA_SUBDIR,
  TEMP_UPLOAD_SUBDIR,
  resolveStaticAssetsPrefix,
  resolveStaticAssetsRoot,
  resolveTempUploadDir,
  resolveUploadsRoot,
} from './media.config.js'

const UPLOADS_DIR = join('C:', 'zernio', 'uploads')

describe('Exposition statique des médias', () => {
  const previous = process.env['UPLOADS_DIR']

  beforeEach(() => {
    process.env['UPLOADS_DIR'] = UPLOADS_DIR
  })

  afterEach(() => {
    if (previous === undefined) delete process.env['UPLOADS_DIR']
    else process.env['UPLOADS_DIR'] = previous
  })

  it('ne sert QUE uploads/social, jamais la racine des uploads', () => {
    expect(resolveStaticAssetsRoot()).toBe(join(UPLOADS_DIR, SOCIAL_MEDIA_SUBDIR))
    expect(resolveStaticAssetsRoot()).not.toBe(resolveUploadsRoot())
  })

  it('place uploads/.tmp HORS de la racine servie', () => {
    const staticRoot = resolveStaticAssetsRoot()
    const tempDir = resolveTempUploadDir()

    // Le temporaire reste sous uploadsRoot (rename atomique préservé)…
    expect(tempDir).toBe(join(UPLOADS_DIR, TEMP_UPLOAD_SUBDIR))
    // …mais il n'est pas atteignable depuis la racine statique.
    expect(tempDir.startsWith(staticRoot)).toBe(false)
  })

  it('conserve le préfixe public historique /uploads/social/', () => {
    expect(resolveStaticAssetsPrefix()).toBe('/uploads/social/')
    expect(PUBLIC_SOCIAL_PREFIX).toBe(
      `${PUBLIC_UPLOADS_PREFIX}${SOCIAL_MEDIA_SUBDIR}/`,
    )
  })

  it('laisse les URL déjà distribuées inchangées', () => {
    // Forme historique : racine + préfixe reconstituent exactement le chemin.
    const historicalUrl = '/uploads/social/2026/08/uuid.mp4'

    expect(historicalUrl.startsWith(resolveStaticAssetsPrefix())).toBe(true)
    const relative = historicalUrl.slice(resolveStaticAssetsPrefix().length)
    expect(join(resolveStaticAssetsRoot(), ...relative.split('/'))).toBe(
      join(UPLOADS_DIR, 'social', '2026', '08', 'uuid.mp4'),
    )
  })

  it("aucune URL /uploads/.tmp/... n'est couverte par le préfixe public", () => {
    expect(
      `/uploads/${TEMP_UPLOAD_SUBDIR}/abcdef`.startsWith(
        resolveStaticAssetsPrefix(),
      ),
    ).toBe(false)
  })

  it('main.ts et le stockage dérivent de la MÊME racine', () => {
    // Une seule source : changer UPLOADS_DIR déplace les deux ensemble.
    process.env['UPLOADS_DIR'] = join('D:', 'autre')

    expect(resolveStaticAssetsRoot()).toBe(join('D:', 'autre', 'social'))
    expect(resolveTempUploadDir()).toBe(join('D:', 'autre', '.tmp'))
  })
})
