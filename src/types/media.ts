export type MediaKind = 'photo' | 'video';

export interface CapturedMedia {
  kind: MediaKind;
  blob: Blob;
  downloadBlob: Blob;
  previewUrl: string;
  submissionId: string;
}

export interface UploadedMedia extends CapturedMedia {
  filename: string;
  sent: boolean;
}

export const MAX_UPLOAD_FILES = 10;
