import type { CapturedMedia } from '../types/media';
import { mediaFilename } from '../utils/download';

export class SubmissionError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds = 0) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function submitMemory(media: CapturedMedia, wish: string, website: string) {
  const data = new FormData();
  data.append(media.kind, media.blob, mediaFilename(media));
  data.append('wish', wish);
  data.append('submissionId', media.submissionId);
  data.append('website', website);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    const response = await fetch('/api/submit', {
      method: 'POST', body: data, credentials: 'same-origin', cache: 'no-store',
      signal: controller.signal,
    });
    const result: unknown = await response.json().catch(() => null);
    if (response.ok && typeof result === 'object' && result !== null && 'ok' in result && result.ok === true) return;
    const retryAfter = typeof result === 'object' && result !== null && 'retryAfterSeconds' in result && typeof result.retryAfterSeconds === 'number' && Number.isFinite(result.retryAfterSeconds)
      ? Math.min(3600, Math.max(0, Math.ceil(result.retryAfterSeconds))) : 0;
    if (response.status === 429) {
      throw new SubmissionError("So many lovely memories arriving at once. Please give us a little moment ♡", retryAfter || 10);
    }
    if (response.status === 413) throw new SubmissionError(`This ${media.kind} is a little too large. Please retake it ♡`);
    throw new SubmissionError(`That didn’t quite make it through. Your ${media.kind} is still here — please try again ♡`, retryAfter);
  } catch (cause) {
    if (cause instanceof SubmissionError) throw cause;
    throw new SubmissionError(`The connection slipped away. Your ${media.kind} is still here — please try again ♡`);
  } finally {
    clearTimeout(timeout);
  }
}
