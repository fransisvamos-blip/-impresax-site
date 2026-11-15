// One-time read-only visual QA: true Chromium layout at phone, tablet and desktop widths.
import {chromium} from 'playwright-core';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';

const candidates=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];
const executablePath=candidates.find(existsSync);
if(!executablePath)throw new Error('No Chromium browser on CI runner; visual QA cannot be skipped');
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
const target='https://opportunita.impresax.org/';
const capture='/tmp/opportunita-visual-qa';
await mkdir(capture,{recursive:true});
const widths=[320,375,390,414,430,768,1024,1440];
let failures=[];
try{
 for(const width of widths){
  const mobile=width<=430;
  const page=await browser.newPage({viewport:{width,height:mobile?844:900},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
  try{
   const response=await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000});
   if(!response||response.status()!==200)throw new Error('Page HTTP '+response?.status());
   await page.evaluate(()=>document.fonts?.ready?.catch?.(()=>{}));
   const audit=await page.evaluate(()=>{
    const rgb=c=>{const n=c.match(/[\d.]+/g);return n?.length>=3?[+n[0],+n[1],+n[2]]:null};
    const luminance=c=>{const a=rgb(c);if(!a)return null;const v=a.map(n=>{const x=n/255;return x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4});return .2126*v[0]+.7152*v[1]+.0722*v[2]};
    const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return x===null||y===null?0:(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
    const selector=s=>document.querySelector(s);
    const box=e=>e?.getBoundingClientRect();
    const overflow=s=>{const e=selector(s);if(!e)return 'missing';const b=box(e);return b.right>window.innerWidth+3||b.left< -3||e.scrollWidth>e.clientWidth+3?'overflow':null};
    const stepNodes=[...document.querySelectorAll('.step')];
    const steps=stepNodes.map(e=>{const n=e.querySelector('.step-index'),h=e.querySelector('h3');const c=getComputedStyle(n);return {text:n.textContent.trim(),contrast:contrast(c.color,c.backgroundColor),background:c.backgroundColor,color:c.color,title:h.innerText.replace(/\s+/g,' ').trim(),badgeWidth:n.getBoundingClientRect().width}});
    const ctas=['.primary-cta','.submit-button','.closing-cta-button','.mobile-action-primary'].map(s=>{const e=selector(s),c=getComputedStyle(e);return {name:s,ratio:contrast(c.color,c.backgroundColor)}});
    const textSelectors=['.brand','.hero h1','.hero-city-line','.hero-editorial-headline','.offer-intro h2','.offer-card-title','.contact-intro h2','.why-heading h2','.story-copy h2','.steps-intro h2','.closing-cta-copy h3','.closing-cta-button'];
    const overflows=textSelectors.map(s=>({selector:s,issue:overflow(s)})).filter(x=>x.issue);
    const field=selector('#full_name');
    return {viewport:window.innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,sections:document.querySelectorAll('main>section').length,steps,ctas,overflows,inputFontSize:parseFloat(getComputedStyle(field).fontSize),menuToggle:getComputedStyle(selector('.menu-toggle')).display,footer:!!selector('.site-footer'),photoSizes:selector('.story-media img')?.sizes,hero:selector('.hero-editorial-headline')?.textContent.replace(/\s+/g,' ').trim()};
   });
   const faults=[];
   if(audit.sections!==6)faults.push('Section count '+audit.sections);
   if(audit.documentWidth>width+3)faults.push('Horizontal overflow doc='+audit.documentWidth);
   if(audit.bodyWidth>width+3)faults.push('Horizontal overflow body='+audit.bodyWidth);
   for(const e of audit.overflows)faults.push(e.selector+' '+e.issue);
   for(const step of audit.steps){
    if(step.contrast<7)faults.push('Low contrast step '+step.text+': '+step.contrast.toFixed(2));
    if(step.badgeWidth<38)faults.push('Step badge too small: '+step.text);
   }
   if(!audit.steps.some(s=>s.title==='PRIMO CONTATTO'))faults.push('Collapsed heading: PRIMO CONTATTO');
   if(!audit.steps.some(s=>s.title==='SCEGLI LA FORMULA'))faults.push('Collapsed heading: SCEGLI LA FORMULA');
   if(!audit.steps.some(s=>s.title==='VALUTA I DETTAGLI'))faults.push('Collapsed heading: VALUTA I DETTAGLI');
   for(const item of audit.ctas)if(item.ratio<4.5)faults.push(item.name+' low CTA contrast '+item.ratio.toFixed(2));
   if(width<=670&&audit.inputFontSize<16)faults.push('iOS zoom risk: input '+audit.inputFontSize);
   if(!audit.hero?.includes('MOVIDA UNIVERSITARIA'))faults.push('Missing editorial proof');
   if(width===390||width===1440){
    // Full-page screenshots do not necessarily trigger native lazy-loading.
    // Mimic a real reader scrolling to chapter 05 and verify that image actually loads.
    const story=page.locator('.story-media img');
    await story.scrollIntoViewIfNeeded({timeout:8000});
    try{
      await page.waitForFunction(()=>{
        const img=document.querySelector('.story-media img');
        return Boolean(img&&img.complete&&img.naturalWidth>0);
      },null,{timeout:18000});
    }catch(e){
      const imageState=await story.evaluate(img=>({url:img.currentSrc,complete:img.complete,naturalWidth:img.naturalWidth}));
      faults.push('Chapter 05 illustration failed to load on scroll: '+JSON.stringify(imageState));
    }
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:capture+'/viewport-'+width+'.png',fullPage:true,animations:'disabled',timeout:30000});
   }
   if(width<=810){
    const toggle=page.locator('#menu-toggle');
    if(!await toggle.isVisible())faults.push('Collapsed mobile navigation unavailable');
    else{
     await toggle.click();
     if(await toggle.getAttribute('aria-expanded')!=='true')faults.push('Menu failed to open');
     await page.locator('#main-nav a[href="#formule"]').click();
     if(await toggle.getAttribute('aria-expanded')!=='false')faults.push('Menu failed to close');
    }
   }
   console.log(JSON.stringify({width,steps:audit.steps.map(s=>({n:s.text,contrast:+s.contrast.toFixed(1),title:s.title})),documentWidth:audit.documentWidth,ctas:audit.ctas.map(c=>({n:c.name,ratio:+c.ratio.toFixed(1)})),issues:faults}));
   for(const problem of faults)failures.push(width+'px: '+problem);
  }catch(error){
   failures.push(width+'px: browser error '+String(error));
   console.error(width+'px:',String(error));
  }finally{await page.close();}
 }
}finally{await browser.close();}
if(failures.length)throw new Error('Responsive QA failures: '+failures.join('; '));
console.log('PASS: phone/tablet/desktop, 6 sections, readable step badges, CTA contrast, overflow, menu interaction and iOS input sizing');
