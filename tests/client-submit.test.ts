import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitMemory } from '../src/services/submit';
import type { CapturedPhoto } from '../src/types/photo';

const photo: CapturedPhoto = { blob: new Blob(['test'], { type: 'image/jpeg' }), previewUrl: 'blob:memory', submissionId: 'db8dfc65-cb28-463f-99b9-ed02fa48a91d' };
afterEach(() => vi.unstubAllGlobals());

describe('submission client', () => {
  it('only acknowledges a confirmed successful response and sends multipart to the same origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await submitMemory(photo, 'With love ♡', '');
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/submit');
    expect(request.body.get('wish')).toBe('With love ♡');
    expect(request.body.get('submissionId')).toBe(photo.submissionId);
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(request.headers).toBeUndefined(); // Browser provides the multipart boundary.
  });
  it('does not expose upstream error messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: false, message: 'token=SECRET upstream stacktrace' }, { status: 502 })));
    await expect(submitMemory(photo, '', '')).rejects.toThrow('Your photo is still here');
  });
  it('honors a provider wait longer than five minutes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: false, retryAfterSeconds: 600 }, { status: 429 })));
    await expect(submitMemory(photo, '', '')).rejects.toMatchObject({ retryAfterSeconds: 600 });
  });
  it('rejects HTML platform errors and malformed success responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Error</html>', { status: 200 })));
    await expect(submitMemory(photo, '', '')).rejects.toThrow();
  });
  it('retains a safe retry error on network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network failed')));
    await expect(submitMemory(photo, '', '')).rejects.toThrow('Your photo is still here');
  });
});
