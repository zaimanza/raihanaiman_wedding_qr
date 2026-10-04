import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { describe, expect, it } from 'vitest';
import { prepareVideo, validateVideo } from '../api/lib/_video';
import { MAX_PHOTO_BYTES } from '../api/lib/_validation';

export function videoFixture(format: 'mp4' | 'webm' = 'webm'): Buffer {
  return execFileSync(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=12', '-t', '0.6', '-an', '-c:v', format === 'mp4' ? 'libx264' : 'libvpx', ...(format === 'mp4' ? ['-movflags','frag_keyframe+empty_moov'] : []), '-f', format, 'pipe:1']);
}

describe('bounded video processing', () => {
  it('preserves every decoded pixel of compatible MP4 rather than re-encoding it', async () => {
    const input = videoFixture('mp4');
    const output = await prepareVideo(validateVideo(input, 'video/mp4'));
    const hashes = (bytes: Buffer) => execFileSync(ffmpeg!, ['-hide_banner','-loglevel','error','-i','pipe:0','-map','0:v:0','-f','framemd5','pipe:1'], {input: bytes}).toString().split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1)?.trim());
    expect(hashes(output)).toEqual(hashes(input));
  });
  it('preserves a full minute of video and caps longer footage at 60 seconds', async () => {
    const input = execFileSync(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000', '-t', '62', '-c:a', 'aac', '-b:a', '48k', '-c:v', 'libx264', '-b:v', '200k', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'], {maxBuffer: MAX_PHOTO_BYTES});
    const output = await prepareVideo(validateVideo(input, 'video/mp4'));
    expect(output.length).toBeLessThan(MAX_PHOTO_BYTES);
    const progress = execFileSync(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-progress', 'pipe:1', '-f', 'null', '-'], { input: output }).toString();
    const times = [...progress.matchAll(/out_time_us=(\d+)/g)].map(match => Number(match[1]));
    expect(times.at(-1)).toBeGreaterThanOrEqual(59_000_000);
    expect(times.at(-1)).toBeLessThanOrEqual(60_100_000);
  }, 30_000);
  for (const format of ['mp4', 'webm'] as const) {
    it(`decodes actual ${format} footage and produces playable H.264 MP4`, async () => {
      const output = await prepareVideo(validateVideo(videoFixture(format), `video/${format}`));
      expect(output.toString('ascii',4,8)).toBe('ftyp');
      expect(output.length).toBeLessThan(MAX_PHOTO_BYTES);
      const info = execFileSync(ffmpeg!, ['-hide_banner','-i','pipe:0','-f','null','-'], {input: output, stdio:['pipe','pipe','pipe']});
      expect(info.length).toBe(0); // Full successful decode; bad videos make execFileSync throw.
    });
  }
  for (const format of ['mp4', 'webm'] as const) {
    it(`preserves audible audio through ${format} processing`, async () => {
      const input = execFileSync(ffmpeg!, ['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=160x120:rate=12','-f','lavfi','-i','sine=frequency=660:sample_rate=48000','-t','0.6','-c:v',format==='mp4'?'libx264':'libvpx','-c:a',format==='mp4'?'aac':'libopus',...(format==='mp4'?['-movflags','frag_keyframe+empty_moov']:[]),'-f',format,'pipe:1']);
      const output = await prepareVideo(validateVideo(input,`video/${format}`));
      const pcm = execFileSync(ffmpeg!, ['-hide_banner','-loglevel','error','-i','pipe:0','-map','0:a:0','-f','s16le','pipe:1'], {input:output});
      expect(pcm.length).toBeGreaterThan(1000);
      expect([...pcm].some(byte=>byte!==0)).toBe(true);
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
