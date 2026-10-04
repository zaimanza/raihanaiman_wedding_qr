import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'
import { describe, expect, it } from 'vitest'
import { mp4ForPipe } from '../api/lib/_mp4'
import { prepareVideo, validateVideo } from '../api/lib/_video'
import { galleryVideoFixture } from './helpers/gallery-video'

function box(type: string, payload: Buffer, extended = false): Buffer {
  const header = Buffer.alloc(extended ? 16 : 8)
  header.writeUInt32BE(extended ? 1 : payload.length + 8)
  header.write(type, 4, 'ascii')
  if (extended) header.writeBigUInt64BE(BigInt(payload.length + 16), 8)
  return Buffer.concat([header, payload])
}

function movie(table: Buffer): Buffer {
  return ['stbl', 'minf', 'mdia', 'trak', 'moov'].reduce((inner, type) => box(type, inner), table)
}

function syntheticMp4(tableType = 'stco', extended = false): { data: Buffer, tablePosition: number } {
  const ftyp = box('ftyp', Buffer.from('isom\0\0\0\0isom'))
  const mdat = box('mdat', Buffer.alloc(32, 42), extended)
  const entries = Buffer.alloc(tableType === 'co64' ? 16 : 12)
  entries.writeUInt32BE(1, 4)
  const offset = ftyp.length + (extended ? 16 : 8)
  if (tableType === 'co64') entries.writeBigUInt64BE(BigInt(offset), 8)
  else entries.writeUInt32BE(offset, 8)
  const moov = movie(box(tableType, entries))
  return { data: Buffer.concat([ftyp, mdat, moov]), tablePosition: ftyp.length + mdat.length + 48 }
}

describe('gallery MP4 streaming preparation', () => {
  it('makes a regular gallery MP4 playable without changing video pixels and preserves audio', async () => {
    const input = galleryVideoFixture()
    expect(input.indexOf(Buffer.from('mdat'))).toBeLessThan(input.indexOf(Buffer.from('moov')))
    const prepared = mp4ForPipe(input)
    expect(prepared.length).toBe(input.length)
    expect(prepared.indexOf(Buffer.from('moov'))).toBeLessThan(prepared.indexOf(Buffer.from('mdat')))
    const output = await prepareVideo(validateVideo(input, 'video/mp4'))
    const hashes = (bytes: Buffer) => execFileSync(ffmpeg!, [
      '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-map', '0:v:0', '-f', 'framemd5', 'pipe:1',
    ], { input: bytes }).toString().split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1)?.trim())
    expect(hashes(output)).toHaveLength(48)
    expect(hashes(output)).toEqual(hashes(prepared))
    const audio = execFileSync(ffmpeg!, [
      '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-map', '0:a:0', '-f', 's16le', 'pipe:1',
    ], { input: output })
    expect([...audio].some(byte => byte !== 0)).toBe(true)
  })

  for (const tableType of ['stco', 'co64']) {
    it(`relocates ${tableType} offsets into an extended media box without mutating the upload`, () => {
      const { data } = syntheticMp4(tableType, true)
      const original = Buffer.from(data)
      const output = mp4ForPipe(data)
      expect(data).toEqual(original)
      const table = output.indexOf(Buffer.from(tableType))
      const offset = tableType === 'co64' ? Number(output.readBigUInt64BE(table + 12)) : output.readUInt32BE(table + 12)
      expect(output[offset]).toBe(42)
      expect(output.toString('ascii', 24, 28)).toBe('moov')
      expect(mp4ForPipe(output)).toBe(output)
    })
  }

  it('rejects broken box bounds, excessive box counts, and invalid metadata chunk offsets', () => {
    const { data, tablePosition } = syntheticMp4()
    const tooLong = Buffer.from(data)
    tooLong.writeUInt32BE(data.length + 1, 0)
    const outside = Buffer.from(data)
    outside.writeUInt32BE(data.length + 1, tablePosition + 8)
    const hugeCount = Buffer.from(data)
    hugeCount.writeUInt32BE(0xffffffff, tablePosition + 4)
    const hugeExtended = box('free', Buffer.alloc(0), true)
    hugeExtended.writeBigUInt64BE(0xffffffffffffffffn, 8)
    for (const bytes of [tooLong, outside, hugeCount, data.subarray(0, data.length - 1), hugeExtended, Buffer.concat(Array(4097).fill(box('free', Buffer.alloc(0))))]) {
      expect(() => mp4ForPipe(bytes)).toThrowError('INVALID_VIDEO')
    }
  })
})
