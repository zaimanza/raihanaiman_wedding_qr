import { BlobSource, Input, MP4, WEBM } from 'mediabunny';
import type { CapturedMedia, MediaKind } from '../types/media';
import { MAX_IMAGE_BYTES, MAX_IMAGE_EDGE, preparePhotoForUpload } from './image';
import { MAX_RECORDING_MS, MAX_VIDEO_BYTES } from './recording';
import { abortable, throwIfAborted } from './mediaPreparation';

export const MAX_UPLOAD_PHOTO_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_PIXELS = 20_000_000;
export const MAX_UPLOAD_VIDEO_PIXELS = 8_000_000;
export const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.webm';

type UploadMediaErrorCode = 'UNSUPPORTED_MEDIA' | 'MEDIA_TOO_LARGE' | 'VIDEO_TOO_LONG' | 'INVALID_MEDIA';

export class UploadMediaError extends Error {
  constructor(public readonly code: UploadMediaErrorCode, message: string) {
    super(message);
    this.name = 'UploadMediaError';
  }
}

function invalidMedia(): UploadMediaError {
  return new UploadMediaError('INVALID_MEDIA', 'We couldn’t open this file. Please choose another photo or video.');
}

function photoMime(data: Uint8Array): string {
  const text = (offset: number, length: number) => String.fromCharCode(...data.subarray(offset, offset + length));
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => data[index] === value)) return 'image/png';
  if (data.length >= 12 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') return 'image/webp';
  if (data.length >= 16 && text(4, 4) === 'ftyp' && ['heic', 'heix', 'mif1'].includes(text(8, 4))) {
    const size = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0);
    if (size < 16 || size > data.length) throw invalidMedia();
    for (let offset = 8; offset + 4 <= size; offset += 4) {
      if (['msf1', 'hevc', 'hevx'].includes(text(offset, 4))) {
        throw new UploadMediaError('UNSUPPORTED_MEDIA', 'Please choose a still photo or upload the animation as a video.');
      }
    }
    return 'image/heic';
  }
  // Reject unsupported formats even if their filename has a supported extension.
  throw new UploadMediaError('UNSUPPORTED_MEDIA', 'Please choose a JPEG, PNG, WebP or supported HEIC photo.');
}

/** Infer only familiar extensions when a picker supplies no MIME type. */
export function uploadFileKind(file: Pick<File, 'name' | 'type' | 'size'>): MediaKind {
  if (!file.size) throw invalidMedia();
  const mime = file.type.toLowerCase().split(';')[0];
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const photo = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mime)
    || (!mime && ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(extension || ''));
  const video = ['video/mp4', 'video/webm'].includes(mime) || (!mime && ['mp4', 'webm'].includes(extension || ''));
  if (!photo && !video) throw new UploadMediaError('UNSUPPORTED_MEDIA', 'Please choose a JPEG, PNG or WebP photo, or an MP4 or WebM video.');
  if (file.size > (photo ? MAX_UPLOAD_PHOTO_BYTES : MAX_VIDEO_BYTES)) {
    throw new UploadMediaError('MEDIA_TOO_LARGE', photo ? 'Please choose a photo smaller than 25 MB.' : 'Please choose a video smaller than 4 MB.');
  }
  return photo ? 'photo' : 'video';
}

/** Keep the photo picker limited to still photos. */
export function isAnimatedPicture(data: Uint8Array): boolean {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const text = (offset: number, size: number) => String.fromCharCode(...data.subarray(offset, offset + size));
  if (data.length >= 8 && data[0] === 137 && text(1, 3) === 'PNG') {
    let offset = 8;
    while (offset + 12 <= data.length) {
      const length = view.getUint32(offset);
      if (length > data.length - offset - 12) throw invalidMedia();
      if (text(offset + 4, 4) === 'acTL') return true;
      offset += 12 + length;
    }
  } else if (data.length >= 12 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    let offset = 12;
    while (offset + 8 <= data.length) {
      const length = view.getUint32(offset + 4, true);
      if (length > data.length - offset - 8) throw invalidMedia();
      const type = text(offset, 4);
      if (type === 'ANIM' || type === 'ANMF' || (type === 'VP8X' && length > 0 && (data[offset + 8]! & 0x02))) return true;
      offset += 8 + length + (length % 2);
    }
  }
  return false;
}

interface DecodedPhoto {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose: () => void;
}

async function decodePhoto(file: File, signal?: AbortSignal): Promise<DecodedPhoto> {
  if (typeof createImageBitmap !== 'undefined') {
    let discard = false;
    try {
      const pending = createImageBitmap(file);
      // An aborted bitmap decode can complete later; close it instead of retaining VRAM.
      pending.then(bitmap => { if (discard || signal?.aborted) bitmap.close(); }, () => undefined);
      const bitmap = await abortable(pending, signal);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() };
    } catch { discard = true; throwIfAborted(signal); /* Safari may decode formats through an image instead. */ }
  }
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    await abortable(new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(invalidMedia());
      image.src = url;
    }), signal);
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, dispose: () => { image.src = ''; } };
  } finally {
    image.onload = image.onerror = null;
    URL.revokeObjectURL(url);
  }
}

