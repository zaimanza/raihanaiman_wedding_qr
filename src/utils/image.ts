export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 4096;

export function getCaptureGeometry(videoWidth: number, videoHeight: number, previewWidth: number, previewHeight: number) {
  if ([videoWidth, videoHeight, previewWidth, previewHeight].some(value => !Number.isFinite(value) || value <= 0)) {
    throw new Error('Camera frame is not ready');
  }
  // Match object-fit: cover: the saved frame is precisely the guest's composition.
  const ratio = previewWidth / previewHeight;
  const sourceWidth = Math.min(videoWidth, videoHeight * ratio);
  const sourceHeight = Math.min(videoHeight, videoWidth / ratio);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
  return {
    sx: (videoWidth - sourceWidth) / 2,
    sy: (videoHeight - sourceHeight) / 2,
    sw: sourceWidth,
    sh: sourceHeight,
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('Could not prepare the photo'));
  }, 'image/jpeg', quality));
}

interface StillCamera {
  takePhoto: (settings?: {imageWidth?: number; imageHeight?: number}) => Promise<Blob>;
  getPhotoCapabilities?: () => Promise<{imageWidth: {max:number}; imageHeight:{max:number}}>;
}

/** Native still-photo capture where available; Safari falls back to the live frame. */
async function nativeStill(video: HTMLVideoElement): Promise<ImageBitmap | null> {
  const Constructor = (window as unknown as {ImageCapture?: new (track: MediaStreamTrack) => StillCamera}).ImageCapture;
  const track = (video.srcObject as MediaStream | null)?.getVideoTracks()[0];
  if (!Constructor || !track) return null;
  let timer: number | undefined;
  try {
    const photo = await Promise.race([
      (async () => {
        const camera = new Constructor(track);
        const caps = await camera.getPhotoCapabilities?.();
        const scale = caps ? Math.min(1, MAX_IMAGE_EDGE / Math.max(caps.imageWidth.max,caps.imageHeight.max)) : 1;
        return camera.takePhoto(caps ? {imageWidth: Math.floor(caps.imageWidth.max*scale), imageHeight: Math.floor(caps.imageHeight.max*scale)} : undefined);
      })(),
      new Promise<never>((_,reject) => {timer=window.setTimeout(() => reject(new Error('Still capture timed out')),3000);}),
    ]);
    if (photo.size > 25 * 1024 * 1024) return null;
    return await createImageBitmap(photo);
  } catch {return null;} finally {window.clearTimeout(timer);}
}

export async function capturePhoto(video: HTMLVideoElement, mirrored: boolean): Promise<Blob> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) throw new Error('Camera frame is not ready');
  const bounds = video.getBoundingClientRect();
  const still = await nativeStill(video);
  const geometry = getCaptureGeometry(still?.width ?? video.videoWidth, still?.height ?? video.videoHeight, bounds.width, bounds.height);
  const canvas = document.createElement('canvas');
  canvas.width = geometry.width; canvas.height = geometry.height;
  const context = canvas.getContext('2d', {alpha:false});
  if (!context) {still?.close(); throw new Error('Could not prepare the photo');}
  try {
    context.save();
    if (mirrored) {context.translate(canvas.width,0); context.scale(-1,1);}
    context.drawImage(still ?? video,geometry.sx,geometry.sy,geometry.sw,geometry.sh,0,0,canvas.width,canvas.height);
    context.restore();
    // Keep a high-quality capture for the decorated preview/download.
    return await encodeJpeg(canvas,.98);
  } finally {still?.close(); canvas.width=canvas.height=0;}
}

/** Upload an unchanged JPEG whenever possible; adjust only if it exceeds Vercel's budget. */
export async function preparePhotoForUpload(original: Blob): Promise<Blob> {
  if (original.size <= MAX_IMAGE_BYTES) return original;
  const bitmap=await createImageBitmap(original);
  const canvas=document.createElement('canvas');
  try {
    const context=canvas.getContext('2d',{alpha:false});
    if (!context) throw new Error('Could not prepare the photo');
    for (const scale of [1,.9,.8,.7,.6]) {
      canvas.width=Math.round(bitmap.width*scale); canvas.height=Math.round(bitmap.height*scale);
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      for (const quality of [.96,.94,.92]) {
        const blob=await encodeJpeg(canvas,quality);
        if (blob.size<=MAX_IMAGE_BYTES) return blob;
      }
    }
    throw new Error('This photo is too large. Please retake it.');
  } finally {bitmap.close();canvas.width=canvas.height=0;}
}
