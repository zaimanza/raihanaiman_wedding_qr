import { invalidRequest, MAX_PHOTO_BYTES, SubmissionError } from './_validation.ts'

export type PhotoMime = 'image/jpeg' | 'image/png' | 'image/webp'
export interface Photo {
  kind: 'photo'
  data: Buffer
  mime: PhotoMime
  extension: 'jpg' | 'png' | 'webp'
  width: number
  height: number
}

function jpegDimensions(data: Buffer): [number, number] | null {
  if (data.length < 20 || data.readUInt16BE(0) !== 0xffd8 || data.readUInt16BE(data.length - 2) !== 0xffd9) return null
  let offset = 2
  let dimensions: [number, number] | null = null
  while (offset + 4 <= data.length) {
    if (data[offset++] !== 0xff) return null
    while (data[offset] === 0xff) offset++
    if (offset + 3 > data.length) return null
    const marker = data[offset++]!
    const length = data.readUInt16BE(offset)
    if (length < 2 || offset + length > data.length) return null
    // Baseline and progressive JPEGs emitted by browser canvases.
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (dimensions || length < 8) return null
      const components = data[offset + 7]!
      if (length !== 8 + components * 3 || ![1, 3, 4].includes(components)) return null
      dimensions = [data.readUInt16BE(offset + 5), data.readUInt16BE(offset + 3)]
    }
    // Only accept an image with both a frame header and an actual scan.
    if (marker === 0xda) return dimensions && offset + length < data.length - 2 ? dimensions : null
    offset += length
  }
  return null
}

function pngDimensions(data: Buffer): [number, number] | null {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (data.length < 45 || !data.subarray(0, 8).equals(signature)) return null
  if (data.readUInt32BE(8) !== 13 || data.toString('ascii', 12, 16) !== 'IHDR') return null
  const dimensions: [number, number] = [data.readUInt32BE(16), data.readUInt32BE(20)]
  let offset = 8
  let hasImageData = false
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset)
    const next = offset + 12 + length
    if (next > data.length) return null
    const type = data.toString('ascii', offset + 4, offset + 8)
    if (type === 'acTL') return null // Animated images are outside the capture flow.
    if (type === 'IDAT' && length > 0) hasImageData = true
    if (type === 'IEND') return length === 0 && next === data.length && hasImageData ? dimensions : null
    offset = next
  }
  return null
}

function webpDimensions(data: Buffer): [number, number] | null {
  if (data.length < 26 || data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') return null
  if (data.readUInt32LE(4) + 8 !== data.length) return null
  let offset = 12
  let dimensions: [number, number] | null = null
  let hasImageData = false
  while (offset + 8 <= data.length) {
    const type = data.toString('ascii', offset, offset + 4)
    const length = data.readUInt32LE(offset + 4)
    const start = offset + 8
    const next = start + length + (length % 2)
    if (next > data.length || (length % 2 && data[next - 1] !== 0)) return null
    if (type === 'ANIM' || type === 'ANMF') return null
    if (type === 'VP8X') {
      if (length !== 10 || dimensions || (data[start]! & 0x02)) return null
      dimensions = [1 + data.readUIntLE(start + 4, 3), 1 + data.readUIntLE(start + 7, 3)]
    }
    if (type === 'VP8 ' || type === 'VP8L') {
      if (hasImageData) return null
      let encodedDimensions: [number, number]
      if (type === 'VP8 ') {
        if (length <= 10 || (data[start]! & 1) || !data.subarray(start + 3, start + 6).equals(Buffer.from([0x9d, 0x01, 0x2a]))) return null
        encodedDimensions = [data.readUInt16LE(start + 6) & 0x3fff, data.readUInt16LE(start + 8) & 0x3fff]
      } else {
        if (length <= 5 || data[start] !== 0x2f) return null
        const bits = data.readUInt32LE(start + 1)
        if (bits >>> 29 !== 0) return null
        encodedDimensions = [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]
      }
      if (dimensions && (dimensions[0] !== encodedDimensions[0] || dimensions[1] !== encodedDimensions[1])) return null
      dimensions = encodedDimensions
      hasImageData = true
    }
    offset = next
  }
  return offset === data.length && hasImageData ? dimensions : null
}

/** Checks format signatures, bounded container structure and dimensions without decoding pixels. */
export function validatePhoto(data: Buffer, suppliedMime: string): Photo {
  if (data.length === 0) throw invalidRequest()
  if (data.length > MAX_PHOTO_BYTES) {
    throw new SubmissionError(413, 'PHOTO_TOO_LARGE', 'This photo is a little too large. Please retake it ♡')
  }
  let dimensions: [number, number] | null = null
  let extension: Photo['extension']
  if (suppliedMime === 'image/jpeg') {
    dimensions = jpegDimensions(data)
    extension = 'jpg'
  } else if (suppliedMime === 'image/png') {
    dimensions = pngDimensions(data)
    extension = 'png'
  } else if (suppliedMime === 'image/webp') {
    dimensions = webpDimensions(data)
    extension = 'webp'
  } else {
    throw new SubmissionError(415, 'UNSUPPORTED_PHOTO', 'Please take a new photo using this camera ♡')
  }
  if (!dimensions) throw invalidRequest()
  const [width, height] = dimensions
  // Includes Telegram's size/ratio rules, plus a sensible decoded-pixel ceiling.
  if (width <= 0 || height <= 0 || width + height > 10000 || width * height > 20_000_000 || Math.max(width, height) / Math.min(width, height) > 20) throw invalidRequest()
  return { kind: 'photo', data, mime: suppliedMime as PhotoMime, extension, width, height }
}
