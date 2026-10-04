import type { CapturedMedia } from '../types/media';

export function mediaFilename(media: Pick<CapturedMedia, 'kind' | 'blob'>): string {
  const extension = media.kind === 'photo' ? 'jpg' : media.blob.type.startsWith('video/mp4') ? 'mp4' : 'webm';
  return `raihan-aiman-${Date.now()}.${extension}`;
}

/** Starts a browser download; phones may show their normal Save/Downloads prompt. */
export function downloadMemory(media: CapturedMedia): void {
  const url = URL.createObjectURL(media.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = mediaFilename(media);
  document.body.append(link);
  link.click();
  link.remove();
  // The download owns its own short-lived URL, independent of the cleared draft.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
