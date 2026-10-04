import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAnimatedPicture, MAX_UPLOAD_PHOTO_BYTES, prepareUploadMedia, uploadFileKind } from '../src/utils/uploadMedia';
import { MAX_VIDEO_BYTES } from '../src/utils/recording';

const state = vi.hoisted(() => ({
  inputDispose: vi.fn(),
  duration: 3, start: 0, decodable: true,
  tracks: 1, failFrame: -1, mime: 'video/mp4; codecs="avc1.42c032"',
  endedTracks: [] as number[],
}));

vi.mock('mediabunny', () => ({
  MP4: {}, WEBM: {}, BlobSource: class {},
  Input: class {
    getFirstTimestamp = async () => state.start;
    computeDuration = async () => state.duration;
    getMimeType = async () => state.mime;
    getVideoTracks = async () => Array.from({ length: state.tracks }, (_, index) => ({
      index,
      canDecode: async () => state.decodable,
      getDisplayWidth: async () => 320,
      getDisplayHeight: async () => 240,
    }));
    dispose = state.inputDispose;
  },

}));

const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xd9])], 'memory.jpg', { type: 'image/jpeg' });
const video = () => new File(['fake-video-decoded-by-test-demuxer'], 'memory.mp4', { type: 'video/mp4' });
const bitmapClose = vi.fn();
const preview = vi.fn(() => 'blob:checked-memory');

beforeEach(() => {
  state.duration = 3; state.start = 0; state.decodable = false; state.tracks = 1;
  state.mime = 'video/mp4; codecs="avc1.42c032"';
  state.inputDispose.mockReset(); bitmapClose.mockReset(); preview.mockClear();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 640, height: 480, close: bitmapClose })));
  vi.spyOn(URL, 'createObjectURL').mockImplementation(preview);
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('picked media limits and animation rejection', () => {
  it('recognizes supported formats and empty MIME picker files without accepting arbitrary extensions', () => {
    expect(uploadFileKind({ name: 'memory.JPG', type: '', size: 100 })).toBe('photo');
    expect(uploadFileKind({ name: 'memory.webm', type: '', size: 100 })).toBe('video');
    expect(() => uploadFileKind({ name: 'memory.exe', type: '', size: 100 })).toThrow('Please choose');
    expect(() => uploadFileKind({ name: 'memory.jpg', type: 'image/gif', size: 100 })).toThrow('Please choose');
    expect(() => uploadFileKind({ name: 'memory.jpg', type: 'image/jpeg', size: 0 })).toThrow('couldn’t open');
  });

  it('checks source photo/video byte limits before decoding', () => {
    expect(() => uploadFileKind({ name: 'large.jpg', type: 'image/jpeg', size: MAX_UPLOAD_PHOTO_BYTES + 1 })).toThrow('25 MB');
    expect(() => uploadFileKind({ name: 'large.mp4', type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 })).toThrow('4 MB');
  });

  it('detects unsupported animated picture formats', () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 97, 99, 84, 76, 0, 0, 0, 0]);
    expect(isAnimatedPicture(png)).toBe(true);
    const webp = new Uint8Array([82, 73, 70, 70, 22, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 88, 2, 0, 0, 0, 2, 0]);
    expect(isAnimatedPicture(webp)).toBe(true);
    expect(isAnimatedPicture(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false);
  });

  it('rejects unsupported GIF files even when renamed', async () => {
    await expect(prepareUploadMedia(new File(['GIF89a'], 'looks-like-photo.jpg', { type: 'image/jpeg' })))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA' });
    expect(preview).not.toHaveBeenCalled();
  });
});

describe('photo preparation and ownership', () => {
  it('keeps a normal photo unchanged, creates a unique submission ID and releases the decoded bitmap', async () => {
    const file = jpeg();
    const media = await prepareUploadMedia(file);
    expect(media).toMatchObject({ kind: 'photo', blob: file, downloadBlob: file, previewUrl: 'blob:checked-memory' });
    expect(media.submissionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(bitmapClose).toHaveBeenCalledOnce();
  });

  it('closes a photo bitmap that completes after cancellation', async () => {
    let finish!: (bitmap: ImageBitmap) => void;
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<ImageBitmap>(resolve => { finish = resolve; })));
    const controller = new AbortController();
    const pending = prepareUploadMedia(jpeg(), controller.signal);
    await vi.waitFor(() => expect(typeof finish).toBe('function'));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    finish({ width: 640, height: 480, close: bitmapClose } as unknown as ImageBitmap);
    await Promise.resolve();
    expect(bitmapClose).toHaveBeenCalledOnce();
    expect(preview).not.toHaveBeenCalled();
  });
});

describe('video metadata validation without pixel scanning', () => {
  it('preserves a video when the browser has no decoder', async () => {
    state.decodable = false;
    const file = video();
    const media = await prepareUploadMedia(file);
    expect(media.kind).toBe('video');
    expect(media.blob).toBe(file);
    expect(state.inputDispose).toHaveBeenCalledOnce();
  });
  it('rejects long clips and missing video tracks before allocating a preview', async () => {
    state.duration = 61;
    await expect(prepareUploadMedia(video())).rejects.toMatchObject({code:'VIDEO_TOO_LONG'});
    state.duration = 3; state.tracks = 0;
    await expect(prepareUploadMedia(video())).rejects.toMatchObject({code:'INVALID_MEDIA'});
    expect(preview).not.toHaveBeenCalled();
  });
  it('cancels metadata reads and disposes the input', async () => {
    const controller = new AbortController();
    const pending = prepareUploadMedia(video(), controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({name:'AbortError'});
    expect(state.inputDispose).toHaveBeenCalledOnce();
    expect(preview).not.toHaveBeenCalled();
  });
});
