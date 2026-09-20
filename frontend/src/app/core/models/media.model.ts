/// Réponse de POST /media/upload.
export interface UploadResponse {
  url: string;
  filename: string;
  size: number;
  /// Nature du média détectée côté backend à partir du type MIME.
  mediaType: 'image' | 'video';
}
