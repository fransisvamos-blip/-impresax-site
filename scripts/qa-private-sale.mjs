import {chromium} from 'playwright-core';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
const bins=['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/google-chrome-stable','/usr/bin/chromium-browser'];
const executablePath=bins.find(existsSync);
if(!executablePath)throw Error('Chromium not available; cannot skip responsive QA');
const url=process.env.QA_BASE_URL||'https://opportunita.impresax.org/';
const isLive=url.startsWith('https://');
const shots='/tmp/opportunita-private-sale06-qa';
await mkdir(shots,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
const widths=[320,375,390,430,768,1024,1280,1440,1600];
const problems=[];
try{
 for(const width of widths){
  const page=await browser.newPage({viewport:{width,height:width<500?844:940},deviceScaleFactor:1,isMobile:width<=430,hasTouch:width<=430});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  const intercepted=[];
  await page.route('**/api/interesse',route=>{
    try{intercepted.push(JSON.parse(route.request().postData()||'{}'))}catch{}
    return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,status:'RICEVUTA',request_id:'mocked-ci-no-write'})});
  });
  try{
   const resp=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
   if(!resp||resp.status()!==200)throw Error('Landing HTTP '+resp?.status());
   await page.waitForFunction(()=>document.querySelector('.hero-photo')?.complete&&document.querySelector('.hero-photo')?.naturalWidth>0,null,{timeout:18000});
   const audit=await page.evaluate(()=>{
     const selectors=['.brand','.hero h1','.hero-sub','.hero-actions','.deal-title h2','.deal-main h3','.deal-alt h3','.story-copy h2','.story-action a','.process-top h2','.contact-intro h2','.form-button'];
     const broken=selectors.map(s=>{const el=document.querySelector(s),r=el?.getBoundingClientRect();return {s,r};}).filter(x=>!x.r||x.r.right>innerWidth+3||x.r.left< -3).map(x=>x.s);
     const heroCTA=document.querySelector('.hero-actions .btn-orange').getBoundingClientRect();
     const inputs=[...document.querySelectorAll('.form-field input')].map(el=>parseFloat(getComputedStyle(el).fontSize));
     return {w:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth,chapters:document.querySelectorAll('main>section').length,
       headline:document.querySelector('h1')?.textContent.replace(/\s+/g,' ').trim(),broken,heroCtaBottom:heroCTA.bottom,inputs,
       primaryHref:document.querySelector('.hero-actions .btn-orange')?.getAttribute('href'),
       heroImage:document.querySelector('.hero-photo')?.naturalWidth,
       storyBg:getComputedStyle(document.querySelector('.editorial')).backgroundImage,
       offerBg:getComputedStyle(document.querySelector('.deal')).backgroundImage,
       stepNumbers:[...document.querySelectorAll('.step-marker')].map(e=>({text:e.querySelector('.process-num')?.textContent.trim(),bg:getComputedStyle(e).backgroundImage,color:getComputedStyle(e.querySelector('.process-num')).color,width:e.getBoundingClientRect().width})),
       heroFont:getComputedStyle(document.querySelector('.hero h1')).fontFamily,
       storyAction:document.querySelector('.story-action a')?.getAttribute('href'),
       formBg:getComputedStyle(document.querySelector('.demo-form')).backgroundColor};
   });
   if(audit.scroll>width+3||audit.body>width+3)throw Error('horizontal overflow '+JSON.stringify(audit));
   if(audit.broken.length)throw Error('clipped essentials '+JSON.stringify(audit.broken));
   if(audit.chapters!==5)throw Error('Expected five chapters');
   if(audit.stepNumbers.length!==3)throw Error('Expected 3 readable steps');
   for(const badge of audit.stepNumbers){
     if(badge.width<40||!badge.bg.includes('linear-gradient')||!badge.color)throw Error('Unclear step number '+JSON.stringify(badge));
   }
   if(!audit.offerBg.includes('linear-gradient'))throw Error('Offer not premium designed');
   if(!audit.storyBg.includes('radial-gradient'))throw Error('Story not immersive');
   if(audit.storyAction!=='#contatto')throw Error('Photo story CTA missing');
   if(!audit.heroFont.includes('Cormorant Garamond'))throw Error('Approved editorial font missing');
   if(audit.formBg==='rgba(0, 0, 0, 0)')throw Error('Contact form surface missing');
   if(audit.headline!=='CEDESI LOUNGE BAR')throw Error('Cedesi Lounge Bar missing: '+audit.headline);
   if(audit.primaryHref!=='#contatto')throw Error('CTA not pointing to contact');
   if(!await page.locator('#deal-heading').textContent().then(t=>t.replace(/\s+/g,' ').includes('VENDITA O GESTIONE?')))throw Error('Two-formula section missing');
   if(width<=430&&audit.inputs.some(n=>n<16))throw Error('iOS zoom risk');
   if(width<=430&&audit.heroCtaBottom>860)throw Error('First mobile CTA too low '+audit.heroCtaBottom);
   if(width<=640){
     const nav=page.locator('.nav-toggle');
     await nav.click();
     if(await nav.getAttribute('aria-expanded')!=='true')throw Error('mobile nav failed to open');
     await nav.click();
     if(await nav.getAttribute('aria-expanded')!=='false')throw Error('mobile nav failed to close');
   }
   const stage=page.locator('.story-photo img');
   await stage.scrollIntoViewIfNeeded({timeout:10000});
   await page.waitForFunction(()=>{
     const e=document.querySelector('.story-photo img');return !!e&&e.complete&&e.naturalWidth>0;
   },null,{timeout:18000});
   if(width===390||width===1440){
     await page.evaluate(()=>window.scrollTo(0,0));
     await page.screenshot({path:shots+'/'+(isLive?'live-':'staged-')+width+'.png',fullPage:true,animations:'disabled',timeout:30000});
   }
   if(width===390||width===1440){
     const management=page.locator('a[data-pref="gestione"]').first();
     await management.click();
     if(await page.locator('#interesse').inputValue()!=='gestione')throw Error('Management selection not transferred to form');
     await page.locator('#name').fill('QA locale');
     await page.locator('#phone').fill('+39 333 1234567');
     await page.locator('#contact-preference').selectOption('whatsapp');
     await page.locator('#notes').fill('Richiedo informazioni riservate');
     await page.locator('#privacy').check();
     await page.locator('#interest-form button[type=submit]').click();
     await page.waitForTimeout(150);
     if(intercepted.length!==1)throw Error('Form failed to send one intercepted JSON request: '+intercepted.length);
     const data=intercepted[0];
     if(data.transaction_interest!=='gestione'||data.privacy_accepted!==true||data.budget_band!=='da-definire'||data.full_name!=='QA locale'||!data.notes.includes('whatsapp')||!data.notes.includes('Richiedo informazioni riservate'))throw Error('Wrong lead payload: '+JSON.stringify(data));
     if(!await page.locator('#form-msg.success').isVisible())throw Error('Missing success feedback');
   }
   if(errors.length)throw Error('Browser JS errors: '+errors.join('; '));
   console.log('PASS',width,audit.headline,'overflow=none','images=loaded',isLive?'LIVE':'STAGED');
  }catch(e){problems.push(width+'px '+String(e));console.error('FAIL',width,String(e))}
  finally{await page.close()}
 }
}finally{await browser.close()}
if(problems.length)throw Error('Responsive QA failed: '+problems.join(' | '));
console.log('PRIVATE SALE 06 QA PASSED',isLive?'LIVE':'STAGED',widths.join(','),'no real lead saved (all form requests intercepted)');
