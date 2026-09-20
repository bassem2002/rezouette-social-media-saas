import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { mkdirSync } from 'node:fs'
import { FileInterceptor } from '@nestjs/platform-express'
import { resolveTempUploadDir } from '../../config/media.config.js'
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger'
import {
  UploadMediaUseCase,
  type UploadedMediaFile,
} from '../../application/media/use-cases/upload-media.use-case.js'
import { UploadMediaResponseDto } from './dto/upload-media-response.dto.js'

/// Borne haute de sécurité (au-delà : multer coupe). Les limites métier
/// (image 10 Mo / vidéo configurable) sont validées dans le use case pour
/// renvoyer un message explicite. Ce plafond couvre la plus grande vidéo admise.
const HARD_LIMIT_BYTES = 128 * 1024 * 1024

/// Répertoire des fichiers temporaires multipart. Résolu au chargement du module
/// (les options d'interceptor sont évaluées hors DI) et créé immédiatement :
/// multer échouerait si la destination n'existait pas.
///
/// ⚠️ Point clé du stockage disque : avec `dest`, multer écrit le média EN FLUX
/// dans ce répertoire sous un nom aléatoire, et ne remplit JAMAIS `file.buffer`.
/// Une vidéo de 100 Mo ne transite donc plus par la RAM du processus. Le nom
/// généré est indépendant du nom fourni par le client — aucune traversée
/// possible depuis `originalname`.
const TEMP_UPLOAD_DIR = resolveTempUploadDir()
mkdirSync(TEMP_UPLOAD_DIR, { recursive: true })

@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(private readonly uploadMedia: UploadMediaUseCase) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      dest: TEMP_UPLOAD_DIR,
      limits: { fileSize: HARD_LIMIT_BYTES },
    }),
  )
  @ApiOperation({
    summary: 'Uploader un média (image ou vidéo) et obtenir son URL publique',
    description:
      'multipart/form-data, champ "file". Images : image/jpeg, image/png, image/webp (10 Mo max) pour Facebook/Instagram. Vidéos : video/mp4, video/quicktime, video/webm pour TikTok et YouTube. Le fichier est écrit en flux sur disque (jamais chargé en mémoire), validé, puis déplacé vers son emplacement définitif ; le fichier temporaire est supprimé dans tous les cas. Renvoie une URL publique directement utilisable pour la publication.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image (JPEG/PNG/WEBP, 10 Mo max) ou vidéo (MP4/MOV/WEBM).',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: UploadMediaResponseDto })
  @ApiBadRequestResponse({
    description: 'Fichier manquant ou format non supporté.',
  })
  async upload(
    @UploadedFile() file: UploadedMediaFile | undefined,
  ): Promise<UploadMediaResponseDto> {
    return this.uploadMedia.execute(file)
  }
}
