/// Réponse de POST /rest/images?action=initializeUpload.
export interface LinkedInInitializeImageUploadResponse {
  value?: {
    uploadUrl?: string
    image?: string
    uploadUrlExpiresAt?: number
  }
}

/// Réponse de POST /v2/assets?action=registerUpload (flux UGC legacy).
export interface LinkedInRegisterUploadResponse {
  value?: {
    asset?: string
    uploadMechanism?: {
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'?: {
        uploadUrl?: string
      }
    }
  }
}
