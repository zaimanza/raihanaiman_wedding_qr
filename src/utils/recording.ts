import { getCaptureGeometry } from './image';

export const HOLD_TO_RECORD_MS = 1000;
export const MAX_RECORDING_MS = 15_000;
export const MAX_VIDEO_BYTES = 3 * 1024 * 1024;

export function recordingMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm']
    .find(type => MediaRecorder.isTypeSupported(type)) ?? null;
}

export interface RecordingSession {
  stop: () => void;
  cancel: () => void;
  result: Promise<Blob>;
}

/** Records the same crop/mirror as the preview, without any decorative overlays. */
export function recordVideo(video: HTMLVideoElement, mirrored: boolean): RecordingSession {
  const mimeType = recordingMimeType();
  const canvas = document.createElement('canvas');
  if (!mimeType || !canvas.captureStream) throw new Error('Video recording is not supported');
  const bounds = video.getBoundingClientRect();
  const crop = getCaptureGeometry(video.videoWidth, video.videoHeight, bounds.width, bounds.height);
  const scale = Math.min(1, 1080 / Math.max(crop.width, crop.height));
  canvas.width = Math.max(2, Math.round(crop.width * scale / 2) * 2);
  canvas.height = Math.max(2, Math.round(crop.height * scale / 2) * 2);
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Video recording is not supported');
  function paint() {
    context!.setTransform(mirrored ? -1 : 1, 0, 0, 1, mirrored ? canvas.width : 0, 0);
    context!.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  }
  paint();
  const stream = canvas.captureStream(24);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_400_000 });
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    canvas.width = canvas.height = 0;
    throw error;
  }
  let cancelled = false;
  let bytes = 0;
  let paintFailed = false;
  const chunks: Blob[] = [];
  const interval = window.setInterval(() => {
    try { paint(); } catch { paintFailed = true; stop(); }
  }, 1000 / 24);
  const timer = window.setTimeout(stop, MAX_RECORDING_MS);
  function cleanup() {
    window.clearInterval(interval);
    window.clearTimeout(timer);
    stream.getTracks().forEach(track => track.stop());
    canvas.width = canvas.height = 0;
  }
  function stop() { if (recorder.state !== 'inactive') recorder.stop(); }
  const result = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = event => {
      if (event.data.size) { chunks.push(event.data); bytes += event.data.size; }
      // Leave room for the final encoder chunk, even if a browser ignores bitrate hints.
      if (bytes >= MAX_VIDEO_BYTES - 512 * 1024) stop();
    };
    recorder.onerror = () => { cleanup(); chunks.length = 0; reject(new Error('Recording interrupted')); };
    recorder.onstop = () => {
      cleanup();
      const blob = new Blob(chunks, { type: recorder.mimeType.split(';')[0] });
      chunks.length = 0;
      if (cancelled || paintFailed || blob.size === 0 || blob.size > MAX_VIDEO_BYTES) reject(new Error('Recording unavailable'));
      else resolve(blob);
    };
    try { recorder.start(250); } catch (error) { cleanup(); reject(error); }
  });
  return { stop, cancel: () => { cancelled = true; stop(); }, result };
}
