import { describe, expect, it } from 'vitest';
import { createWeddingFrameSvg, getWeddingFrameLayout, weddingFrameDataUrl } from '../src/utils/weddingFrame';

const noInsets = { top: 0, bottom: 0, left: 0, right: 0 };

describe('photographic wedding frame', () => {
  it('keeps the title below the notch and the cat above portrait camera controls', () => {
    const insets = { ...noInsets, top: 59, bottom: 34 };
    for (const [width, height] of [[375, 667], [390, 844], [412, 915], [430, 932], [1440, 900]]) {
      const layout = getWeddingFrameLayout(width!, height!, insets);
      expect(layout.titleY - layout.titleSize).toBeGreaterThan(insets.top);
      expect(layout.cat.x + layout.cat.width).toBeLessThan(width!);
      expect(layout.cat.y + layout.cat.height).toBeLessThanOrEqual(height! - 142 - insets.bottom);
    }
  });
  it('moves the cat away from the right-hand control rail in landscape', () => {
    const layout = getWeddingFrameLayout(844, 390, { ...noInsets, right: 34 });
    expect(layout.cat.x + layout.cat.width).toBeLessThanOrEqual(844 - 142 - 34);
    expect(layout.cat.y + layout.cat.height).toBeLessThanOrEqual(390 - 16);
  });
  it('produces a self-contained SVG and rejects invalid frame dimensions', () => {
    const svg = createWeddingFrameSvg(390, 844, noInsets);
    expect(svg).toContain('Raihan &amp; Aiman');
    expect(svg).toContain('WEDDING');
    expect(svg).not.toMatch(/<image|<foreignObject|<script|https?:\/\/(?!www\.w3\.org)/);
    expect(decodeURIComponent(weddingFrameDataUrl(svg).split(',')[1]!)).toBe(svg);
    for (const width of [0, -1, Infinity, NaN]) expect(() => createWeddingFrameSvg(width, 844, noInsets)).toThrow();
  });
});
