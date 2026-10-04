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

/** Keep the full-minute encoder, and prefer a sharper clean short clip when it fits. */
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
  const sharper = document.createElement('canvas');
  sharper.width = decorated.width; sharper.height = decorated.height;
  const sharperContext = sharper.getContext('2d', {alpha:false});
  const context = canvas.getContext('2d', {alpha:false});
  const downloadContext = decorated.getContext('2d', {alpha:false});
  if (!context || !downloadContext || !sharperContext) throw new Error('Video recording is not supported');
  const art = weddingArt(decorated.width,decorated.height);
  function paint() {
    context!.setTransform(mirrored ? -1 : 1, 0, 0, 1, mirrored ? canvas.width : 0, 0);
    context!.drawImage(video,crop.sx,crop.sy,crop.sw,crop.sh,0,0,canvas.width,canvas.height);
    downloadContext!.setTransform(mirrored ? -1 : 1,0,0,1,mirrored ? decorated.width : 0,0);
    downloadContext!.drawImage(video,crop.sx,crop.sy,crop.sw,crop.sh,0,0,decorated.width,decorated.height);
    downloadContext!.setTransform(1,0,0,1,0,0);
    downloadContext!.drawImage(art,0,0);
    if (sharperAvailable) {
      sharperContext!.setTransform(mirrored ? -1 : 1,0,0,1,mirrored ? sharper.width : 0,0);
      sharperContext!.drawImage(video,crop.sx,crop.sy,crop.sw,crop.sh,0,0,sharper.width,sharper.height);
    }
  }
  const streams: MediaStream[] = [];
  const recorders: MediaRecorder[] = [];
  const chunks: Blob[][] = [[],[],[]];
  const sizes = [0,0,0];
  let sharperAvailable = true;
  paint();
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
    canvas.width = canvas.height = decorated.width = decorated.height = art.width = art.height = sharper.width = sharper.height = 0;
  }
  function stop() { recorders.forEach(recorder => {if (recorder.state !== 'inactive') recorder.stop();}); }
  try {
    for (const [index, target] of [canvas,decorated,sharper].entries()) {
      const stream = target.captureStream(24); streams.push(stream);
      microphone.getAudioTracks().forEach(track => stream.addTrack(track));
      try {
        recorders.push(new MediaRecorder(stream,{mimeType,videoBitsPerSecond: index === 0 ? 400_000 : index === 1 ? 8_000_000 : 2_500_000, audioBitsPerSecond: index === 0 ? 64_000 : 96_000}));
      } catch (error) {
        if (index !== 2) throw error;
        sharperAvailable = false;
        stream.getVideoTracks().forEach(track => track.stop());
      }
    }
  } catch (error) { cleanup(); throw error; }
  const result = new Promise<{blob:Blob; downloadBlob:Blob}>((resolve,reject) => {
    function finish() {
      if (finished) return;
      finished = true;
      cleanup();
      const blobs = recorders.map((recorder,index) => new Blob(chunks[index],{type:recorder.mimeType.split(';')[0]}));
      chunks.forEach(parts => {parts.length = 0;});
      if (cancelled || failed || (!blobs[0].size || !blobs[1].size) || blobs[0].size > MAX_VIDEO_BYTES || blobs[1].size > MAX_DOWNLOAD_BYTES) reject(new Error('Recording unavailable'));
      else resolve({blob:sharperAvailable && blobs[2].size > 0 && blobs[2].size <= MAX_VIDEO_BYTES ? blobs[2] : blobs[0],downloadBlob:blobs[1]});
    }
    recorders.forEach((recorder,index) => {
      recorder.ondataavailable = event => {
        if (event.data.size && (index !== 2 || sharperAvailable)) {chunks[index].push(event.data); sizes[index] += event.data.size;}
        const limit = index === 1 ? MAX_DOWNLOAD_BYTES : MAX_VIDEO_BYTES;
        if (sizes[index] >= limit - 512 * 1024) {
          if (index === 2) { sharperAvailable = false; chunks[index].length = 0; if (recorder.state !== 'inactive') recorder.stop(); }
          else stop();
        }
      };
      recorder.onerror = () => {
        if (index === 2) { sharperAvailable = false; chunks[index].length = 0; if (recorder.state !== 'inactive') recorder.stop(); }
        else {failed = true; stop();}
      };
      recorder.onstop = () => {if (++stopped === recorders.length) finish();};
    });
    try {
      recorders.forEach((recorder,index) => {
        try { recorder.start(250); }
        catch (error) {
          if (index !== 2) throw error;
          sharperAvailable = false; stopped++;
        }
      });
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
