async (page) => {
  const passed=[];
  const assert=(condition,label)=>{if(!condition)throw new Error(label);passed.push(label);};
  await page.addInitScript(()=>{
    window.__nameRequests=[];
    const original=window.fetch.bind(window);
    window.fetch=async(input,init)=>{
      if(input==='/api/submit') {
        window.__nameRequests.push({name:init.body.get('name'),wish:init.body.get('wish')});
        return Response.json({ok:window.__nameRequests.length>1},{status:window.__nameRequests.length===1?502:200});
      }
      return original(input,init);
    };
  });
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(()=>document.querySelector('.shutter')?.disabled===false);
  await page.getByRole('button',{name:'Take photo',exact:true}).click();
  await page.waitForURL('**/summary');
  for(const theme of ['light','dark']) for(const width of [375,1440]) {
    await page.emulateMedia({colorScheme:theme});
    await page.setViewportSize({width,height:844});
    const field=await page.getByLabel('Your name').boundingBox();
    const wish=await page.getByLabel('Your wedding wish').boundingBox();
    assert(field.x>=0&&field.x+field.width<=width&&field.y+field.height<wish.y,`${theme} ${width}: name fits above wish`);
    await page.screenshot({path:`output/playwright/name-${theme}-${width}.png`});
  }
  await page.getByLabel('Your name').fill('  Aiman Noor  ');
  await page.getByLabel('Your wedding wish').fill('Selamat pengantin baru!');
  await page.getByRole('button',{name:'Send your wish',exact:true}).click();
  await page.getByText(/didn’t quite make it through/).waitFor();
  assert(await page.getByLabel('Your name').inputValue()==='  Aiman Noor  ','failed upload preserves the name');
  assert(await page.getByLabel('Your wedding wish').inputValue()==='Selamat pengantin baru!','failed upload preserves the wish');
  assert(await page.evaluate(()=>window.__nameRequests[0].name==='Aiman Noor'),'submission sends the normalized name');
  await page.getByRole('button',{name:'Send your wish',exact:true}).click();
  await page.waitForURL('http://localhost:5173/');
  await page.waitForFunction(()=>document.querySelector('.shutter')?.disabled===false);
  await page.getByRole('button',{name:'Take photo',exact:true}).click();
  await page.waitForURL('**/summary');
  assert(await page.getByLabel('Your name').inputValue()==='','success clears the name for the next guest');
  await page.getByLabel('Your name').fill('Retake Guest');
  await page.getByRole('button',{name:'Retake',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.shutter')?.disabled===false);
  await page.getByRole('button',{name:'Take photo',exact:true}).click();
  await page.waitForURL('**/summary');
  assert(await page.getByLabel('Your name').inputValue()==='','retake clears the name');
  return {checks:passed.length,passed};
}
