async (page) => {
  const results = [];
  const assert = (condition, description) => { if (!condition) throw new Error(description); results.push(description); };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173/');
  const ready = () => page.waitForFunction(() => !document.querySelector('.shutter')?.disabled && document.querySelector('.wedding-frame-art')?.complete);
  await ready();
  assert(await page.locator('.camera-controls button').count() === 2, 'only shutter and camera switch remain');
  assert(await page.locator('.camera-control-flower').count() === 0, 'decorative sparkle removed');
  for (const facing of ['rear', 'front']) {
    if (facing === 'front') {
      await page.getByRole('button', { name: 'Switch front and rear cameras' }).click();
      await ready();
    }
    const artwork = await page.locator('.wedding-frame-art').getAttribute('src');
    assert(decodeURIComponent(artwork).includes('Raihan &amp; Aiman') && decodeURIComponent(artwork).includes('WEDDING'), `${facing}: wedding lettering visible in shared artwork`);
    await page.getByRole('button', { name: 'Take photo' }).click();
    await page.waitForURL('**/summary');
    const pixels = await page.evaluate(async (source) => {
      const photo = document.querySelector('.captured-photo');
      await photo.decode();
      const frame = new Image(); frame.src = source; await frame.decode();
      const actual = document.createElement('canvas'); actual.width = photo.naturalWidth; actual.height = photo.naturalHeight;
      const expected = document.createElement('canvas'); expected.width = actual.width; expected.height = actual.height;
      const actualContext = actual.getContext('2d'); const expectedContext = expected.getContext('2d');
      actualContext.drawImage(photo, 0, 0); expectedContext.drawImage(frame, 0, 0, actual.width, actual.height);
      const a = actualContext.getImageData(0, 0, actual.width, actual.height).data;
      const e = expectedContext.getImageData(0, 0, actual.width, actual.height).data;
      let maskCount = 0, matched = 0, reflected = 0, catPixels = 0;
      // The simulated camera has no pale pixels in the title or bottom-right regions.
      for (let y = 0; y < actual.height * .12; y++) for (let x = actual.width * .23 | 0; x < actual.width * .77; x++) {
        const i = (y * actual.width + x) * 4;
        if (e[i + 3] > 220 && e[i] > 190 && e[i + 1] > 190 && e[i + 2] > 170) {
          maskCount++;
          if (a[i] > 165 && a[i + 1] > 165 && a[i + 2] > 145) matched++;
          const mirror = (y * actual.width + actual.width - 1 - x) * 4;
          if (a[mirror] > 165 && a[mirror + 1] > 165 && a[mirror + 2] > 145) reflected++;
        }
      }
      for (let y = actual.height * .62 | 0; y < actual.height * .84; y++) for (let x = actual.width * .65 | 0; x < actual.width; x++) {
        const i = (y * actual.width + x) * 4;
        if (a[i] > 170 && a[i + 1] > 170 && a[i + 2] > 140) catPixels++;
      }
      const blob = await (await fetch(photo.src)).blob();
      return { matching: matched / maskCount, mirroredMatching: reflected / maskCount, maskCount, catPixels, width: actual.width, height: actual.height, bytes: blob.size, type: blob.type };
    }, artwork);
    assert(pixels.maskCount > 100 && pixels.matching > .9, `${facing}: wedding lettering baked into JPEG pixels`);
    assert(pixels.matching > pixels.mirroredMatching + .15, `${facing}: lettering stays readable, not mirrored`);
    assert(pixels.catPixels > 100, `${facing}: floral cat baked into lower-right JPEG pixels`);
    assert(pixels.type === 'image/jpeg' && pixels.bytes <= 3 * 1024 * 1024 && Math.max(pixels.width, pixels.height) <= 1920, `${facing}: decorated photo respects JPEG and upload limits`);
    await page.screenshot({ path: `output/playwright/framed-summary-${facing}.png` });
    await page.getByRole('button', { name: 'Retake' }).click();
    await ready();
  }
  await page.screenshot({ path: 'output/playwright/framed-camera.png' });
  return { passed: results };
}
