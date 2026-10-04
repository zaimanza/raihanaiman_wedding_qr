async (page) => {
 const passed=[];const assert=(condition,label)=>{if(!condition)throw new Error(label);passed.push(label);};
 await page.addInitScript(()=>{
  window.__audioBlobs=new Map();const create=URL.createObjectURL.bind(URL);
  URL.createObjectURL=blob=>{const url=create(blob);window.__audioBlobs.set(url,blob);return url;};
  const original=window.fetch.bind(window);
  window.fetch=async(input,init)=>{if(input==='/api/submit'){window.__cleanAudio=init.body.get('video');return Response.json({ok:true});}return original(input,init);};
 });
 await page.goto('http://localhost:5173/');
 assert(await page.evaluate(()=>!document.featurePolicy||document.featurePolicy.allowsFeature('microphone')),'deployment policy permits microphone access');
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>document.querySelector('.shutter')?.disabled===false);
 const hold=async(expectRecording=true)=>{const box=await page.locator('.shutter').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();if(expectRecording) {await page.getByRole('button',{name:'Stop recording',exact:true}).waitFor();await page.waitForTimeout(1800);} else await page.waitForTimeout(1500);await page.mouse.up();};
 await hold();await page.waitForURL('**/summary');
 assert(await page.evaluate(()=>window.__testMicrophone.getTracks().every(t=>t.readyState==='ended')),'microphone stops when recording finishes');
 assert(await page.locator('.captured-photo').evaluate(v=>v.muted),'small looping card stays muted');
 const src=await page.locator('.captured-photo').getAttribute('src');
 await page.evaluate(src=>{window.__decoratedAudio=window.__audioBlobs.get(src);},src);
 await page.getByRole('button',{name:'Enlarge video',exact:true}).click();
 await page.waitForFunction(()=>{const v=document.querySelector('dialog video');return v&&v.readyState>=2&&!v.paused;});
 assert(await page.locator('dialog video').evaluate(v=>!v.muted&&v.controls),'enlarged preview plays with sound and controls');
 await page.getByRole('button',{name:'Close video preview',exact:true}).click();
 await page.getByRole('button',{name:'Send your wish',exact:true}).click();
 await page.waitForURL('http://localhost:5173/');
 const audio=await page.evaluate(async()=>{
  const context=new AudioContext();const levels=[];
  try {for(const blob of [window.__cleanAudio,window.__decoratedAudio]) {
   const buffer=await context.decodeAudioData(await blob.arrayBuffer());
   levels.push({duration:buffer.duration,peak:buffer.getChannelData(0).reduce((peak,value)=>Math.max(peak,Math.abs(value)),0)});
  }} finally {await context.close();}return levels;
 });
 assert(audio.every(a=>a.duration>1&&a.peak>.01),'both Telegram and decorated download contain decoded audible audio');
 await page.waitForFunction(()=>document.querySelector('.shutter')?.disabled===false);
 await page.evaluate(()=>{window.__microphoneDenied=true;});await hold(false);
 await page.getByText(/Please allow microphone access/).waitFor();
 assert(await page.evaluate(()=>window.__testCameraTracks.at(-1).readyState==='live'),'microphone denial keeps camera available');
 await page.getByRole('button',{name:'Take photo',exact:true}).click();await page.waitForURL('**/summary');
 assert(await page.locator('.captured-photo').evaluate(v=>v.tagName==='IMG'),'photos still work after microphone denial');
 return {checks:passed.length,passed,audio};
}
