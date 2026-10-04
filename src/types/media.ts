export type MediaKind = 'photo' | 'video';

export interface CapturedMedia {
  kind: MediaKind;
  blob: Blob;
  downloadBlob: Blob;
  previewUrl: string;
  submissionId: string;
}
