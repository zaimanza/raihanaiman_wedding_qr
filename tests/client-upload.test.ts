import { describe, expect, it, vi } from 'vitest';
import { submitUploads } from '../src/services/submitUploads';
import type { UploadedMedia } from '../src/types/media';

const memory = (submissionId: string, sent = false): UploadedMedia => ({
  submissionId, sent, kind: 'photo', filename: `${submissionId}.jpg`,
  blob: new Blob(['photo'], { type: 'image/jpeg' }), downloadBlob: new Blob(['photo']), previewUrl: `blob:${submissionId}`,
});

describe('multi-memory submission', () => {
  it('records acknowledged files before a failure and retries only the remainder with stable IDs', async () => {
    const items = [memory('first'), memory('second'), memory('third')];
    const send = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Connection lost'));
    const onSent = vi.fn((id: string) => { items.find(item => item.submissionId === id)!.sent = true; });
    await expect(submitUploads(items, 'Wishing you happiness', '', 'Guest', onSent, send)).rejects.toThrow('Connection lost');
    expect(onSent).toHaveBeenCalledExactlyOnceWith('first');
    expect(send.mock.calls.map(call => call[0].submissionId)).toEqual(['first', 'second']);
    send.mockReset().mockResolvedValue(undefined);
    await submitUploads(items, 'Wishing you happiness', '', 'Guest', onSent, send);
    expect(send.mock.calls.map(call => call[0].submissionId)).toEqual(['second', 'third']);
    expect(send).toHaveBeenCalledWith(items[1], 'Wishing you happiness', '', 'Guest');
    expect(items.every(item => item.sent)).toBe(true);
  });

  it('awaits each delivery and never acknowledges an unconfirmed file', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const send = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(undefined);
    const onSent = vi.fn();
    const sending = submitUploads([memory('one'), memory('two')], '', '', '', onSent, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(onSent).not.toHaveBeenCalled();
    release();
    await sending;
    expect(send).toHaveBeenCalledTimes(2);
    expect(onSent.mock.calls).toEqual([['one'], ['two']]);
  });
});
