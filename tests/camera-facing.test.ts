import { describe, expect, it } from 'vitest';
import { shouldMirrorCamera } from '../src/utils/cameraFacing';

describe('camera mirroring', () => {
  it('honors actual mobile facingMode over labels', () => {
    expect(shouldMirrorCamera('user', 'Back Camera')).toBe(true);
    expect(shouldMirrorCamera('environment', 'Front Camera')).toBe(false);
  });
  it('mirrors webcams that omit facingMode rather than treating the rear preference as actual hardware', () => {
    for (const label of ['', 'FaceTime HD Camera', 'Integrated Webcam', 'USB Camera']) expect(shouldMirrorCamera(undefined,label)).toBe(true);
  });
  it('keeps identified rear cameras unmirrored when facingMode is missing', () => {
    for (const label of ['Back Camera', 'Rear camera', 'Environment camera']) expect(shouldMirrorCamera(undefined,label)).toBe(false);
  });
});
