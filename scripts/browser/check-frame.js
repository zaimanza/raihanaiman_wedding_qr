async (page) => {
  const results = [];
  const assert = (condition, description) => { if (!condition) throw new Error(description); results.push(description); };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173/');
  const ready = () => page.waitForFunction(() => document.querySelector('.shutter') && !document.querySelector('.shutter').disabled);
  await ready();
  assert(await page.locator('.camera-controls button').count() === 2, 'only shutter and camera switch remain');
  assert(await page.locator('.camera-control-flower').count() === 0, 'decorative sparkle removed');
  assert(await page.locator('.camera-botanical-top').count() === 1 && await page.locator('.camera-botanical-bottom').count() === 1, 'original botanical corners restored');
  const title = await page.locator('.camera-wedding-title').innerText();
  assert(title.includes('Raihan & Aiman') && title.includes('Wedding · 11 Oct 2026'), 'centered preview title includes the requested wedding date');
  assert(await page.locator('.wedding-frame').count() === 0, 'photographic filter feature removed');
  for (const facing of ['rear', 'front']) {
    if (facing === 'front') {
      await page.getByRole('button', { name: 'Switch front and rear cameras' }).click();
      await ready();
    }
    await page.screenshot({ path: `output/playwright/preview-only-camera-${facing}.png` });
    await page.getByRole('button', { name: 'Take photo' }).click();
    await page.waitForURL('**/summary');
    const pixels = await page.evaluate(async () => {
      const photo = document.querySelector('.captured-photo');
      await photo.decode();
      const canvas = document.createElement('canvas'); canvas.width = photo.naturalWidth; canvas.height = photo.naturalHeight;
      const context = canvas.getContext('2d'); context.drawImage(photo, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let topMarks = 0, cornerMarks = 0;
      // The simulated camera has no pale pixels here. Lettering/flowers would introduce them.
      for (let y = 0; y < canvas.height * .12; y++) for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (data[i] > 180 && data[i + 1] > 180 && data[i + 2] > 160) topMarks++;
      }
      for (let y = canvas.height * .62 | 0; y < canvas.height * .84; y++) for (let x = canvas.width * .65 | 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (data[i] > 180 && data[i + 1] > 180 && data[i + 2] > 160) cornerMarks++;
      }
      const blob = await (await fetch(photo.src)).blob();
      return { topMarks, cornerMarks, width: canvas.width, height: canvas.height, bytes: blob.size, type: blob.type };
    });
    assert(pixels.topMarks === 0, `${facing}: saved JPEG has no wedding title, date, or top-left flowers`);
    assert(pixels.cornerMarks === 0, `${facing}: saved JPEG has no lower-right floral artwork`);
    assert(pixels.type === 'image/jpeg' && pixels.bytes <= 3 * 1024 * 1024 && Math.max(pixels.width, pixels.height) <= 1920, `${facing}: clean photo respects JPEG and upload limits`);
    await page.screenshot({ path: `output/playwright/preview-only-summary-${facing}.png` });
    await page.getByRole('button', { name: 'Retake' }).click();
    await ready();
  }
  return { passed: results };
}
