import puppeteer from "@cloudflare/puppeteer";

async function renderPage(browser,html,width,height) {
  const page=await browser.newPage();
  try {
    await page.setViewport({width,height,deviceScaleFactor:1});
    await page.setContent(html,{waitUntil:"domcontentloaded",timeout:30000});
    await page.evaluate(async()=>{ if(document.fonts?.ready) await document.fonts.ready; });
    const diagnostics=await page.evaluate(()=>{
      const root=document.documentElement;
      const images=[...document.images];
      const logo=document.querySelector("[data-official-logo]");
      const bodyStyle=getComputedStyle(document.body);
      return {
        horizontal_overflow:root.scrollWidth>root.clientWidth+2,
        broken_images:images.filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.getAttribute("src")||"").slice(0,12),
        image_count:images.length,
        document_width:root.scrollWidth,
        document_height:root.scrollHeight,
        viewport_width:root.clientWidth,
        body_font_px:Number.parseFloat(bodyStyle.fontSize||"0"),
        logo_width:logo?logo.getBoundingClientRect().width:0,
        logo_height:logo?logo.getBoundingClientRect().height:0
      };
    });
    const bytes=await page.screenshot({type:"jpeg",quality:90,fullPage:true});
    const qaBytes=await page.screenshot({type:"jpeg",quality:55,fullPage:true});
    return {bytes:new Uint8Array(bytes),qaBytes:new Uint8Array(qaBytes),diagnostics};
  } finally {
    await page.close();
  }
}

export function deterministicBrowserGate(desktop,mobile,inputPayload) {
  const issues=[];
  if(desktop.diagnostics.horizontal_overflow) issues.push("DESKTOP_HORIZONTAL_OVERFLOW");
  if(mobile.diagnostics.horizontal_overflow) issues.push("MOBILE_HORIZONTAL_OVERFLOW");
  if(desktop.diagnostics.broken_images.length) issues.push("DESKTOP_BROKEN_IMAGES");
  if(mobile.diagnostics.broken_images.length) issues.push("MOBILE_BROKEN_IMAGES");
  if(Number(mobile.diagnostics.body_font_px||0)>0 && Number(mobile.diagnostics.body_font_px)<14) issues.push("MOBILE_BODY_TYPE_TOO_SMALL");
  const needsLogo=String(inputPayload?.official_logo?.status||"").toUpperCase()!=="NO_OFFICIAL_LOGO_CONFIRMED";
  if(needsLogo && (desktop.diagnostics.logo_width<40 || mobile.diagnostics.logo_width<32)) issues.push("OFFICIAL_IDENTITY_NOT_VISIBLE");
  return {pass:issues.length===0,issues};
}

export async function captureVariant(env,html,inputPayload) {
  if(!env.BROWSER) throw new Error("BROWSER_BINDING_NOT_CONFIGURED");
  const browser=await puppeteer.launch(env.BROWSER);
  try {
    const [desktop,mobile]=await Promise.all([
      renderPage(browser,html,1440,900),
      renderPage(browser,html,390,844)
    ]);
    const gate=deterministicBrowserGate(desktop,mobile,inputPayload);
    return {desktop,mobile,gate};
  } finally {
    await browser.close();
  }
}
