export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 1920;

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

export async function capturePhoto(video: HTMLVideoElement, mirrored: boolean): Promise<Blob> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) throw new Error('Camera frame is not ready');
  const bounds = video.getBoundingClientRect();
  const geometry = getCaptureGeometry(video.videoWidth, video.videoHeight, bounds.width, bounds.height);
  const canvas = document.createElement('canvas');
  canvas.width = geometry.width;
  canvas.height = geometry.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Could not prepare the photo');
  // Video frames are already oriented by the browser; no EXIF data is copied.
  if (mirrored) { context.translate(canvas.width, 0); context.scale(-1, 1); }
  context.drawImage(video, geometry.sx, geometry.sy, geometry.sw, geometry.sh, 0, 0, canvas.width, canvas.height);
  try {
    for (const quality of [0.86, 0.82, 0.78]) {
      const blob = await encodeJpeg(canvas, quality);
      if (blob.size > 0 && blob.size <= MAX_IMAGE_BYTES) return blob;
    }
    throw new Error('This photo is too large. Please retake it.');
  } finally {
    // Release the backing pixel buffer, including when encoding fails.
    canvas.width = 0;
    canvas.height = 0;
  }
}
