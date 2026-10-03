async (page) => {
  const results = [];
  const assert = (condition, label) => { if (!condition) throw new Error(label); results.push(label); };
  const ready = () => page.waitForFunction(() => document.querySelector('.shutter') && !document.querySelector('.shutter').disabled);
  await page.goto('http://localhost:5173/');
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    for (const [width, height] of [[375,667], [390,844], [412,915], [430,932], [768,1024], [1440,900], [844,390]]) {
      await page.setViewportSize({ width, height });
      await ready();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${scheme} camera ${width} has no overflow`);
      const shutterBounds = await page.getByRole('button', { name: 'Take photo' }).boundingBox();
      assert(shutterBounds.y >= 0 && shutterBounds.y + shutterBounds.height <= height, `${scheme} camera ${width} keeps shutter visible`);
      await page.getByRole('button', { name: 'Take photo' }).click();
      await page.waitForURL('**/summary');
      await page.getByRole('textbox').first().fill('Wishing you all the love in the world ♡');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${scheme} summary ${width} has no overflow`);
      const bounds = await page.getByRole('button', { name: 'Send our wish' }).boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= height, `${scheme} summary ${width} keeps Submit reachable`);
      assert(await page.evaluate(() => Math.max(document.querySelector('img').naturalWidth, document.querySelector('img').naturalHeight) <= 1920), `${scheme} ${width} capture within 1920px`);
      if (width === 390) await page.screenshot({path:`output/playwright/summary-${scheme}.png`});
      await page.getByRole('button', { name: 'Retake' }).click();
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
  await ready();
  await page.screenshot({path:'output/playwright/camera-simulated.png'});
  await page.evaluate(() => {
    window.__testCameraMode = 'denied';
    window.__testCameraTracks.at(-1).dispatchEvent(new Event('ended'));
  });
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByText('We need camera access', {exact:false}).waitFor();
  assert(await page.getByRole('button',{name:'Try again'}).isEnabled(), 'denied permission shows retry');
  await page.evaluate(() => {window.__testCameraMode='missing';});
  await page.getByRole('button', {name:'Try again'}).click();
  await page.getByText('We couldn’t find a camera', {exact:false}).waitFor();
  assert(await page.getByRole('button',{name:'Try again'}).isEnabled(), 'missing camera shows graceful state');
  await page.evaluate(() => {window.__testCameraMode='ready';});
  await page.getByRole('button',{name:'Try again'}).click();
  await ready();
  await page.evaluate(() => {
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => window.__testCameraTracks.every(track=>track.readyState==='ended'));
  assert(await page.evaluate(() => window.__testCameraTracks.every(track=>track.readyState==='ended')), 'hidden page stops all tracks');
  await page.evaluate(() => {
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await ready();
  assert(await page.evaluate(() => window.__testCameraTracks.filter(track=>track.readyState==='live').length===1), 'visible page resumes exactly one camera');
  await page.getByRole('button',{name:'Take photo'}).click();
  await page.waitForURL('**/summary');
  await page.getByRole('textbox').first().fill('Our offline wish');
  await page.context().setOffline(true);
  await page.getByText('You’re offline', {exact:false}).waitFor();
  assert(await page.getByRole('button',{name:'Send our wish'}).isDisabled(), 'offline state prevents sending');
  await page.context().setOffline(false);
  await page.waitForFunction(() => !document.querySelector('.submit-button').disabled);
  assert(await page.getByRole('textbox').first().inputValue()==='Our offline wish', 'offline recovery preserves wish');
  return {checks:results.length,passed:results};
}
