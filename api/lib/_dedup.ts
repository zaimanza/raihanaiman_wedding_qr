import { createHash } from 'node:crypto'
import type { Submission } from './_multipart.ts'
import { SubmissionError } from './_validation.ts'

interface Entry {
  hash: string
  expiresAt: number
  pending?: Promise<void>
}

/** Warm-instance protection only: no photo/wish is kept in this map or persisted. */
export class SubmissionDeduplicator {
  private readonly entries = new Map<string, Entry>()
  constructor(private readonly maximumEntries = 1024, private readonly ttlMs = 5 * 60_000) {}

  async run(submission: Submission, operation: () => Promise<void>): Promise<void> {
    const now = Date.now()
    for (const [id, entry] of this.entries) {
      if (!entry.pending && entry.expiresAt <= now) this.entries.delete(id)
    }
    const hash = createHash('sha256')
      .update(submission.media.kind).update('\0').update(submission.media.mime).update('\0')
      .update(submission.media.data).update('\0')
      .update(submission.wish).digest('hex')
    const existing = this.entries.get(submission.submissionId)
    if (existing) {
      if (existing.hash !== hash) {
        throw new SubmissionError(409, 'SUBMISSION_CHANGED', 'Please retake your photo before sending a new wish ♡')
      }
      if (existing.pending) await existing.pending
      return
    }
    if (this.entries.size >= this.maximumEntries) {
      // Evict a completed hash first, preserving all active uploads.
      const completed = [...this.entries].find(([, entry]) => !entry.pending)
      if (completed) this.entries.delete(completed[0])
      else throw new SubmissionError(503, 'BUSY', 'So many lovely memories are arriving. Please try again in a moment ♡', 3)
    }
    const entry: Entry = { hash, expiresAt: now + this.ttlMs }
    // Deferring operation prevents synchronous work from starting before the lock exists.
    const pending = Promise.resolve().then(operation)
    entry.pending = pending
    this.entries.set(submission.submissionId, entry)
    try {
      await pending
      entry.pending = undefined
      entry.expiresAt = Date.now() + this.ttlMs
    } catch (error) {
      this.entries.delete(submission.submissionId)
      throw error
    }
  }
}
