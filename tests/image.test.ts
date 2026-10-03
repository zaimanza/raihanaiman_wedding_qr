import { describe, expect, it } from 'vitest';
import { getCaptureGeometry } from '../src/utils/image';
import { MAX_WISH_LENGTH, normalizeWish } from '../src/utils/wish';

describe('camera composition and resizing', () => {
  it('matches the visible portrait crop and never upscales', () => {
    const crop = getCaptureGeometry(1920, 1080, 390, 844);
    expect(crop.width).toBeLessThan(1920);
    expect(crop.height).toBe(1080);
    expect(crop.width / crop.height).toBeCloseTo(390 / 844, 3);
    expect(crop.sx).toBeGreaterThan(0);
    expect(crop.sy).toBe(0);
  });
  it('caps large frames at 1920px and preserves the composition ratio', () => {
    const crop = getCaptureGeometry(4032, 3024, 1200, 800);
    expect(crop.width).toBe(1920);
    expect(crop.height).toBe(1280);
    expect(crop.sy).toBeGreaterThan(0);
  });
  it('rejects unavailable or non-finite frames', () => {
    for (const width of [0, -1, NaN, Infinity]) expect(() => getCaptureGeometry(width, 1080, 390, 844)).toThrow();
  });
});

describe('wishes', () => {
  it('preserves multiline wishes and emoji while removing control characters', () => {
    expect(normalizeWish('  Bahagia ❤️\r\nAlways\u0000\t♡  ')).toBe('Bahagia ❤️\nAlways ♡');
  });
  it('normalizes before enforcing the caption budget', () => {
    const expanded = normalizeWish('ﬃ'.repeat(300));
    expect(expanded.length).toBeGreaterThan(MAX_WISH_LENGTH);
  });
});
