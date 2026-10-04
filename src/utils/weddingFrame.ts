import { photoFramePalette as ink } from '../styles/photoFrame';

export interface FrameInsets { top: number; bottom: number; right: number; left: number }
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function getWeddingFrameLayout(width: number, height: number, insets: FrameInsets) {
  if (![width, height, ...Object.values(insets)].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error('Invalid frame size');
  const landscapeControls = width > height && height <= 600;
  const shortEdge = Math.min(width, height);
  const catWidth = Math.min(clamp(shortEdge * .31, 104, 154), width * .36);
  const catHeight = catWidth * 1.06;
  const right = Math.max(0, insets.right) + (landscapeControls ? 142 : 12);
  const bottom = Math.max(0, insets.bottom) + (landscapeControls ? 16 : 142);
  return {
    titleX: width / 2,
    titleY: Math.max(0, insets.top) + 34,
    titleSize: clamp(shortEdge * .059, 19, 30),
    botanicalSize: clamp(shortEdge * .19, 65, 94),
    cat: { x: Math.max(8, width - right - catWidth), y: Math.max(90, height - bottom - catHeight), width: catWidth, height: catHeight },
  };
}

const vine = `<g fill="none" stroke-linecap="round" stroke-linejoin="round">
  <path d="M15 195C43 160 29 94 106 15M35 158C63 151 95 145 132 124M48 113C26 97 20 73 24 48"/>
  <path d="M33 151C13 144 9 127 12 113c20 7 27 21 21 38ZM45 131c23 0 39-15 40-32-22 1-38 14-40 32ZM47 101C31 85 37 66 46 56c11 16 13 31 1 45ZM71 65c-5-23 6-42 19-48 6 21-1 37-19 48ZM89 43c21 4 36-4 43-16-21-8-33-1-43 16ZM89 143c-2-18 9-30 20-35 5 20-3 29-20 35Z"/>
  <path d="M24 46c-12-1-15-12-5-15-5-9 3-16 10-8 7-9 15-4 12 6 11 1 10 12 0 14-2 10-13 11-17 3Z"/>
  <circle cx="30" cy="35" r="2.5"/>
  <path d="M119 92c-9-2-11-10-4-12-3-7 3-12 8-6 5-7 12-3 9 4 8 2 8 10 0 11-2 8-10 9-13 3Z"/>
  <circle cx="123" cy="84" r="2"/>
</g>`;

const catAndFlowers = `<g stroke-linecap="round" stroke-linejoin="round">
  <g fill="none" stroke="${ink.sage}" stroke-width="1.8" opacity=".9">
    <path d="M20 181C29 151 20 114 42 78M143 181c-1-27 18-51 26-82M13 181c10-11 12-19 10-29M150 177c20-4 26-17 30-30"/>
    <path d="M26 142c-15-1-19-15-17-24 13 3 18 12 17 24ZM29 125c17-1 23-12 24-22-17 1-23 11-24 22ZM36 101c-11-8-13-20-10-30 13 6 16 17 10 30ZM153 143c-1-17 10-28 22-30 0 17-9 26-22 30ZM166 121c-11-7-12-19-8-28 10 7 14 18 8 28Z"/>
  </g>
  <g fill="${ink.rose}" fill-opacity=".24" stroke="${ink.ivory}" stroke-width="1.7">
    <path d="M40 78c-12 1-18-9-9-16-8-9-1-19 9-13 5-11 17-7 16 4 12-1 15 11 4 16 6 10-5 19-13 11-3 4-5 3-7-2Z"/>
    <path d="M167 103c-10 1-14-7-7-12-6-7-1-15 7-10 4-9 13-6 12 3 9-1 12 8 3 12 5 8-3 14-10 8-2 3-4 3-5-1Z"/>
    <path d="M23 181c-8 1-13-6-6-11-5-7 0-14 7-9 4-8 12-5 11 3 8-1 11 7 3 11 4 7-3 13-9 7-2 3-4 3-6-1Z"/>
  </g>
  <g fill="${ink.champagne}"><circle cx="45" cy="66" r="3"/><circle cx="171" cy="92" r="2.5"/><circle cx="28" cy="171" r="2.5"/></g>
  <g stroke="${ink.ivory}" stroke-width="2.1">
    <path d="M61 173c-9-16-9-34 0-47 6-9 9-18 10-27h53c1 9 4 19 10 27 9 13 9 33 0 47Z" fill="${ink.ivory}" fill-opacity=".08"/>
    <path d="M67 71 68 44 88 59c6-2 12-2 18 0l21-15 1 28c8 20-4 38-30 38S60 90 67 71Z" fill="${ink.ivory}" fill-opacity=".13"/>
    <path d="m73 57 1 13 9-5m37-8-1 13-9-5" fill="none" stroke="${ink.rose}"/>
    <path d="M81 82q5-5 10 0m15 0q5-5 10 0" fill="none"/>
    <path d="m94 89 4 3 4-3Zm4 3v5m0 0q-5 4-9 0m9 0q5 4 9 0M80 92l-19-3m20 8-18 2m51-7 20-3m-20 8 18 2" fill="none" stroke-width="1.5"/>
    <path d="M83 135v36m26-36v36m-38 3h55M131 166c27 9 35-7 31-18-3-9-12-12-17-6" fill="none"/>
  </g>
  <path d="M77 113q21 9 42 0" fill="none" stroke="${ink.champagne}" stroke-width="2"/>
  <path d="M98 125c-9-6-8-11-4-12 2-1 4 1 4 2 1-2 3-3 5-2 4 2 3 6-5 12Z" fill="${ink.champagne}"/>
  <path d="M43 180q51 10 98 0" fill="none" stroke="${ink.champagne}" stroke-width="1.4" opacity=".7"/>
</g>`;

/** Self-contained SVG: no remote images/fonts, shared by preview and JPEG compositing. */
export function createWeddingFrameSvg(width: number, height: number, insets: FrameInsets): string {
  const layout = getWeddingFrameLayout(width, height, insets);
  const corner = layout.botanicalSize;
  const cat = layout.cat;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs><filter id="ink-shadow" x="-35%" y="-35%" width="170%" height="170%"><feDropShadow dx="0" dy="1" stdDeviation="1.4" flood-color="${ink.shadow}" flood-opacity=".85"/></filter></defs>
    <g filter="url(#ink-shadow)">
      <g transform="translate(${Math.max(0, insets.left) + 12 + corner} ${Math.max(0, insets.top) + 12 + corner * 1.375}) rotate(180) scale(${corner / 160})" stroke="${ink.sage}" stroke-width="1.5" opacity=".78">${vine}</g>
      <text x="${layout.titleX}" y="${layout.titleY}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${layout.titleSize}" fill="${ink.ivory}">Raihan &amp; Aiman</text>
      <text x="${layout.titleX}" y="${layout.titleY + 19}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" letter-spacing="3.6" fill="${ink.champagne}">WEDDING</text>
      <path d="M${layout.titleX - 20} ${layout.titleY + 29}h40" stroke="${ink.champagne}" stroke-width=".7" opacity=".65"/>
      <g transform="translate(${cat.x} ${cat.y}) scale(${cat.width / 190})">${catAndFlowers}</g>
    </g>
  </svg>`;
}

export const weddingFrameDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
