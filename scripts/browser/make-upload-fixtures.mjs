import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

// Isolated, synthetic browser fixtures. The application never imports qrcode.
const directory = resolve('output/playwright/upload-fixtures');
mkdirSync(directory, { recursive: true });
const file = name => resolve(directory, name);
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
};
const encode = args => run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

run('npx', ['--yes', '--package', 'qrcode@1.5.4', 'qrcode', '--width', '384', '--qzone', '4', '--output', file('qr-not-allowed.png'), 'https://example.invalid/wedding-qr-test']);
encode(['-f', 'lavfi', '-i', 'color=c=0x748975:s=640x480', '-vf', 'drawbox=x=100:y=100:w=160:h=200:color=0xefe8d8:t=fill', '-frames:v', '1', '-q:v', '2', file('garden-photo.jpg')]);
encode(['-f', 'lavfi', '-i', 'color=c=0xb89a80:s=640x480', '-vf', 'drawbox=x=350:y=70:w=140:h=250:color=0xf8edd8:t=fill', '-frames:v', '1', '-q:v', '2', file('celebration-photo.jpg')]);
const videoArgs = ['-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'ultrafast', '-crf', '24', '-movflags', '+faststart', '-t', '4'];
encode(['-f', 'lavfi', '-i', 'color=c=0x748975:s=640x480:r=10:d=4', '-vf', 'drawbox=x=100:y=100:w=160:h=200:color=0xefe8d8:t=fill', ...videoArgs, file('garden-video.mp4')]);
encode(['-f', 'lavfi', '-i', 'color=c=0x748975:s=640x480:r=10:d=4', '-vf', 'drawbox=x=100:y=100:w=160:h=200:color=0xefe8d8:t=fill', '-an', '-c:v', 'libvpx', '-b:v', '400k', '-pix_fmt', 'yuv420p', '-t', '4', file('garden-video.webm')]);
// The QR occupies one frame at 2.6 seconds. Sparse thumbnail scans miss it.
encode(['-f', 'lavfi', '-i', 'color=c=0xf3ead9:s=640x480:r=10:d=4', '-loop', '1', '-i', file('qr-not-allowed.png'), '-filter_complex', "[0:v][1:v]overlay=x=128:y=48:enable='between(t,2.6,2.65)'", ...videoArgs, file('qr-late-video.mp4')]);
console.log(`Created synthetic upload fixtures in ${directory}`);
