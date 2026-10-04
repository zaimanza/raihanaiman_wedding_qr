import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'
import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSubmitHandler } from '../api/submit'
import { SubmissionDeduplicator } from '../api/lib/_dedup'
import { parseSubmission } from '../api/lib/_multipart'
import type { SafeLogger } from '../api/lib/_telegram'
import { MAX_PHOTO_BYTES, MAX_REQUEST_BYTES } from '../api/lib/_validation'

const photo = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5S8AAAAASUVORK5CYII=', 'base64')
const fakeToken = '123456789:fakeTokenForTestsOnlyNeverUsedOnline'
const telegramSuccess = () => new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 })

describe('POST /api/submit', () => {
  let server: Server
  let baseUrl: string
  let telegram: ReturnType<typeof vi.fn<typeof fetch>>
  let log: ReturnType<typeof vi.fn<SafeLogger>>

  beforeEach(async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', fakeToken)
    vi.stubEnv('TELEGRAM_CHAT_ID', '-1001234567890')
    vi.stubEnv('VERCEL', '')
    telegram = vi.fn<typeof fetch>().mockImplementation(async () => telegramSuccess())
    log = vi.fn<SafeLogger>()
    const handler = createSubmitHandler({ fetchImplementation: telegram, deduplicator: new SubmissionDeduplicator(), log, telegramTimeoutMs: 30 })
    server = createServer((request, response) => void handler(request, response))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing HTTP test server')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    vi.unstubAllEnvs()
  })

  function form(id = randomUUID(), wish = 'Selamat pengantin baru ❤️') {
    const data = new FormData()
    data.append('photo', new Blob([photo], { type: 'image/png' }), 'memory.png')
    data.append('wish', wish)
    data.append('submissionId', id)
    data.append('website', '')
    return data
  }

  function post(body = form(), headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}/api/submit`, { method: 'POST', body, headers: { Origin: baseUrl, ...headers } })
  }

  it('forwards a valid photo and normalized caption, and acknowledges only confirmed Telegram delivery', async () => {
    const response = await post(form(randomUUID(), '  Love\r\nforever\u0000 ❤️  '))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(telegram).toHaveBeenCalledTimes(1)
    const [url, options] = telegram.mock.calls[0]!
    expect(url).toBe(`https://api.telegram.org/bot${fakeToken}/sendPhoto`)
    expect(options?.method).toBe('POST')
    const outbound = options?.body as FormData
    expect(outbound.get('chat_id')).toBe('-1001234567890')
    expect(outbound.get('caption')).toContain('Love\nforever ❤️')
    expect(outbound.has('parse_mode')).toBe(false)
    expect(Buffer.from(await (outbound.get('photo') as Blob).arrayBuffer())).toEqual(photo)
  })

  it('converts a real WebM upload to sendVideo and keeps its wish as the caption', async () => {
    const bytes = execFileSync(ffmpeg!, ['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=160x120:rate=12','-t','0.4','-an','-c:v','libvpx','-f','webm','pipe:1']);
    const data = form(); data.delete('photo');
    data.append('video', new Blob([bytes], {type:'video/webm'}), 'video.webm');
    expect((await post(data)).status).toBe(200);
    expect(String(telegram.mock.calls[0]![0])).toMatch(/\/sendVideo$/);
    const sent = telegram.mock.calls[0]![1]?.body as FormData;
    expect(sent.has('photo')).toBe(false);
    expect(sent.get('supports_streaming')).toBe('true');
    expect(sent.get('video')).toMatchObject({type:'video/mp4'});
    expect(sent.get('caption')).toContain('Selamat pengantin baru');
  });

  it('uploads a photo successfully without a wish', async () => {
    const data = form()
    data.delete('wish')
    expect((await post(data)).status).toBe(200)
    expect((telegram.mock.calls[0]![1]?.body as FormData).get('caption')).toContain('Wedding Memory')
  })

  it('rejects wrong methods and cross-origin browser requests without invoking Telegram', async () => {
    expect((await fetch(`${baseUrl}/api/submit`)).status).toBe(405)
    expect((await post(form(), { Origin: 'https://evil.example' })).status).toBe(403)
    expect((await post(form(), { 'Sec-Fetch-Site': 'same-site' })).status).toBe(403)
    expect((await post(form(), { Origin: 'null' })).status).toBe(403)
    expect(telegram).not.toHaveBeenCalled()
  })

  it('returns a safe unavailable response for missing or malformed server configuration', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    const response = await post()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ ok: false, code: 'UNAVAILABLE' })
    expect(telegram).not.toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain(fakeToken)
  })

  it('rejects malformed or wrong content types, duplicate fields and unexpected fields', async () => {
    const malformed = await fetch(`${baseUrl}/api/submit`, { method: 'POST', headers: { Origin: baseUrl, 'Content-Type': 'multipart/form-data' }, body: 'missing boundary' })
    expect(malformed.status).toBe(400)
    const wrong = await fetch(`${baseUrl}/api/submit`, { method: 'POST', headers: { Origin: baseUrl, 'Content-Type': 'application/json' }, body: '{}' })
    expect(wrong.status).toBe(415)
    for (const name of ['wish', 'unexpected']) {
      const data = form()
      data.append(name, 'extra')
      expect((await post(data)).status).toBe(400)
    }
    expect(telegram).not.toHaveBeenCalled()
  })

  it('rejects empty, mismatched, missing, oversized and multiple photos', async () => {
    for (const [bytes, mime, expected] of [[Buffer.alloc(0), 'image/png', 400], [photo, 'image/jpeg', 400], [Buffer.from('<svg/>'), 'image/svg+xml', 415], [Buffer.alloc(MAX_PHOTO_BYTES + 1), 'image/png', 413]] as const) {
      const data = form()
      data.set('photo', new Blob([bytes], { type: mime }), 'photo')
      expect((await post(data)).status).toBe(expected)
    }
    const missing = form()
    missing.delete('photo')
    expect((await post(missing)).status).toBe(400)
    const multiple = form()
    multiple.append('photo', new Blob([photo], { type: 'image/png' }), 'second.png')
    expect((await post(multiple)).status).toBe(400)
    expect(telegram).not.toHaveBeenCalled()
  })

  it('accepts a structurally valid photo exactly at the inclusive 3MiB file limit', async () => {
    // JPEG container fixture with a large scan payload; the upstream decoder is mocked.
    const data = Buffer.alloc(MAX_PHOTO_BYTES, 1)
    data.set([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 4, 56, 7, 128, 1, 1, 0x11, 0, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0])
    data.set([0xff, 0xd9], data.length - 2)
    const request = form()
    request.set('photo', new Blob([data], { type: 'image/jpeg' }), 'limit.jpg')
    const response = await post(request)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect((telegram.mock.calls[0]![1]?.body as FormData).get('photo')).toMatchObject({ size: MAX_PHOTO_BYTES })

    const oversized = form()
    oversized.set('photo', new Blob([Buffer.concat([data, Buffer.from([1])])], { type: 'image/jpeg' }), 'over-limit.jpg')
    expect((await post(oversized)).status).toBe(413)
    expect(telegram).toHaveBeenCalledTimes(1)
  })

  it('rejects oversized requests before buffering the body', async () => {
    const response = await fetch(`${baseUrl}/api/submit`, {
      method: 'POST', headers: { Origin: baseUrl, 'Content-Type': 'multipart/form-data; boundary=test' },
      body: new Uint8Array(MAX_REQUEST_BYTES + 1),
    })
    expect(response.status).toBe(413)
    expect(telegram).not.toHaveBeenCalled()
  })

  it('handles Vercel helper replay buffers as well as a raw Node stream', async () => {
    const id = randomUUID()
    const encoded = new Request(`${baseUrl}/api/submit`, { method: 'POST', body: form(id) })
    const bytes = Buffer.from(await encoded.arrayBuffer())
    const consumed = new PassThrough() as unknown as IncomingMessage
    consumed.headers = { 'content-type': encoded.headers.get('content-type')! }
    const ended = new Promise<void>((resolve) => consumed.on('end', resolve))
    consumed.resume()
    ;(consumed as unknown as PassThrough).end(bytes)
    await ended
    expect(consumed.readableEnded).toBe(true)
    // Mirrors Vercel's restoreBody override after eagerly reading the original IncomingMessage.
    consumed.read = () => bytes
    const submission = await parseSubmission(consumed)
    expect(submission.submissionId).toBe(id)
    expect(submission.media.data).toEqual(photo)
  })

  it('enforces file limits for chunked requests without a Content-Length', async () => {
    const encoded = new Request(`${baseUrl}/api/submit`, { method: 'POST', body: form() })
    const bytes = Buffer.from(await encoded.arrayBuffer())
    const photoStart = bytes.indexOf(photo)
    const oversizedBytes = Buffer.concat([bytes.subarray(0, photoStart), Buffer.alloc(MAX_PHOTO_BYTES + 1), bytes.subarray(photoStart + photo.length)])
    const streamed = new PassThrough() as unknown as IncomingMessage
    streamed.headers = { 'content-type': encoded.headers.get('content-type')! }
    const result = parseSubmission(streamed)
    const asserted = expect(result).rejects.toMatchObject({ status: 413 })
    ;(streamed as unknown as PassThrough).end(oversizedBytes)
    await asserted
    expect(telegram).not.toHaveBeenCalled()
  })

  it('rejects invalid wish length, malformed IDs and the bot honeypot', async () => {
    for (const [name, value] of [['wish', 'x'.repeat(801)], ['submissionId', 'invalid'], ['website', 'https://spam.example']]) {
      const data = form()
      data.set(name!, value!)
      expect((await post(data)).status).toBe(400)
    }
    expect(telegram).not.toHaveBeenCalled()
  })

  it('coalesces in-flight duplicates and recognizes confirmed retries on the same warm instance', async () => {
    let confirm!: (response: Response) => void
    telegram.mockImplementationOnce(() => new Promise((resolve) => { confirm = resolve }))
    const id = randomUUID()
    const first = post(form(id))
    const second = post(form(id))
    await vi.waitFor(() => expect(telegram).toHaveBeenCalledTimes(1))
    confirm(telegramSuccess())
    expect((await first).status).toBe(200)
    expect((await second).status).toBe(200)
    expect((await post(form(id))).status).toBe(200)
    expect(telegram).toHaveBeenCalledTimes(1)
    expect((await post(form(id, 'A different wish'))).status).toBe(409)
    expect(telegram).toHaveBeenCalledTimes(1)
  })

  it('allows guests with different submission IDs to upload concurrently', async () => {
    const responses = await Promise.all([post(), post(), post()])
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200])
    expect(telegram).toHaveBeenCalledTimes(3)
  })

  it('returns friendly Telegram failures and lets the same capture be retried', async () => {
    telegram.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error_code: 403, description: `Secret description ${fakeToken}` }), { status: 403 }))
    const id = randomUUID()
    const response = await post(form(id))
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ ok: false, code: 'SEND_FAILED' })
    expect(JSON.stringify(log.mock.calls)).not.toContain(fakeToken)
    expect(JSON.stringify(log.mock.calls)).not.toContain('Selamat')
    expect((await post(form(id))).status).toBe(200)
    expect(telegram).toHaveBeenCalledTimes(2)
  })

  it('honors Telegram retry_after without automatically resending', async () => {
    telegram.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error_code: 429, parameters: { retry_after: 18 } }), { status: 429 }))
    const response = await post()
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('18')
    expect(await response.json()).toMatchObject({ ok: false, code: 'PLEASE_WAIT', retryAfterSeconds: 18 })
    expect(telegram).toHaveBeenCalledTimes(1)
  })

  it('does not claim success on malformed or unconfirmed upstream responses', async () => {
    for (const response of [new Response('broken'), new Response(JSON.stringify({ ok: true })), new Response(JSON.stringify({ ok: false }))]) {
      telegram.mockResolvedValueOnce(response)
      expect((await post()).status).toBe(502)
    }
  })

  it('aborts slow Telegram requests and does not leak the fetch error URL', async () => {
    telegram.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error(`Aborted secret URL ${fakeToken}`)), { once: true })
    }))
    const response = await post()
    expect(response.status).toBe(504)
    expect(await response.json()).toMatchObject({ ok: false, code: 'SEND_TIMEOUT' })
    expect(JSON.stringify(log.mock.calls)).not.toContain(fakeToken)
    expect(telegram).toHaveBeenCalledTimes(1)
  })
})
