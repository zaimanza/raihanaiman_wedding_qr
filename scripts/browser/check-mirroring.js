async (page) => {
  const passed=[];
  const assert=(condition,label)=>{if(!condition)throw new Error(label);passed.push(label);};
  await page.addInitScript(() => {
    const mode=location.hash.slice(1) || 'front';
    const facing=mode === 'back' ? 'environment' : mode === 'front' ? 'user' : undefined;
    navigator.mediaDevices.getUserMedia=async () => {
      const canvas=document.createElement('canvas');canvas.width=960;canvas.height=1280;
      const ctx=canvas.getContext('2d');
      ctx.fillStyle='#902010';ctx.fillRect(0,0,480,1280);
      ctx.fillStyle='#102090';ctx.fillRect(480,0,480,1280);
      ctx.fillStyle='white';ctx.font='40px sans-serif';ctx.fillText('SIMULATED CAMERA',260,900);
      const stream=canvas.captureStream(24);
      const track=stream.getVideoTracks()[0];
      track.getSettings=()=>({facingMode:facing,deviceId:'camera-test'});
      return stream;
    };
    navigator.mediaDevices.enumerateDevices=async()=>[{kind:'videoinput',deviceId:'camera-test',label:mode === 'back' ? 'Back Camera' : 'FaceTime HD Camera'}];
    const create=URL.createObjectURL.bind(URL);
    window.__mirrorBlobs=new Map();
    URL.createObjectURL=blob=>{const url=create(blob);window.__mirrorBlobs.set(url,blob);return url;};
  });
  for(const mode of ['front','back','webcam']) for(const kind of ['photo','video']) {
    await page.goto(`http://localhost:5173/#${mode}`);
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>document.querySelector('.shutter')?.disabled===false);
    const mirrored=await page.locator('.camera-preview').evaluate(v=>getComputedStyle(v).transform.startsWith('matrix(-1'));
    assert(mirrored===(mode!=='back'),`${mode} ${kind}: live preview has the correct mirror direction`);
    if(kind==='photo') await page.getByRole('button',{name:'Take photo',exact:true}).click();
    else {
      const box=await page.locator('.shutter').boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
      await page.mouse.down();await page.waitForTimeout(2600);await page.mouse.up();
    }
    await page.waitForURL('**/summary');
    const colors=await page.locator('.captured-photo').evaluate(async media=>{
      if(media.tagName==='IMG') await media.decode();
      else {
        await new Promise(resolve=>{if(media.readyState>=2)resolve();else media.onloadeddata=resolve;});
        media.currentTime=.5; await new Promise(resolve=>{media.onseeked=resolve;});
      }
      const width=media.naturalWidth||media.videoWidth,height=media.naturalHeight||media.videoHeight;
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');ctx.drawImage(media,0,0);
      return {left:Array.from(ctx.getImageData(width*.2,height*.4,1,1).data),right:Array.from(ctx.getImageData(width*.8,height*.4,1,1).data)};
    });
    assert(mode==='back' ? colors.left[0]>colors.left[2] && colors.right[2]>colors.right[0] : colors.left[2]>colors.left[0] && colors.right[0]>colors.right[2],`${mode} ${kind}: captured media matches live mirror direction ${JSON.stringify(colors)}`);
    await page.getByRole('button',{name:`Enlarge ${kind}`,exact:true}).click();
    assert(await page.locator('dialog .photo-preview-image').getAttribute('src')===await page.locator('.captured-photo').getAttribute('src'),`${mode} ${kind}: modal preserves capture orientation and readable art`);
    if(mode==='front' && kind==='photo') await page.screenshot({path:'output/playwright/mirrored-front-photo.png'});
    await page.getByRole('button',{name:`Close ${kind} preview`,exact:true}).click();
  }
  return {checks:passed.length,passed};
}
