async page => {
  await page.addInitScript(() => {
    window.__captureOptions=[];
    const Native=MediaRecorder;
    window.MediaRecorder=class extends Native {
      constructor(stream,options) {
        if(window.__rejectSharper && options.videoBitsPerSecond===2500000) throw new Error('Test optional encoder unavailable');
        super(stream,options); window.__captureOptions.push(options);
        if(options.videoBitsPerSecond===2500000 && window.__overflowSharper) {
          const start=this.start.bind(this);
          this.start=(...args)=>{start(...args);setTimeout(()=>{if(this.state!=='inactive')this.dispatchEvent(new BlobEvent('dataavailable',{data:new Blob([new Uint8Array(3.6*1024*1024)])}));},1000);};
        }
      }
    };
    window.fetch=async(input,init)=>{window.__uploaded=init.body.get('video');return Response.json({ok:true});};
  });
  const check=async(mode)=>{
    await page.goto('http://localhost:5173/');
    await page.evaluate(mode=>{window.__overflowSharper=mode==='overflow';window.__rejectSharper=mode==='unavailable';},mode);
    await page.waitForFunction(()=>!document.querySelector('.shutter').disabled);
    const b=await page.locator('.shutter').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
    await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor();await page.waitForTimeout(2200);await page.mouse.up();
    await page.waitForURL('**/summary');await page.getByRole('button',{name:'Send your wish',exact:true}).click();await page.waitForURL('http://localhost:5173/');
    return page.evaluate(async()=>{
      const blob=window.__uploaded;const url=URL.createObjectURL(blob);const v=document.createElement('video');v.src=url;v.muted=true;
      await new Promise((r,j)=>{v.onloadeddata=r;v.onerror=j;});
      const ac=new AudioContext();const audio=await ac.decodeAudioData(await blob.arrayBuffer());await ac.close();URL.revokeObjectURL(url);
      return {size:blob.size,width:v.videoWidth,height:v.videoHeight,audio:audio.duration,peak:audio.getChannelData(0).reduce((p,x)=>Math.max(p,Math.abs(x)),0)};
    });
  };
  const sharp=await check('sharp');if(Math.max(sharp.width,sharp.height)!==1920||sharp.audio<2||sharp.peak<.01||sharp.size>4194304)throw new Error('Sharper clip failed');
  const fallback=await check('overflow');if(Math.max(fallback.width,fallback.height)!==1080||fallback.audio<2||fallback.peak<.01)throw new Error('Fallback lost video or sound');
  const unavailable=await check('unavailable');if(Math.max(unavailable.width,unavailable.height)!==1080||unavailable.audio<2)throw new Error('Unavailable optional encoder broke capture');
  return {sharp,fallback,unavailable};
}
