import type { Submission } from './_multipart.ts'
import { buildCaption, SubmissionError } from './_validation.ts'

export interface TelegramConfiguration {
  botToken: string
  chatId: string
}

export interface SafeLogData {
  event: string
  requestId: string
  code?: string
  upstreamStatus?: number
  upstreamCode?: number
}

export type SafeLogger = (data: SafeLogData) => void

export function readTelegramConfiguration(): TelegramConfiguration {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim()
  if (!botToken || !/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(botToken) || !chatId || !/^-\d{1,20}$/.test(chatId)) {
    throw new SubmissionError(503, 'UNAVAILABLE', 'Our little memory book is unavailable just now. Please try again shortly ♡')
  }
  return { botToken, chatId }
}

function retryDelay(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(3600, Math.max(1, Math.ceil(value)))
    : undefined
}

export async function sendToTelegram(
  submission: Submission,
  configuration: TelegramConfiguration,
  requestId: string,
  log: SafeLogger,
  fetchImplementation: typeof fetch = fetch,
  timeoutMs = 20_000,
): Promise<void> {
  const form = new FormData()
  form.append('chat_id', configuration.chatId)
  form.append('caption', buildCaption(submission.wish))
  // A plain caption deliberately omits parse_mode: guests' punctuation cannot become markup.
  form.append('photo', new Blob([new Uint8Array(submission.photo.data)], { type: submission.photo.mime }), `wedding-memory.${submission.photo.extension}`)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  timeout.unref()
  try {
    const response = await fetchImplementation(`https://api.telegram.org/bot${configuration.botToken}/sendPhoto`, {
      method: 'POST', body: form, signal: controller.signal, redirect: 'error',
    })
    let payload: unknown
    try { payload = await response.json() } catch { payload = undefined }
    const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
    const upstreamCode = typeof body.error_code === 'number' && Number.isInteger(body.error_code) ? body.error_code : undefined
    const result = body.result && typeof body.result === 'object' ? body.result as Record<string, unknown> : undefined
    if (response.ok && body.ok === true && result && Number.isInteger(result.message_id)) return
    log({ event: 'telegram_rejected', requestId, upstreamStatus: response.status, upstreamCode })
    if (response.status === 429 || upstreamCode === 429) {
      const parameters = body.parameters && typeof body.parameters === 'object' ? body.parameters as Record<string, unknown> : undefined
      const retryAfter = retryDelay(parameters?.retry_after) ?? retryDelay(Number(response.headers.get('retry-after'))) ?? 30
      throw new SubmissionError(429, 'PLEASE_WAIT', 'So many lovely memories are arriving. Please try again in a moment ♡', retryAfter)
    }
    throw new SubmissionError(502, 'SEND_FAILED', "That didn't quite make it through. Please try again ♡")
  } catch (error) {
    if (error instanceof SubmissionError) throw error
    // Never log fetch errors or URLs: the Telegram URL contains the secret bot token.
    log({ event: controller.signal.aborted ? 'telegram_timeout' : 'telegram_network_error', requestId })
    throw new SubmissionError(controller.signal.aborted ? 504 : 502, controller.signal.aborted ? 'SEND_TIMEOUT' : 'SEND_FAILED', "That didn't quite make it through. Please try again ♡")
  } finally {
    clearTimeout(timeout)
  }
}
