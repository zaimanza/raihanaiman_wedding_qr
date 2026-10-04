async (page) => {
  const passed = [];
  const assert = (condition, label) => { if (!condition) throw new Error(label); passed.push(label); };
  let uploads = 0;
  page.on('request', request => { if (request.url().includes('/api/submit')) uploads++; });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(() => !document.querySelector('.shutter').disabled);
  const flowers = await page.locator('.camera-botanical').evaluateAll(elements => elements.map(element => ({color:getComputedStyle(element).color,opacity:Number(getComputedStyle(element).opacity)})));
  assert(flowers.length === 2 && flowers.every(flower => flower.opacity >= .6 && flower.opacity < 1), 'both preview flowers are brighter while remaining translucent');
  await page.screenshot({path:'output/playwright/brighter-camera.png'});
  await page.getByRole('button',{name:'Take photo',exact:true}).click();
  await page.waitForURL('**/summary');
  const trigger = page.getByRole('button',{name:'Enlarge photo',exact:true});
  const wish = page.getByRole('textbox',{name:'Your wedding wish',exact:true});
  await wish.fill('Our wish stays here ♡');
  const original = await page.locator('.captured-photo').getAttribute('src');
  for (const scheme of ['light','dark']) {
    await page.emulateMedia({colorScheme:scheme,reducedMotion:'reduce'});
    for (const [width,height] of [[375,667],[390,844],[430,932],[844,390],[1440,900]]) {
      await page.setViewportSize({width,height});
      await trigger.click();
      const dialog = page.getByRole('dialog',{name:'Photo preview',exact:true});
      await dialog.waitFor();
      const close = page.getByRole('button',{name:'Close photo preview',exact:true});
      const bounds = await close.boundingBox();
      assert(bounds.width >= 44 && bounds.height >= 44 && bounds.x >= width/2 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= height, `${scheme} ${width}: circular close control stays reachable at top right`);
      assert(await page.locator('.photo-preview-image').getAttribute('src') === original, `${scheme} ${width}: preview uses the captured image`);
      assert(await page.evaluate(() => document.activeElement.classList.contains('photo-preview-close') && document.body.style.overflow === 'hidden'), `${scheme} ${width}: modal focuses close control and locks background scrolling`);
      await page.keyboard.press('Tab');
      assert(await page.evaluate(() => document.activeElement.closest('dialog') !== null), `${scheme} ${width}: keyboard focus stays inside modal`);
      if(width === 390) await page.screenshot({path:`output/playwright/photo-preview-${scheme}.png`});
      await close.click();
      await dialog.waitFor({state:'detached'});
      assert(await wish.inputValue() === 'Our wish stays here ♡', `${scheme} ${width}: closing preserves wish`);
      assert(await page.evaluate(() => document.activeElement.classList.contains('photo-preview-trigger') && document.body.style.overflow !== 'hidden'), `${scheme} ${width}: closing restores focus and scrolling`);
    }
  }
  await trigger.click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({state:'detached'});
  assert(await wish.inputValue() === 'Our wish stays here ♡', 'Escape closes the preview without losing the draft');
  assert(uploads === 0, 'opening and closing photo preview never uploads');
  await trigger.click();
  await page.getByRole('dialog').waitFor();
  await page.goto('http://localhost:5173/');
  assert(await page.evaluate(() => document.body.style.overflow !== 'hidden'), 'navigation cleans up modal scroll lock');
  return {checks:passed.length,passed};
}
