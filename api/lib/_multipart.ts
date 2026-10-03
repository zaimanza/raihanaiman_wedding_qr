import busboy from 'busboy'
import type { IncomingMessage } from 'node:http'
import { validatePhoto, type Photo } from './_image.ts'
import { invalidRequest, MAX_PHOTO_BYTES, MAX_REQUEST_BYTES, normalizeWish, SubmissionError, validateSubmissionId } from './_validation.ts'

export interface Submission {
  photo: Photo
  wish: string
  submissionId: string
}

const oversized = () => new SubmissionError(413, 'PHOTO_TOO_LARGE', 'This photo is a little too large. Please retake it ♡')

export function parseSubmission(request: IncomingMessage): Promise<Submission> {
  const contentType = request.headers['content-type']
  if (typeof contentType !== 'string' || !/^multipart\/form-data(?:\s*;|$)/i.test(contentType) || contentType.length > 200) {
    return Promise.reject(new SubmissionError(415, 'INVALID_CONTENT_TYPE', 'Please take a new photo and try again ♡'))
  }
  const contentLength = request.headers['content-length']
  if (contentLength !== undefined && (typeof contentLength !== 'string' || !/^\d+$/.test(contentLength) || Number(contentLength) > MAX_REQUEST_BYTES)) {
    return Promise.reject(oversized())
  }
  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof busboy>
    try {
      parser = busboy({
        headers: request.headers,
        // Busboy emits "limit" when the size equals fileSize, so allow one sentinel byte;
        // validatePhoto independently enforces the inclusive maximum after parsing.
        limits: { fileSize: MAX_PHOTO_BYTES + 1, files: 1, fields: 4, parts: 5, fieldSize: 4000, fieldNameSize: 40, headerPairs: 32 },
      })
    } catch {
      reject(invalidRequest())
      return
    }
    let finished = false
    let requestBytes = 0
    let photoBuffer: Buffer | undefined
    let photoMime = ''
    let fileSeen = false
    const fields = new Map<string, string>()
    let chunks: Buffer[] = []
    const timeout = setTimeout(() => fail(new SubmissionError(408, 'UPLOAD_TIMEOUT', 'The connection is taking a little too long. Please try again ♡')), 25_000)
    timeout.unref()

    function cleanup() {
      clearTimeout(timeout)
      request.off('data', countBytes)
      request.off('aborted', aborted)
      request.off('error', requestError)
      chunks = []
    }
    function fail(error: SubmissionError) {
      if (finished) return
      finished = true
      cleanup()
      photoBuffer = undefined
      request.unpipe(parser)
      // Drain the request without retaining bytes, allowing the error response to reach the guest.
      request.once('error', () => undefined)
      request.resume()
      // Busboy can still be inside a file/field callback; destroying after that callback avoids reentrancy.
      queueMicrotask(() => parser.destroy())
      reject(error)
    }
    function countBytes(chunk: Buffer) {
      requestBytes += chunk.length
      if (requestBytes > MAX_REQUEST_BYTES) fail(oversized())
    }
    function aborted() { fail(invalidRequest()) }
    function requestError() { fail(invalidRequest()) }

    request.on('data', countBytes)
    request.once('aborted', aborted)
    request.once('error', requestError)
    parser.on('error', () => fail(invalidRequest()))
    parser.on('filesLimit', () => fail(invalidRequest()))
    parser.on('fieldsLimit', () => fail(invalidRequest()))
    parser.on('partsLimit', () => fail(invalidRequest()))
    parser.on('field', (name, value, info) => {
      if (finished) return
      if (!['wish', 'submissionId', 'website'].includes(name) || fields.has(name) || info.nameTruncated || info.valueTruncated) {
        fail(invalidRequest())
        return
      }
      fields.set(name, value)
    })
    parser.on('file', (name, stream, info) => {
      stream.on('error', () => fail(invalidRequest()))
      if (finished || fileSeen || name !== 'photo') {
        stream.resume()
        fail(invalidRequest())
        return
      }
      fileSeen = true
      photoMime = info.mimeType
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(photoMime)) {
        stream.resume()
        fail(new SubmissionError(415, 'UNSUPPORTED_PHOTO', 'Please take a new photo using this camera ♡'))
        return
      }
      stream.on('limit', () => fail(oversized()))
      stream.on('data', (chunk: Buffer) => { if (!finished) chunks.push(chunk) })
      stream.on('end', () => {
        if (!finished) {
          photoBuffer = Buffer.concat(chunks)
          chunks = []
        }
      })
    })
    parser.on('close', () => {
      if (finished) return
      try {
        if (!photoBuffer || (fields.get('website') ?? '').trim()) throw invalidRequest()
        const submission: Submission = {
          photo: validatePhoto(photoBuffer, photoMime),
          wish: normalizeWish(fields.get('wish') ?? ''),
          submissionId: validateSubmissionId(fields.get('submissionId')),
        }
        finished = true
        cleanup()
        photoBuffer = undefined
        resolve(submission)
      } catch (error) {
        fail(error instanceof SubmissionError ? error : invalidRequest())
      }
    })
    if (request.readableEnded) {
      // Vercel's optional Node helpers can consume the original stream and override read()
      // with an in-memory replay. Support that runtime too, while still enforcing our cap.
      const replay: unknown = request.read()
      if (!Buffer.isBuffer(replay)) fail(invalidRequest())
      else if (replay.length > MAX_REQUEST_BYTES) fail(oversized())
      else parser.end(replay)
    } else {
      request.pipe(parser)
    }
  })
}
