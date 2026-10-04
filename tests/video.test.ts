import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { describe, expect, it } from 'vitest';
import { prepareVideo, validateVideo } from '../api/lib/_video';
import { MAX_PHOTO_BYTES } from '../api/lib/_validation';

export function videoFixture(format: 'mp4' | 'webm' = 'webm'): Buffer {
  return execFileSync(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=12', '-t', '0.6', '-an', '-c:v', format === 'mp4' ? 'libx264' : 'libvpx', ...(format === 'mp4' ? ['-movflags','frag_keyframe+empty_moov'] : []), '-f', format, 'pipe:1']);
}

describe('bounded video processing', () => {
  for (const format of ['mp4', 'webm'] as const) {
    it(`decodes actual ${format} footage and produces playable H.264 MP4`, async () => {
      const output = await prepareVideo(validateVideo(videoFixture(format), `video/${format}`));
      expect(output.toString('ascii',4,8)).toBe('ftyp');
      expect(output.length).toBeLessThan(MAX_PHOTO_BYTES);
      const info = execFileSync(ffmpeg!, ['-hide_banner','-i','pipe:0','-f','null','-'], {input: output, stdio:['pipe','pipe','pipe']});
      expect(info.length).toBe(0); // Full successful decode; bad videos make execFileSync throw.
    });
  }
  it('rejects wrong MIME types, signatures, empty or oversized uploads', () => {
    const webm = videoFixture();
    expect(() => validateVideo(webm, 'video/mp4')).toThrow();
    expect(() => validateVideo(webm, 'application/octet-stream')).toThrow();
    expect(() => validateVideo(Buffer.alloc(0), 'video/webm')).toThrow();
    expect(() => validateVideo(Buffer.alloc(MAX_PHOTO_BYTES + 1), 'video/webm')).toThrow();
  });
  it('rejects truncated media after signature validation instead of forwarding it', async () => {
    const truncated = videoFixture().subarray(0, 80);
    await expect(prepareVideo(validateVideo(truncated, 'video/webm'))).rejects.toMatchObject({code: 'INVALID_VIDEO'});
  });
});
