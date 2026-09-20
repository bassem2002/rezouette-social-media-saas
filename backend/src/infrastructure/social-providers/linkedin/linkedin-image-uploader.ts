import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'
import { LinkedInContentError } from '../../../application/social/errors/linkedin-content.error.js'
import {
  LinkedInInitializeImageUploadResponse,
  LinkedInRegisterUploadResponse,
} from './linkedin-content.types.js'

/// Téléverse une image vers LinkedIn et renvoie son URN, prêt à être attaché à un
/// post. Deux flux distincts selon l'API de publication :
/// - REST (Images API)   : /rest/images?action=initializeUpload → PUT binaire → urn:li:image
/// - UGC  (Assets API)   : /v2/assets?action=registerUpload → POST binaire → urn:li:digitalmediaAsset
///
/// Ne journalise JAMAIS le token, l'en-tête Authorization, ni l'URL d'upload signée
/// complète. Toute erreur est normalisée en LinkedInContentError(media_upload_failed).
@Injectable()
export class LinkedInImageUploader {
  private readonly logger = new Logger(LinkedInImageUploader.name)

  constructor(private readonly http: HttpService) {}

  /// Flux Images API (versionné). Renvoie l'URN image (`urn:li:image:...`).
  async uploadForRest(args: {
    accessToken: string
    ownerUrn: string
    imageUrl: string
    apiBaseUrl: string
    apiVersion: string
  }): Promise<string> {
    try {
      const init = await firstValueFrom(
        this.http.post<LinkedInInitializeImageUploadResponse>(
          `${args.apiBaseUrl}/rest/images?action=initializeUpload`,
          { initializeUploadRequest: { owner: args.ownerUrn } },
          {
            headers: {
              Authorization: `Bearer ${args.accessToken}`,
              'X-Restli-Protocol-Version': '2.0.0',
              'LinkedIn-Version': args.apiVersion,
              'Content-Type': 'application/json',
            },
          },
        ),
      )
      const uploadUrl = init.data.value?.uploadUrl
      const imageUrn = init.data.value?.image
      if (!uploadUrl || !imageUrn) {
        throw new LinkedInContentError({
          serviceErrorCode: 'media_upload_failed',
          httpStatus: 502,
          message: "Réponse initializeUpload LinkedIn incomplète (uploadUrl/image absent)",
        })
      }
      await this.putBinary(uploadUrl, args.imageUrl, args.accessToken)
      return imageUrn
    } catch (err) {
      throw this.asUploadError(err)
    }
  }

  /// Flux Assets API (UGC legacy). Renvoie l'URN asset (`urn:li:digitalmediaAsset:...`).
  async uploadForUgc(args: {
    accessToken: string
    ownerUrn: string
    imageUrl: string
    apiBaseUrl: string
  }): Promise<string> {
    try {
      const register = await firstValueFrom(
        this.http.post<LinkedInRegisterUploadResponse>(
          `${args.apiBaseUrl}/v2/assets?action=registerUpload`,
          {
            registerUploadRequest: {
              recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
              owner: args.ownerUrn,
              serviceRelationships: [
                {
                  relationshipType: 'OWNER',
                  identifier: 'urn:li:userGeneratedContent',
                },
              ],
            },
          },
          {
            headers: {
              Authorization: `Bearer ${args.accessToken}`,
              'X-Restli-Protocol-Version': '2.0.0',
              'Content-Type': 'application/json',
            },
          },
        ),
      )
      const asset = register.data.value?.asset
      const uploadUrl =
        register.data.value?.uploadMechanism?.[
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
        ]?.uploadUrl
      if (!asset || !uploadUrl) {
        throw new LinkedInContentError({
          serviceErrorCode: 'media_upload_failed',
          httpStatus: 502,
          message: 'Réponse registerUpload LinkedIn incomplète (asset/uploadUrl absent)',
        })
      }
      await this.putBinary(uploadUrl, args.imageUrl, args.accessToken)
      return asset
    } catch (err) {
      throw this.asUploadError(err)
    }
  }

  /// Télécharge le binaire depuis l'URL publique puis le téléverse vers LinkedIn.
  private async putBinary(
    uploadUrl: string,
    imageUrl: string,
    accessToken: string,
  ): Promise<void> {
    const download = await firstValueFrom(
      this.http.get<ArrayBuffer>(imageUrl, { responseType: 'arraybuffer' }),
    )
    const body = Buffer.from(download.data)
    await firstValueFrom(
      this.http.put(uploadUrl, body, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream',
        },
      }),
    )
  }

  private asUploadError(err: unknown): LinkedInContentError {
    if (err instanceof LinkedInContentError) {
      return err
    }
    // Message générique (jamais de token/URL signée en clair dans le log).
    this.logger.warn('Upload image LinkedIn échoué')
    const message = err instanceof Error ? err.message : String(err)
    return new LinkedInContentError({
      serviceErrorCode: 'media_upload_failed',
      httpStatus: 0,
      message,
    })
  }
}