async function preparePhoto(file: File, signal?: AbortSignal): Promise<Blob> {
  const bytes = new Uint8Array(await abortable(file.arrayBuffer(), signal));
  const mime = photoMime(bytes);
  if (isAnimatedPicture(bytes)) throw new UploadMediaError('UNSUPPORTED_MEDIA', 'Please choose a still photo or upload the animation as a video.');
  const photo = await decodePhoto(file, signal);
  let canvas: HTMLCanvasElement | undefined;
  try {
    if (!photo.width || !photo.height || photo.width * photo.height > MAX_UPLOAD_PIXELS) {
      throw new UploadMediaError('MEDIA_TOO_LARGE', 'Please choose a photo with at most 20 megapixels.');
    }
    if (Math.max(photo.width, photo.height) / Math.min(photo.width, photo.height) > 20) {
      throw new UploadMediaError('UNSUPPORTED_MEDIA', 'Please choose a photo with a less panoramic shape.');
    }
    throwIfAborted(signal);
    if (mime !== 'image/heic' && file.size <= MAX_IMAGE_BYTES && Math.max(photo.width, photo.height) <= MAX_IMAGE_EDGE && photo.width + photo.height <= 10_000 && Math.max(photo.width, photo.height) / Math.min(photo.width, photo.height) <= 20) {
      return file.type === mime ? file : new Blob([file], { type: mime });
    }
    // Normalize to a bounded, static JPEG for all supported source formats, including
    // browser-decodable HEIC. Keep the guest's original separately for downloading.
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(photo.width, photo.height));
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(photo.width * scale));
    canvas.height = Math.max(1, Math.round(photo.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw invalidMedia();
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(photo.source, 0, 0, canvas.width, canvas.height);
    const jpeg = await abortable(new Promise<Blob>((resolve, reject) => canvas!.toBlob(blob => blob ? resolve(blob) : reject(invalidMedia()), 'image/jpeg', .96)), signal);
    const prepared = await abortable(preparePhotoForUpload(jpeg), signal);
    if (!prepared.size || prepared.size > MAX_IMAGE_BYTES) throw new UploadMediaError('MEDIA_TOO_LARGE', 'This photo is too large. Please choose a smaller one.');
    return prepared;
  } finally {
    photo.dispose();
    if (canvas) canvas.width = canvas.height = 0;
  }
}

async function checkVideo(file: File, signal?: AbortSignal): Promise<Blob> {
  const input = new Input({ source: new BlobSource(file), formats: [MP4, WEBM] });
  let disposed = false;
  const cancel = () => { if (!disposed) { disposed = true; input.dispose(); } };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const [start, end, tracks, mime] = await abortable(Promise.all([
      input.getFirstTimestamp(), input.computeDuration(), input.getVideoTracks(), input.getMimeType(),
    ]), signal);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !tracks.length) throw invalidMedia();
    // Codec/container timestamp rounding can add a few milliseconds to a 60s clip.
    if (end - start > MAX_RECORDING_MS / 1000 + .05) throw new UploadMediaError('VIDEO_TOO_LONG', 'Please choose a video no longer than 60 seconds.');
    for (const track of tracks) {
      const [width, height] = await abortable(Promise.all([track.getDisplayWidth(), track.getDisplayHeight()]), signal);
      if (!width || !height || width * height > MAX_UPLOAD_VIDEO_PIXELS) throw new UploadMediaError('MEDIA_TOO_LARGE', 'Please choose a video below 8 megapixels, such as Full HD (1080p).');
    }
    // Browser pickers occasionally omit MIME; use the demuxer's verified container.
    const cleanMime = mime.split(';')[0].trim();
    if (!['video/mp4', 'video/webm'].includes(cleanMime)) throw invalidMedia();
    return file.type === cleanMime ? file : new Blob([file], { type: cleanMime });
  } finally {
    signal?.removeEventListener('abort', cancel);
    cancel();
  }
}

/**
 * Validate file format and limits before adding a file to an upload draft;
 * the caller then owns that URL and must revoke it when removing/clearing the draft.
 */
export async function prepareUploadMedia(file: File, signal?: AbortSignal): Promise<CapturedMedia> {
  throwIfAborted(signal);
  const kind = uploadFileKind(file);
  try {
    const blob = kind === 'photo' ? await preparePhoto(file, signal) : await checkVideo(file, signal);
    throwIfAborted(signal);
    const submissionId = crypto.randomUUID();
    return { kind, blob, downloadBlob: file, previewUrl: URL.createObjectURL(blob), submissionId };
  } catch (error) {
    throwIfAborted(signal);
    if (error instanceof UploadMediaError) throw error;
    throw invalidMedia();
  }
}
