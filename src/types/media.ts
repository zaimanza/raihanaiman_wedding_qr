export type MediaKind = 'photo' | 'video';

export interface CapturedMedia {
  kind: MediaKind;
  blob: Blob;
  previewUrl: string;
  submissionId: string;
}
