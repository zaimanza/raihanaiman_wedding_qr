import { describe, expect, it } from 'vitest'
import { validatePhoto } from '../api/lib/_image'
import { buildCaption, MAX_PHOTO_BYTES, normalizeWish, validateSubmissionId } from '../api/lib/_validation'

// Real, minimal static PNG fixture. These tests never contact Telegram or store guest data.
const png = () => Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5S8AAAAASUVORK5CYII=', 'base64')

function jpegHeader(width = 1920, height = 1080) {
  // Header-only test fixture: the validator inspects containers, not decoded pixels.
  const data = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 0, 0, 0, 1, 1, 0x11, 0, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 1, 0xff, 0xd9])
  data.writeUInt16BE(height, 7)
  data.writeUInt16BE(width, 9)
  return data
}

function webpHeader(width = 1920, height = 1080) {
  const data = Buffer.alloc(32)
  data.write('RIFF', 0)
  data.writeUInt32LE(24, 4)
  data.write('WEBPVP8 ', 8)
  data.writeUInt32LE(12, 16)
  data.set([0x9d, 0x01, 0x2a], 23)
  data.writeUInt16LE(width, 26)
  data.writeUInt16LE(height, 28)
  return data
}

describe('server photo validation', () => {
  it('recognizes PNG, JPEG and static WebP dimensions and canonical file extensions', () => {
    expect(validatePhoto(png(), 'image/png')).toMatchObject({ width: 1, height: 1, extension: 'png' })
    expect(validatePhoto(jpegHeader(), 'image/jpeg')).toMatchObject({ width: 1920, height: 1080, extension: 'jpg' })
    expect(validatePhoto(webpHeader(), 'image/webp')).toMatchObject({ width: 1920, height: 1080, extension: 'webp' })
  })
  it('rejects MIME spoofing, SVGs, empty, truncated and oversized files', () => {
    for (const [data, mime] of [[png(), 'image/jpeg'], [Buffer.from('<svg/>'), 'image/svg+xml'], [Buffer.alloc(0), 'image/jpeg'], [jpegHeader().subarray(0, 12), 'image/jpeg'], [webpHeader().subarray(0, 25), 'image/webp']] as const) {
      expect(() => validatePhoto(data, mime)).toThrow()
    }
    expect(() => validatePhoto(Buffer.alloc(MAX_PHOTO_BYTES + 1), 'image/jpeg')).toThrow('PHOTO_TOO_LARGE')
  })
  it('rejects impossible dimensions and Telegram-incompatible aspect ratios', () => {
    expect(() => validatePhoto(jpegHeader(0, 1080), 'image/jpeg')).toThrow()
    expect(() => validatePhoto(jpegHeader(6000, 5000), 'image/jpeg')).toThrow()
    expect(() => validatePhoto(jpegHeader(4000, 100), 'image/jpeg')).toThrow()
    expect(() => validatePhoto(jpegHeader(5000, 5000), 'image/jpeg')).toThrow()
  })
  it('rejects missing image content and malformed container lengths', () => {
    const noDataPng = png()
    noDataPng.write('JUNK', 37)
    expect(() => validatePhoto(noDataPng, 'image/png')).toThrow()
    const invalidJpeg = jpegHeader()
    invalidJpeg.writeUInt16BE(65535, 4)
    expect(() => validatePhoto(invalidJpeg, 'image/jpeg')).toThrow()
    const invalidWebp = webpHeader()
    invalidWebp.writeUInt32LE(99999, 16)
    expect(() => validatePhoto(invalidWebp, 'image/webp')).toThrow()
  })
  it('rejects animation containers', () => {
    const animatedPng = png()
    animatedPng.write('acTL', 37)
    expect(() => validatePhoto(animatedPng, 'image/png')).toThrow()
    const animatedWebp = webpHeader()
    animatedWebp.write('ANIM', 12)
    expect(() => validatePhoto(animatedWebp, 'image/webp')).toThrow()
  })
})

describe('wish and submission validation', () => {
  it('normalizes line endings and Unicode, strips unsafe controls and preserves natural multilingual text', () => {
    expect(normalizeWish('  Ｌｏｖｅ\r\nSelamat\tbahagia\u0000\u202e ❤️\nبارك الله لكما 👩‍❤️‍👨  '))
      .toBe('Love\nSelamat bahagia ❤️\nبارك الله لكما 👩‍❤️‍👨')
  })
  it('accepts an empty wish and the limit, including conservative emoji counting', () => {
    expect(normalizeWish(' \n ')).toBe('')
    expect(normalizeWish('x'.repeat(800))).toHaveLength(800)
    expect(normalizeWish('❤️'.repeat(400))).toHaveLength(800)
    expect(() => normalizeWish('x'.repeat(801))).toThrow('WISH_TOO_LONG')
    expect(() => normalizeWish('ﬃ'.repeat(300))).toThrow('WISH_TOO_LONG')
  })
  it('keeps the final caption within 1024 and formats Malaysia time without markup parsing', () => {
    const date = new Date('2026-10-03T12:42:00Z')
    expect(buildCaption('<b>Love</b>', date)).toBe('💌 Wedding Wish\n\n<b>Love</b>\n\n03 October 2026 • 8:42 PM')
    expect(buildCaption('', date)).toContain('Wedding Memory')
    expect(buildCaption('x'.repeat(800), date).length).toBeLessThanOrEqual(1024)
  })
  it('accepts only a UUID v4 per captured photo', () => {
    expect(validateSubmissionId('A6E1648E-914C-4FA9-A75C-0A6EA087E4E9')).toBe('a6e1648e-914c-4fa9-a75c-0a6ea087e4e9')
    for (const value of [undefined, '', 'not-a-uuid', 'a6e1648e-914c-1fa9-a75c-0a6ea087e4e9']) {
      expect(() => validateSubmissionId(value)).toThrow()
    }
  })
})
