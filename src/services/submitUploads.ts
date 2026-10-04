import type { UploadedMedia } from '../types/media';
import { submitMemory } from './submit';

/** Each file fits the API budget; acknowledgements survive a partial failure in the draft. */
export async function submitUploads(
  items: UploadedMedia[],
  wish: string,
  website: string,
  guestName: string,
  onSent: (submissionId: string) => void,
  send: typeof submitMemory = submitMemory,
) {
  for (const item of items) {
    if (item.sent) continue;
    await send(item, wish, website, guestName);
    onSent(item.submissionId);
  }
}
