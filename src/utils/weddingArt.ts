import { botanicalPaths, botanicalCircles } from './botanical';

/** Transparent artwork only: no camera controls, timer or instructions. */
export function weddingArt(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare your keepsake');
  const theme = getComputedStyle(document.documentElement);
  const ink = theme.getPropertyValue('--camera-ink').trim();
  const flower = theme.getPropertyValue('--camera-botanical').trim();
  const scale = Math.min(width / 390, height / 500);
  const flowerWidth = 62 * scale;
  const flowerHeight = flowerWidth * 220 / 160;
  const paths = botanicalPaths.map(d => new Path2D(d));
  function corner(x: number, y: number, angle: number, opacity: number) {
    ctx!.save();
    ctx!.translate(x + flowerWidth / 2, y + flowerHeight / 2);
    ctx!.rotate(angle * Math.PI / 180);
    ctx!.translate(-flowerWidth / 2, -flowerHeight / 2);
    ctx!.scale(flowerWidth / 160, flowerWidth / 160);
    ctx!.strokeStyle = flower; ctx!.globalAlpha = opacity;
    ctx!.lineWidth = Math.max(1.35, 160 / flowerWidth); ctx!.lineCap = 'round'; ctx!.lineJoin = 'round';
    for (const path of paths) ctx!.stroke(path);
    for (const {x,y,radius} of botanicalCircles) {
      ctx!.beginPath(); ctx!.arc(x,y,radius,0,2*Math.PI); ctx!.stroke();
    }
    ctx!.restore();
  }
  corner(13 * scale, 14 * scale, 175, .7);
  corner(width - flowerWidth - 12 * scale, height - flowerHeight - 20 * scale, -15, .62);
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.shadowColor = theme.getPropertyValue('--camera-bg').trim();
  ctx.shadowBlur = 4 * scale; ctx.shadowOffsetY = scale;
  ctx.font = 'normal ' + 19 * scale + 'px ' + theme.getPropertyValue('--font-display').trim();
  ctx.fillText('Raihan & Aiman', width / 2, 16 * scale, width - 150 * scale);
  ctx.font = '500 ' + 10 * scale + 'px ' + theme.getPropertyValue('--font-ui').trim();
  ctx.fillText('Wedding · 11 Oct 2026', width / 2, 45 * scale, width - 150 * scale);
  return canvas;
}

export async function decoratePhoto(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  let art: HTMLCanvasElement | undefined;
  try {
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', {alpha:false});
    if (!ctx) throw new Error('Could not prepare your keepsake');
    ctx.drawImage(bitmap,0,0);
    art = weddingArt(canvas.width,canvas.height);
    ctx.drawImage(art,0,0);
    return await new Promise<Blob>((resolve,reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Could not prepare your keepsake')), 'image/jpeg', .92));
  } finally {
    bitmap.close(); canvas.width = canvas.height = 0;
    if (art) art.width = art.height = 0;
  }
}
