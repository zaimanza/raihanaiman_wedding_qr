async (page) => {
  const passed=[];
  const assert=(condition,label)=>{if(!condition)throw new Error(label);passed.push(label);};
  await page.addInitScript(()=>{
    const NativeRecorder=MediaRecorder;
    window.__qualityEncoders=[];
    window.MediaRecorder=class extends NativeRecorder {
      constructor(stream,options) {super(stream,options);window.__qualityEncoders.push(options);}
    };
  });
  await page.goto('http://localhost:5173/');
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.querySelector('.shutter')?.disabled===false);
  // Labelled synthetic native still: proves use of pixels beyond the live-video resolution.
  await page.evaluate(()=>{
    window.ImageCapture=class {
      async getPhotoCapabilities(){return {imageWidth:{max:4000},imageHeight:{max:3000}};}
      async takePhoto(settings){
        window.__nativePhotoSettings=settings;
        const canvas=document.createElement('canvas');canvas.width=4000;canvas.height=3000;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#789581';ctx.fillRect(0,0,4000,3000);
        ctx.fillStyle='white';ctx.font='100px sans-serif';ctx.fillText('NATIVE STILL TEST',1300,1500);
        return new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.98));
      }
    };
  });
  await page.getByRole('button',{name:'Take photo',exact:true}).click();
  await page.waitForURL('**/summary');
  const dimensions=await page.locator('.captured-photo').evaluate(async image=>{await image.decode();return {width:image.naturalWidth,height:image.naturalHeight};});
  assert(dimensions.height===3000,'photo uses the native still resolution instead of the 1920px simulated video frame');
  assert(await page.evaluate(()=>window.__nativePhotoSettings.imageWidth===4000),'native still requests the highest supported photo dimensions within the 4096px budget');
  await page.screenshot({path:'output/playwright/high-quality-photo-summary.png'});
  // Real encoder test; setup-camera.js supplies a native canvas MediaStream.
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(()=>document.querySelector('.shutter')?.disabled===false);
  const box=await page.locator('.shutter').boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();await page.waitForTimeout(2800);await page.mouse.up();
  await page.waitForURL('**/summary');
  await page.locator('.captured-photo').evaluate(video=>new Promise(resolve=>{if(video.readyState>=1)resolve();else video.onloadedmetadata=resolve;}));
  const video=await page.locator('.captured-photo').evaluate(video=>({width:video.videoWidth,height:video.videoHeight}));
  assert(video.height===1920,'video preview/download retains 1920px source detail instead of 720px');
  assert(await page.evaluate(()=>window.__qualityEncoders.some(option=>option.videoBitsPerSecond===8_000_000)),'decorated video targets 8Mbps rather than 0.7Mbps');
  assert(await page.evaluate(()=>window.__qualityEncoders.some(option=>option.videoBitsPerSecond===430_000)),'one-minute upload encoder uses the larger 4MiB budget');
  await page.getByRole('button',{name:'Enlarge video',exact:true}).click();
  await page.waitForFunction(()=>{const v=document.querySelector('dialog video');return v && v.readyState>=2 && !v.paused;});
  await page.screenshot({path:'output/playwright/high-quality-video-preview.png'});
  return {checks:passed.length,passed,photo:dimensions,video};
}
