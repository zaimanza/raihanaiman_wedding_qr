async (page) => {
  const passed = [];
  const assert = (condition,label) => {if (!condition) throw new Error(label); passed.push(label);};
  await page.addInitScript(() => {
    const blobs = new Map();
    window.__artBlobs = blobs;
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {const url = create(blob); blobs.set(url,blob); return url;};
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      if (this.download) window.__downloadedArt = blobs.get(this.href);
      return click.call(this);
    };
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = async (input,init) => {
      if (input === '/api/submit') {
        window.__submittedClean = init.body.get('photo') || init.body.get('video');
        return Response.json({ok:true});
      }
      return fetchOriginal(input,init);
    };
  });
  for (const kind of ['photo','video']) {
    await page.goto('http://localhost:5173/');
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(() => document.querySelector('.shutter')?.disabled === false);
    if (kind === 'photo') await page.getByRole('button',{name:'Take photo',exact:true}).click();
    else {
      const box=await page.locator('.shutter').boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
      await page.mouse.down(); await page.waitForTimeout(3000); await page.mouse.up();
    }
    await page.waitForURL('**/summary');
    const previewSrc = await page.locator('.captured-photo').getAttribute('src');
    await page.evaluate(src => {window.__previewArt = window.__artBlobs.get(src);},previewSrc);
    await page.getByRole('button',{name:kind === 'photo' ? 'Enlarge photo' : 'Enlarge video',exact:true}).click();
    assert(await page.locator('dialog .photo-preview-image').getAttribute('src') === previewSrc, `${kind}: card and enlarged modal use the same decorated media`);
    if (kind === 'video') await page.waitForFunction(() => {const v=document.querySelector('dialog video');return v && v.readyState>=2 && !v.paused;});
    await page.screenshot({path:`output/playwright/art-preview-${kind}.png`});
    await page.getByRole('button',{name:`Close ${kind} preview`,exact:true}).click();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button',{name:'Send your wish',exact:true}).click();
    const downloaded = await downloadEvent;
    await downloaded.saveAs(`output/playwright/art-download-${kind}.${downloaded.suggestedFilename().split('.').at(-1)}`);
    await page.waitForFunction(() => window.__downloadedArt && window.__submittedClean);
    assert(await page.evaluate(async () => {
      const preview=new Uint8Array(await window.__previewArt.arrayBuffer());
      const download=new Uint8Array(await window.__downloadedArt.arrayBuffer());
      return preview.length===download.length && preview.every((byte,index)=>byte===download[index]);
    }), `${kind}: preview contains the exact decorated download bytes`);
    const result = await page.evaluate(async kind => {
      async function frame(blob) {
        const url=URL.createObjectURL(blob);
        const element=document.createElement(kind === 'photo' ? 'img' : 'video');
        element.src=url;
        try {
          if (kind === 'photo') await element.decode();
          else {
            element.muted=true; element.playsInline=true;
            await new Promise((resolve,reject)=>{element.onloadeddata=resolve; element.onerror=reject;});
            element.currentTime=.5;
            await new Promise((resolve,reject)=>{element.onseeked=resolve;element.onerror=reject;});
          }
          const width=kind === 'photo' ? element.naturalWidth : element.videoWidth;
          const height=kind === 'photo' ? element.naturalHeight : element.videoHeight;
          const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
          const ctx=canvas.getContext('2d');ctx.drawImage(element,0,0);
          const data=ctx.getImageData(0,0,width,height).data;
          let top=0,corner=0;
          for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
            const i=(y*width+x)*4;
            if(data[i]>140 && data[i+1]>145 && data[i+2]>130) {
              if(y<height*.12) top++;
              if(x>width*.75 && y>height*.8) corner++;
            }
          }
          return {width,height,top,corner,duration:element.duration || 0};
        } finally {element.pause?.();element.removeAttribute('src');element.load?.();URL.revokeObjectURL(url);}
      }
      return {clean:await frame(window.__submittedClean),art:await frame(window.__downloadedArt)};
    },kind);
    assert(result.art.width >= result.clean.width && result.art.height >= result.clean.height && Math.abs(result.art.width/result.art.height-result.clean.width/result.clean.height)<.01, `${kind}: decorated download retains at least the upload resolution and composition`);
    assert(result.clean.top < 100 && result.clean.corner < 100, `${kind}: Telegram upload contains no art`);
    assert(result.art.top > result.clean.top + 150 && result.art.corner > result.clean.corner + 40, `${kind}: download contains title/top flowers and bottom flowers ${JSON.stringify(result)}`);
    if (kind==='video') assert(Math.abs(result.art.duration-result.clean.duration)<.25, 'video: clean and decorated copies preserve the same duration');
    await page.waitForURL('http://localhost:5173/');
  }
  return {checks:passed.length,passed};
}
