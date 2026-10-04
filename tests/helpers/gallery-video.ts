import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpeg from 'ffmpeg-static'

/** Synthetic encoder output uses a seekable fixture file to reproduce gallery MP4 layout. */
export function galleryVideoFixture(): Buffer {
  const directory = mkdtempSync(join(tmpdir(), 'wedding-video-fixture-'))
  try {
    const path = join(directory, 'fixture.mp4')
    execFileSync(ffmpeg!, [
      '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=24',
      '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000', '-t', '2', '-c:v', 'libx264', '-c:a', 'aac', path,
    ])
    return readFileSync(path)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
