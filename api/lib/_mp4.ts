import { MAX_MEDIA_BYTES, SubmissionError } from './_validation.ts'

interface Box {
  type: string
  start: number
  payload: number
  end: number
}

const invalidVideo = () => new SubmissionError(422, 'INVALID_VIDEO', 'We couldn’t prepare this video. Please choose another one ♡')

function boxes(data: Buffer, start = 0, end = data.length): Box[] {
  const result: Box[] = []
  while (start < end) {
    if (end - start < 8) throw invalidVideo()
    let size = data.readUInt32BE(start)
    let header = 8
    if (size === 1) {
      if (end - start < 16) throw invalidVideo()
      const extended = data.readBigUInt64BE(start + 8)
      if (extended > BigInt(end - start)) throw invalidVideo()
      size = Number(extended)
      header = 16
    } else if (size === 0) size = end - start
    if (size < header || size > end - start) throw invalidVideo()
    if (result.length >= 4096) throw invalidVideo()
    result.push({ type: data.toString('ascii', start + 4, start + 8), start, payload: start + header, end: start + size })
    start += size
  }
  return result
}

/** Put a gallery MP4's late moov before its media, fixing chunk offsets in bounded memory. */
export function mp4ForPipe(data: Buffer): Buffer {
  if (data.length > MAX_MEDIA_BYTES) throw invalidVideo()
  const top = boxes(data)
  const movies = top.filter(box => box.type === 'moov')
  const media = top.filter(box => box.type === 'mdat')
  if (movies.length !== 1 || media.length === 0) throw invalidVideo()
  const movie = movies[0]!
  const insertion = media[0]!.start
  if (movie.start < insertion) return data // Camera recordings and fast-start MP4 already stream.
  if (top.some(box => box.type === 'moof')) throw invalidVideo()

  const movieSize = movie.end - movie.start
  const relocated = Buffer.from(data.subarray(movie.start, movie.end))
  // An atom extending to EOF must have an explicit size once it is moved.
  if (relocated.readUInt32BE(0) === 0) relocated.writeUInt32BE(movieSize, 0)
  let tables = 0
  const containers = ['trak', 'mdia', 'minf', 'stbl']
  function isMediaOffset(offset: bigint): boolean {
    if (offset >= BigInt(data.length)) return false
    const position = Number(offset)
    let low = 0
    let high = media.length - 1
    while (low <= high) {
      const middle = (low + high) >>> 1
      const box = media[middle]!
      if (position < box.payload) high = middle - 1
      else if (position >= box.end) low = middle + 1
      else return true
    }
    return false
  }
  function updateChildren(start: number, end: number, depth: number): void {
    if (depth > 4) throw invalidVideo()
    for (const box of boxes(relocated, start, end)) {
      if (containers.includes(box.type)) {
        updateChildren(box.payload, box.end, depth + 1)
      } else if (box.type === 'stco' || box.type === 'co64') {
        if (box.end - box.payload < 8 || relocated.readUInt32BE(box.payload) !== 0) throw invalidVideo()
        const count = relocated.readUInt32BE(box.payload + 4)
        const width = box.type === 'stco' ? 4 : 8
        if (count * width !== box.end - box.payload - 8) throw invalidVideo()
        tables++
        for (let index = 0; index < count; index++) {
          const position = box.payload + 8 + index * width
          const original = width === 4 ? BigInt(relocated.readUInt32BE(position)) : relocated.readBigUInt64BE(position)
          // No external data references or offsets into metadata are accepted.
          if (!isMediaOffset(original)) throw invalidVideo()
          const shifted = original >= BigInt(insertion) && original < BigInt(movie.start)
            ? original + BigInt(movieSize) : original
          if (width === 4) relocated.writeUInt32BE(Number(shifted), position)
          else relocated.writeBigUInt64BE(shifted, position)
        }
      }
    }
  }
  updateChildren(movie.payload - movie.start, movieSize, 0)
  if (!tables) throw invalidVideo()
  return Buffer.concat([
    data.subarray(0, insertion), relocated, data.subarray(insertion, movie.start), data.subarray(movie.end),
  ], data.length)
}
