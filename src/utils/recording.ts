import { getCaptureGeometry } from './image';
import { weddingArt } from './weddingArt';

export const HOLD_TO_RECORD_MS = 1000;
export const MAX_RECORDING_MS = 60_000;
export const MAX_VIDEO_BYTES = 4 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024;

export function recordingMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']
    .find(type => MediaRecorder.isTypeSupported(type)) ?? null;
}

export interface RecordingSession {
  stop: () => void;
  cancel: () => void;
  result: Promise<{blob: Blob; downloadBlob: Blob}>;
}

/** Encode clean Telegram footage and a decorated download together, without replay/export delays. */
export function recordVideo(video: HTMLVideoElement, mirrored: boolean, microphone: MediaStream): RecordingSession {
  const mimeType = recordingMimeType();
  if (!mimeType || !HTMLCanvasElement.prototype.captureStream) throw new Error('Video recording is not supported');
  const bounds = video.getBoundingClientRect();
  const crop = getCaptureGeometry(video.videoWidth, video.videoHeight, bounds.width, bounds.height);
  const scale = Math.min(1, 1080 / Math.max(crop.width, crop.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(crop.width * scale / 2) * 2);
  canvas.height = Math.max(2, Math.round(crop.height * scale / 2) * 2);
  const decorated = document.createElement('canvas');
  const downloadScale = Math.min(1, 1920 / Math.max(crop.width, crop.height));
  decorated.width = Math.max(2, Math.round(crop.width * downloadScale / 2) * 2);
  decorated.height = Math.max(2, Math.round(crop.height * downloadScale / 2) * 2);
  const context = canvas.getContext('2d', {alpha:false});
  const downloadContext = decorated.getContext('2d', {alpha:false});
  if (!context || !downloadContext) throw new Error('Video recording is not supported');
  const art = weddingArt(decorated.width,decorated.height);
  function paint() {
    context!.setTransform(mirrored ? -1 : 1, 0, 0, 1, mirrored ? canvas.width : 0, 0);
    context!.drawImage(video,crop.sx,crop.sy,crop.sw,crop.sh,0,0,canvas.width,canvas.height);
    downloadContext!.setTransform(mirrored ? -1 : 1,0,0,1,mirrored ? decorated.width : 0,0);
    downloadContext!.drawImage(video,crop.sx,crop.sy,crop.sw,crop.sh,0,0,decorated.width,decorated.height);
    downloadContext!.setTransform(1,0,0,1,0,0);
    downloadContext!.drawImage(art,0,0);
  }
  paint();
  const streams: MediaStream[] = [];
  const recorders: MediaRecorder[] = [];
  const chunks: Blob[][] = [[],[]];
  const sizes = [0,0];
  let interval: number | undefined;
  let timer: number | undefined;
  let cancelled = false;
  let failed = false;
  let finished = false;
  let stopped = 0;
  function cleanup() {
    window.clearInterval(interval); window.clearTimeout(timer);
    microphone.getTracks().forEach(track => track.stop());
    streams.forEach(stream => stream.getTracks().forEach(track => track.stop()));
    canvas.width = canvas.height = decorated.width = decorated.height = art.width = art.height = 0;
  }
  function stop() { recorders.forEach(recorder => {if (recorder.state !== 'inactive') recorder.stop();}); }
  try {
    for (const [index, target] of [canvas,decorated].entries()) {
      const stream = target.captureStream(24); streams.push(stream);
      microphone.getAudioTracks().forEach(track => stream.addTrack(track));
      recorders.push(new MediaRecorder(stream,{mimeType,videoBitsPerSecond: index === 0 ? 400_000 : 8_000_000, audioBitsPerSecond: index === 0 ? 64_000 : 96_000}));
    }
  } catch (error) { cleanup(); throw error; }
  const result = new Promise<{blob:Blob; downloadBlob:Blob}>((resolve,reject) => {
    function finish() {
      if (finished) return;
      finished = true;
      cleanup();
      const blobs = recorders.map((recorder,index) => new Blob(chunks[index],{type:recorder.mimeType.split(';')[0]}));
      chunks.forEach(parts => {parts.length = 0;});
      if (cancelled || failed || blobs.some(blob => !blob.size) || blobs[0].size > MAX_VIDEO_BYTES || blobs[1].size > MAX_DOWNLOAD_BYTES) reject(new Error('Recording unavailable'));
      else resolve({blob:blobs[0],downloadBlob:blobs[1]});
    }
    recorders.forEach((recorder,index) => {
      recorder.ondataavailable = event => {
        if (event.data.size) {chunks[index].push(event.data); sizes[index] += event.data.size;}
        const limit = index === 0 ? MAX_VIDEO_BYTES : MAX_DOWNLOAD_BYTES;
        if (sizes[index] >= limit - 512 * 1024) stop();
      };
      recorder.onerror = () => {failed = true; stop();};
      recorder.onstop = () => {if (++stopped === recorders.length) finish();};
    });
    try {
      recorders.forEach(recorder => recorder.start(250));
      interval = window.setInterval(() => {try {paint();} catch {failed = true; stop();}},1000 / 24);
      timer = window.setTimeout(stop,MAX_RECORDING_MS);
    } catch {
      failed = true;
      // Release a partially started encoder without retaining its chunks or tracks.
      stop(); cleanup(); finished = true; chunks.forEach(parts => {parts.length = 0;});
      reject(new Error('Recording unavailable'));
    }
  });
  return {stop,cancel:() => {cancelled = true; stop();},result};
}
