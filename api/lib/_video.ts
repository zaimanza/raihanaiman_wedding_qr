import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import { invalidRequest, MAX_MEDIA_BYTES, SubmissionError } from './_validation.ts'

export interface Video {
  kind: 'video'
  data: Buffer
  mime: 'video/mp4' | 'video/webm'
  extension: 'mp4' | 'webm'
}

export function validateVideo(data: Buffer, mime: string): Video {
  if (!data.length) throw invalidRequest()
  if (data.length > MAX_MEDIA_BYTES) throw new SubmissionError(413, 'MEDIA_TOO_LARGE', 'This video is a little too large. Please record a shorter one ♡')
  if (!['video/mp4', 'video/webm'].includes(mime)) throw new SubmissionError(415, 'UNSUPPORTED_VIDEO', 'Please record a new video using this camera ♡')
  if (mime === 'video/mp4') {
    if (data.length < 32 || data.toString('ascii', 4, 8) !== 'ftyp' || data.readUInt32BE(0) < 16 || data.readUInt32BE(0) > data.length) throw invalidRequest()
  } else if (data.length < 32 || data.readUInt32BE(0) !== 0x1a45dfa3 || !data.subarray(0, 256).includes(Buffer.from('webm'))) throw invalidRequest()
  return { kind: 'video', data, mime: mime as Video['mime'], extension: mime === 'video/mp4' ? 'mp4' : 'webm' }
}

/** Remux camera MP4 without quality loss; convert WebM only when necessary. */
export function prepareVideo(video: Video): Promise<Buffer> {
  const binary = ffmpegPath
  if (!binary) return Promise.reject(new SubmissionError(503, 'UNAVAILABLE', 'Video sending is unavailable just now. Please try again shortly ♡'))
  return new Promise((resolve, reject) => {
    const process = spawn(binary, [
      '-hide_banner', '-loglevel', 'error', '-nostdin', '-max_alloc', '16777216',
      '-protocol_whitelist', 'pipe', '-f', video.mime === 'video/mp4' ? 'mov' : 'matroska',
      '-threads', '1', '-max_pixels', '8000000', '-i', 'pipe:0',
      '-map', '0:v:0', '-an', '-t', '60',
      ...(video.mime === 'video/mp4' ? ['-c:v', 'copy'] : [
        '-filter_threads', '1', '-vf', 'scale=1080:1080:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=24',
        '-c:v', 'libx264', '-threads', '1', '-preset', 'veryfast', '-crf', '18',
        '-maxrate', '500k', '-bufsize', '1000k', '-pix_fmt', 'yuv420p',
      ]),
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let finished = false
    let bytes = 0
    let chunks: Buffer[] = []
    const fail = () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      chunks = []
      process.kill('SIGKILL')
      reject(new SubmissionError(422, 'INVALID_VIDEO', 'We couldn’t prepare this video. Please record it again ♡'))
    }
    const timer = setTimeout(fail, 30_000)
    timer.unref()
    process.on('error', fail)
    process.stdin.on('error', () => undefined) // Invalid input may close the decoder's pipe early.
    process.stderr.resume() // Drain diagnostics without leaking media details or retaining logs.
    process.stdout.on('data', (chunk: Buffer) => {
      if (finished) return
      bytes += chunk.length
      if (bytes > MAX_MEDIA_BYTES) fail()
      else chunks.push(chunk)
    })
    process.on('close', code => {
      if (finished) return
      if (code !== 0 || bytes < 256) { fail(); return }
      const result = Buffer.concat(chunks)
      let offset = 0
      let hasFrames = false
      while (offset + 8 <= result.length) {
        const size = result.readUInt32BE(offset)
        if (size < 8 || offset + size > result.length) break
        if (result.toString('ascii', offset + 4, offset + 8) === 'mdat' && size > 8) hasFrames = true
        offset += size
      }
      if (!hasFrames || offset !== result.length) { fail(); return }
      finished = true
      clearTimeout(timer)
      chunks = []
      resolve(result)
    })
    process.stdin.end(video.data)
  })
}
