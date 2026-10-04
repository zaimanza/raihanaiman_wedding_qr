export const MAX_MEDIA_BYTES = 4 * 1024 * 1024
export const MAX_PHOTO_BYTES = MAX_MEDIA_BYTES
export const MAX_REQUEST_BYTES = Math.floor(4.125 * 1024 * 1024)
export const MAX_WISH_LENGTH = 800
export const MAX_NAME_LENGTH = 80

export class SubmissionError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly publicMessage: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code)
    this.name = 'SubmissionError'
  }
}

export function invalidRequest(): SubmissionError {
  return new SubmissionError(400, 'INVALID_REQUEST', 'Please take a new photo and try again ♡')
}

export function normalizeWish(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\t/g, ' ')
    .trim()
  // UTF-16 length is conservative for Telegram's caption character limit.
  if (normalized.length > MAX_WISH_LENGTH) {
    throw new SubmissionError(400, 'WISH_TOO_LONG', 'Please keep your wish to 800 characters ♡')
  }
  return normalized
}

export function normalizeName(value: string): string {
  const name = normalizeWish(value).replace(/\s+/g, ' ').trim()
  if (name.length > MAX_NAME_LENGTH) throw new SubmissionError(400, 'NAME_TOO_LONG', 'Please keep your name to 80 characters ♡')
  return name || 'Guest'
}

export function validateSubmissionId(value: string | undefined): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw invalidRequest()
  }
  return value.toLowerCase()
}

export function buildCaption(wish: string, now = new Date(), name = 'Guest'): string {
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: 'long', year: 'numeric',
  }).format(now)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(now).toUpperCase()
  const caption = `💌 Wedding ${wish ? 'Wish' : 'Memory'}\nFrom: ${normalizeName(name)}${wish ? `\n\n${wish}` : ''}\n\n${date} • ${time}`
  if (caption.length > 1024) throw invalidRequest()
  return caption
}
