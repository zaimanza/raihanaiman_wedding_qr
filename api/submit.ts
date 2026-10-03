import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SubmissionDeduplicator } from './lib/_dedup.ts'
import { parseSubmission } from './lib/_multipart.ts'
import { readTelegramConfiguration, sendToTelegram, type SafeLogger } from './lib/_telegram.ts'
import { SubmissionError } from './lib/_validation.ts'

const deduplicator = new SubmissionDeduplicator()

export function validateRequestOrigin(request: IncomingMessage): void {
  const fetchSite = request.headers['sec-fetch-site']
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') {
    throw new SubmissionError(403, 'INVALID_ORIGIN', 'Please open the wedding camera and try again ♡')
  }
  const origin = request.headers.origin
  if (!origin) return // Non-browser tools may omit Origin; this is CSRF protection, not authentication.
  const host = request.headers.host
  try {
    if (typeof origin !== 'string' || typeof host !== 'string') throw new Error('invalid')
    const originUrl = new URL(origin)
    const hostUrl = new URL(`http://${host}`)
    const forwardedProtocol = request.headers['x-forwarded-proto']
    const protocol = forwardedProtocol === 'https' || process.env.VERCEL === '1'
      ? 'https:'
      : forwardedProtocol === 'http' ? 'http:'
        : (request.socket as IncomingMessage['socket'] & { encrypted?: boolean }).encrypted ? 'https:' : 'http:'
    if (originUrl.origin !== origin || originUrl.host !== hostUrl.host || originUrl.protocol !== protocol || hostUrl.host !== host || hostUrl.pathname !== '/' || hostUrl.username || hostUrl.password) throw new Error('invalid')
  } catch {
    throw new SubmissionError(403, 'INVALID_ORIGIN', 'Please open the wedding camera and try again ♡')
  }
}

const safeLogger: SafeLogger = (data) => console.warn(JSON.stringify(data))

export interface HandlerDependencies {
  fetchImplementation?: typeof fetch
  deduplicator?: SubmissionDeduplicator
  log?: SafeLogger
  telegramTimeoutMs?: number
}

/** Factory lets integration tests exercise the actual HTTP endpoint without calling Telegram. */
export function createSubmitHandler(dependencies: HandlerDependencies = {}) {
  const log = dependencies.log ?? safeLogger
  const duplicates = dependencies.deduplicator ?? deduplicator
  return async function submit(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.setHeader('Cache-Control', 'no-store, max-age=0')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    const requestId = randomUUID()
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST')
      response.statusCode = 405
      response.end(JSON.stringify({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Please use the wedding camera to send your memory ♡' }))
      return
    }
    try {
      validateRequestOrigin(request)
      const configuration = readTelegramConfiguration()
      const submission = await parseSubmission(request)
      await duplicates.run(submission, () => sendToTelegram(
        submission, configuration, requestId, log, dependencies.fetchImplementation, dependencies.telegramTimeoutMs,
      ))
      // Acknowledgement is sent only after Telegram confirms delivery (or a confirmed duplicate).
      response.statusCode = 200
      response.end(JSON.stringify({ ok: true }))
    } catch (error) {
      const failure = error instanceof SubmissionError ? error : new SubmissionError(500, 'SEND_FAILED', "That didn't quite make it through. Please try again ♡")
      if (failure.status >= 500) log({ event: 'submission_failed', requestId, code: failure.code })
      if (failure.retryAfterSeconds) response.setHeader('Retry-After', String(failure.retryAfterSeconds))
      response.statusCode = failure.status
      response.end(JSON.stringify({
        ok: false, code: failure.code, message: failure.publicMessage,
        ...(failure.retryAfterSeconds ? { retryAfterSeconds: failure.retryAfterSeconds } : {}),
      }))
    }
  }
}

// Set NODEJS_HELPERS=0 in Vercel to preserve the raw request stream for bounded multipart parsing.
export default createSubmitHandler()
