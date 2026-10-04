/** Desktop webcams often omit facingMode; treat those as selfie cameras. */
export function shouldMirrorCamera(facing: string | undefined, label: string): boolean {
  if (facing === 'user') return true;
  if (facing === 'environment') return false;
  return !/\b(back|rear|environment)\b/i.test(label);
}
