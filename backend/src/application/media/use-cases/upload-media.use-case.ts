import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  MEDIA_STORAGE,
  type MediaStorageGateway,
  type StoredMedia,
} from '../ports/media-storage.gateway.js'
import {
  MediaConfig,
  isLocalUrl,
  resolveMediaKind,
} from '../../../config/media.config.js'

/// Fichier uploadé, écrit SUR DISQUE par le pipeline multipart (sous-ensemble de
/// l'objet Multer réellement utilisé — évite la dépendance @types/multer).
///
/// ⚠️ Il n'y a volontairement PAS de champ `buffer` : une vidéo ne doit jamais
/// être chargée entièrement en mémoire. Le média est désigné par son chemin
/// temporaire, puis DÉPLACÉ par le stockage.
export interface UploadedMediaFile {
  originalname: string
  mimetype: string
  size: number
  /// Chemin du fichier temporaire écrit par multer.
  path: string
}

/// Valide le fichier (présence, format, taille selon la nature image/vidéo) puis
/// délègue le stockage au port. Seule source de vérité de la validation upload —
/// gère images et vidéos via le même chemin, sans duplication.
///
/// Tout refus supprime le fichier temporaire : aucun orphelin ne subsiste.
@Injectable()
export class UploadMediaUseCase {
  private readonly logger = new Logger(UploadMediaUseCase.name)

  constructor(
    @Inject(MEDIA_STORAGE)
    private readonly storage: MediaStorageGateway,
    private readonly config: ConfigService,
  ) {}

  async execute(file: UploadedMediaFile | undefined): Promise<StoredMedia> {
    const cfg = this.config.getOrThrow<MediaConfig>('media')

    if (!file) {
      throw new BadRequestException('Fichier requis (champ "file").')
    }

    const kind = resolveMediaKind(file.mimetype, cfg)
    if (!kind) {
      await this.storage.discardTemporary(file.path)
      throw new BadRequestException(
        'Format non supporté. Images : JPEG, PNG, WEBP. Vidéos : MP4, MOV, WEBM.',
      )
    }

    const maxBytes = kind === 'image' ? cfg.maxImageBytes : cfg.maxVideoBytes
    if (file.size > maxBytes) {
      await this.storage.discardTemporary(file.path)
      const maxMb = Math.round(maxBytes / (1024 * 1024))
      throw new PayloadTooLargeException(
        `Fichier trop volumineux (maximum ${maxMb} Mo pour une ${kind === 'image' ? 'image' : 'vidéo'}).`,
      )
    }

    let stored: StoredMedia
    try {
      stored = await this.storage.save({
        temporaryPath: file.path,
        mimeType: file.mimetype,
        originalName: file.originalname,
        mediaType: kind,
      })
    } catch (err) {
      // Le déplacement a échoué : le temporaire est encore là, on le retire.
      await this.storage.discardTemporary(file.path)
      throw err
    }

    // Une URL localhost/127.0.0.1/::1 n'est pas téléchargeable par Meta →
    // publication Facebook/Instagram vouée à l'échec (codes 324 et 9004, dont
    // les messages ne désignent jamais la vraie cause). TikTok, LinkedIn et
    // YouTube n'y sont plus sensibles : Zernio leur pousse les octets.
    //
    // En production, c'est une erreur d'exploitation → on bloque. En
    // développement, l'URL locale est le fonctionnement NORMAL : on avertit une
    // fois à l'upload, plutôt que de laisser la surprise arriver deux écrans
    // plus loin sous la forme d'une publication échouée.
    if (isLocalUrl(stored.url)) {
      if (process.env['NODE_ENV'] === 'production') {
        throw new InternalServerErrorException(
          "URL d'upload non publique en production. Configurez PUBLIC_BASE_URL " +
            'avec une URL accessible par Meta (ex. https://api.zernio.com).',
        )
      }
      this.logger.warn(
        'Média stocké sous une URL locale : Facebook et Instagram ne pourront ' +
          'pas la télécharger et refuseront la publication. Exposez le backend ' +
          '(tunnel HTTPS) et renseignez PUBLIC_BASE_URL pour les tester.',
      )
    }

    return stored
  }
}
