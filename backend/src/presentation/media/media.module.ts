import { Module } from '@nestjs/common'
import { MediaController } from './media.controller.js'
import { UploadMediaUseCase } from '../../application/media/use-cases/upload-media.use-case.js'
import { MEDIA_STORAGE } from '../../application/media/ports/media-storage.gateway.js'
import { MEDIA_READER_GATEWAY } from '../../application/media/ports/media-reader.gateway.js'
import { LocalMediaStorageService } from '../../infrastructure/media/local-media-storage.service.js'

/// Module média (image + vidéo). `LocalMediaStorageService` est déclaré UNE
/// SEULE FOIS et exposé derrière ses deux ports via `useExisting` : écriture
/// (MEDIA_STORAGE) et lecture par plages (MEDIA_READER_GATEWAY). Une seule
/// instance, donc une seule racine `uploads` — deux instances risqueraient de
/// diverger si la configuration changeait.
///
/// Le port de lecture est exporté pour l'upload résumable YouTube (SocialModule).
@Module({
  controllers: [MediaController],
  providers: [
    UploadMediaUseCase,
    LocalMediaStorageService,
    { provide: MEDIA_STORAGE, useExisting: LocalMediaStorageService },
    { provide: MEDIA_READER_GATEWAY, useExisting: LocalMediaStorageService },
  ],
  exports: [MEDIA_READER_GATEWAY],
})
export class MediaModule {}
