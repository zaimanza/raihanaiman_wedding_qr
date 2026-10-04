async (page) => {
  // Run make-upload-fixtures.mjs first in a fresh Playwright CLI session. All
  // submissions stay in this browser route; these files never reach Telegram.
  const base = typeof process !== 'undefined' ? process.env.UPLOAD_TEST_BASE || 'http://localhost:5173' : 'http://localhost:5173';
  const fixtures = 'output/playwright/upload-fixtures/';
  const photo = `${fixtures}garden-photo.jpg`;
  const secondPhoto = `${fixtures}celebration-photo.jpg`;
  const video = `${fixtures}garden-video.mp4`;
  const webm = `${fixtures}garden-video.webm`;
  const qrPhoto = `${fixtures}qr-not-allowed.png`;
  const qrVideo = `${fixtures}qr-late-video.mp4`;
  const passed = [];
  const browserErrors = [];
  const requests = [];
  const downloads = [];
  const assert = (condition, label) => {
    if (!condition) throw new Error(label);
    passed.push(label);
  };
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('download', download => downloads.push(download.suggestedFilename()));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  let failSecond = true;
  let scenario = 'cooldown';
  let cooldownRequests = 0;
  let releaseFirst;
  const firstAcknowledgement = new Promise(resolve => { releaseFirst = resolve; });
  await page.route('**/api/submit', async route => {
    const body = route.request().postData() || '';
    const field = name => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1];
    if (scenario === 'cooldown') {
      cooldownRequests++;
      await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ ok: false, retryAfterSeconds: 3 }) });
      return;
    }
    requests.push({ id: field('submissionId'), name: field('name'), wish: field('wish'), kind: /name="video";/.test(body) ? 'video' : 'photo' });
    if (requests.length === 1) await firstAcknowledgement;
    const fail = failSecond && requests.length === 2;
    await route.fulfill({
      status: fail ? 502 : 200,
      contentType: 'application/json',
      body: JSON.stringify(fail ? { ok: false, message: 'private upstream details' } : { ok: true }),
    });
  });
  await page.addInitScript(() => {
    window.__testCameraMode = 'denied';
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Camera denied for browser verification', 'NotAllowedError'); };
    window.__uploadObjectUrls = { created: [], revoked: [] };
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      const url = create(blob);
      window.__uploadObjectUrls.created.push({ url, type: blob.type });
      return url;
    };
    URL.revokeObjectURL = url => {
      window.__uploadObjectUrls.revoked.push(url);
      revoke(url);
    };
  });
  const cards = () => page.locator('.upload-media-card');
  const upload = () => page.getByRole('button', { name: 'Upload', exact: true });
  const send = () => page.getByRole('button', { name: 'Send your wish', exact: true });
  const selectedUrls = () => cards().locator('img, video').evaluateAll(elements => elements.map(element => element.currentSrc || element.src));
  const addFiles = async (files, count) => {
    await page.locator('input[type="file"]').setInputFiles(files);
    await page.waitForFunction(expected => document.querySelectorAll('.upload-media-card').length === expected, count, { timeout: 30_000 });
    await upload().waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('button')].find(candidate => candidate.textContent.trim() === 'Upload');
      return button && !button.disabled;
    }, null, { timeout: 30_000 });
  };
  const assertButtonVisible = async (button, width, height, label) => {
    const bounds = await button.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1, label);
  };
  const screenshot = async path => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path });
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto(`${base}/`);
  await page.getByText('We need camera access', { exact: false }).waitFor();
  const cameraUpload = page.getByRole('button', { name: 'Upload photos and videos', exact: true });
  assert(await cameraUpload.isEnabled(), 'upload remains available when camera permission is denied');
  const cameraUploadBounds = await cameraUpload.boundingBox();
  const shutterBounds = await page.getByRole('button', { name: 'Take photo', exact: true }).boundingBox();
  assert(cameraUploadBounds && shutterBounds && cameraUploadBounds.x + cameraUploadBounds.width <= shutterBounds.x, 'camera upload button sits left of the photo shutter');
  await cameraUpload.click();
  await page.waitForURL('**/upload');
  assert(await upload().isDisabled(), 'empty selection disables the bottom Upload button');
  assert(await page.locator('input[type="file"]').getAttribute('multiple') !== null, 'picker supports multiple photos and videos');
  assert(await page.getByRole('button', { name: 'Add photos and videos', exact: true }).isEnabled(), 'empty selection offers an accessible media picker button');
  // The CLI pauses run-code when a native chooser opens. Use its underlying
  // file input here; the visible picker button is checked separately via CLI.
  await page.locator('input[type="file"]').setInputFiles([photo, video]);
  await page.waitForFunction(() => document.querySelectorAll('.upload-media-card').length === 2, null, { timeout: 30_000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Upload' && !button.disabled));
  assert(await cards().locator('img').count() >= 1 && await cards().locator('video').count() === 1, 'mixed selection previews both photo and video');
  await addFiles([secondPhoto, webm], 4);
  assert(await cards().locator('video').count() === 2, 'clean MP4 and WebM files both pass media validation');
  const removedUrl = await page.getByRole('button', { name: 'Remove celebration-photo.jpg', exact: true }).evaluate(button => button.closest('.upload-media-card').querySelector('img, video').src);
  await page.getByRole('button', { name: 'Remove celebration-photo.jpg', exact: true }).click();
  const removedVideoUrl = await page.getByRole('button', { name: 'Remove garden-video.webm', exact: true }).evaluate(button => button.closest('.upload-media-card').querySelector('video').src);
  await page.getByRole('button', { name: 'Remove garden-video.webm', exact: true }).click();
  assert(await cards().count() === 2, 'removing one media item preserves the other selections');
  assert(await page.evaluate(url => window.__uploadObjectUrls.revoked.includes(url), removedUrl), 'removing a media item revokes its preview URL');
  assert(await page.evaluate(url => window.__uploadObjectUrls.revoked.includes(url), removedVideoUrl), 'removing a video revokes its preview URL');
  const keptUrls = await selectedUrls();
  assert(await page.evaluate(urls => urls.every(url => !window.__uploadObjectUrls.revoked.includes(url)), keptUrls), 'remaining preview URLs stay usable after removal');

  await addFiles([qrPhoto, qrVideo], 4);
  assert(await page.getByRole('alert').count() === 0, 'QR photos and videos are accepted without rejection');
  await page.getByRole('button', {name:'Remove qr-not-allowed.png', exact:true}).click();
  await page.getByRole('button', {name:'Remove qr-late-video.mp4', exact:true}).click();
  await upload().click();
  await page.waitForURL('**/upload-summary');
  assert(requests.length === 0, 'Upload opens the summary before sending any media');
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Browser Guest');
  await page.getByRole('textbox', { name: 'Your wedding wish', exact: true }).fill('Wishing you a lifetime of love ♡');
  await page.getByRole('button', { name: 'Edit uploads', exact: true }).click();
  await page.waitForURL('**/upload');
  assert(await cards().count() === 2, 'Edit uploads returns to the selection with both items intact');
  assert(JSON.stringify(await selectedUrls()) === JSON.stringify(keptUrls), 'editing preserves the same usable preview URLs');
  await upload().click();
  await page.waitForURL('**/upload-summary');
  assert(await page.getByRole('textbox', { name: 'Your name', exact: true }).inputValue() === 'Browser Guest', 'editing preserves the guest name');
  assert(await page.getByRole('textbox', { name: 'Your wedding wish', exact: true }).inputValue() === 'Wishing you a lifetime of love ♡', 'editing preserves the wedding wish');
  await page.goBack();
  await page.waitForURL('**/upload');

  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    for (const [width, height] of [[375, 667], [390, 844], [768, 1024], [1440, 900], [844, 390]]) {
      await page.setViewportSize({ width, height });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${scheme} upload ${width} has no horizontal overflow`);
      await assertButtonVisible(upload(), width, height, `${scheme} upload ${width} keeps the bottom Upload button reachable`);
      if (width === 390 || width === 1440) await screenshot(`output/playwright/upload-${scheme}-${width}.png`);
      await upload().click();
      await page.waitForURL('**/upload-summary');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${scheme} upload summary ${width} has no horizontal overflow`);
      await assertButtonVisible(send(), width, height, `${scheme} upload summary ${width} keeps Send your wish reachable`);
      if (width === 390 || width === 1440) await screenshot(`output/playwright/upload-summary-${scheme}-${width}.png`);
      await page.getByRole('button', { name: 'Edit uploads', exact: true }).click();
      await page.waitForURL('**/upload');
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await upload().click();
  await page.waitForURL('**/upload-summary');
  await page.context().setOffline(true);
  await page.getByText('You’re offline', { exact: false }).waitFor();
  assert(await send().isDisabled(), 'offline state prevents sending the upload batch');
  await page.context().setOffline(false);
  await page.waitForFunction(() => document.querySelector('.submit-button')?.disabled === false);
  await send().click();
  await page.getByRole('button', { name: /^Try again in \d+s$/ }).waitFor();
  assert(await page.getByRole('button', { name: /^Try again in \d+s$/ }).isDisabled(), 'rate-limit cooldown disables another upload attempt');
  await page.getByRole('button', { name: 'Edit uploads', exact: true }).click();
  await page.waitForURL('**/upload');
  await upload().click();
  await page.waitForURL('**/upload-summary');
  assert(await page.getByRole('button', { name: /^Try again in \d+s$/ }).isDisabled(), 'editing and returning to summary preserves the pending cooldown');
  await send().waitFor({ state: 'visible', timeout: 10_000 });
  assert(cooldownRequests === 1, 'editing does not trigger or bypass a rate-limited submission');
  scenario = 'partial';
  await send().click();
  await page.getByRole('button', { name: 'Sending with love…', exact: true }).waitFor();
  await page.waitForTimeout(120);
  assert(requests.length === 1, 'second upload waits for the first media acknowledgement');
  releaseFirst();
  await page.getByText('1 of 2 memories sent.', { exact: false }).waitFor();
  assert(requests.length === 2 && requests[0].kind === 'photo' && requests[1].kind === 'video', 'batch submits photo and video sequentially');
  assert(requests.every(request => request.name === 'Browser Guest' && request.wish === 'Wishing you a lifetime of love ♡'), 'each media submission carries the guest name and wedding wish');
  assert(requests.every(request => request.id), 'each media submission carries an idempotency ID');
  assert(await page.getByRole('textbox', { name: 'Your name', exact: true }).isDisabled(), 'partial success locks the batch guest name');
  assert(await page.getByRole('textbox', { name: 'Your wedding wish', exact: true }).isDisabled(), 'partial success locks the batch wish');
  assert(await page.getByRole('button', { name: 'Edit uploads', exact: true }).isDisabled(), 'partial success locks editing to keep sent items consistent');
  await page.goBack();
  await page.waitForURL('**/upload-summary');
  assert(new URL(page.url()).pathname === '/upload-summary', 'browser Back preserves a partially delivered batch for retry');
  assert(!(await page.locator('main').innerText()).includes('private upstream'), 'upstream failure details are never shown');
  assert(await page.evaluate(urls => urls.every(url => !window.__uploadObjectUrls.revoked.includes(url)), keptUrls), 'partial failure keeps media preview URLs alive for retry');
  failSecond = false;
  await send().click();
  await page.getByRole('heading', { name: 'Sent with love ♡', exact: true }).waitFor();
  assert(requests.length === 3, 'retry sends only the unsent media');
  assert(requests[2].id === requests[1].id && requests[2].id !== requests[0].id, 'retry reuses the failed item ID and skips the already sent photo');
  assert(downloads.length === 0, 'sending uploaded originals does not start automatic downloads');
  await page.waitForURL(`${base}/`);
  assert(await page.evaluate(urls => urls.every(url => window.__uploadObjectUrls.revoked.includes(url)), keptUrls), 'successful completion clears and revokes selected preview URLs');
  await page.getByRole('button', { name: 'Upload photos and videos', exact: true }).click();
  await page.waitForURL('**/upload');
  assert(await cards().count() === 0, 'success starts a fresh empty upload selection');
  await addFiles([secondPhoto], 1);
  await upload().click();
  await page.waitForURL('**/upload-summary');
  assert(await page.getByRole('textbox', { name: 'Your name', exact: true }).inputValue() === '', 'successful send clears the old name');
  assert(await page.getByRole('textbox', { name: 'Your wedding wish', exact: true }).inputValue() === '', 'successful send clears the old wish');
  await page.reload();
  await page.waitForURL('**/upload');
  assert(await cards().count() === 0, 'reloading a summary without in-memory files returns to an empty upload page');
  await page.goto(`${base}/upload-summary`);
  await page.waitForURL('**/upload');
  assert(await cards().count() === 0, 'direct entry cannot open an empty upload summary');
  assert(await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0), 'upload drafts do not persist names, wishes, or files in browser storage');
  assert(browserErrors.length === 0, `upload flow has no uncaught browser errors: ${browserErrors.join('; ')}`);
  return { checks: passed.length, passed, interceptedSubmissions: requests.length + cooldownRequests, downloads };
}
