import puppeteer from "@cloudflare/puppeteer";
import { RENDER_DEVICE_SCALE_FACTOR, RENDER_JPEG_QUALITY, QA_JPEG_QUALITY, R118_QA_DEVICE_SCALE_FACTOR, R118_QA_JPEG_QUALITY, HERO_TEXT_OVER_IMAGE_REQUIRED, HIGH_RESOLUTION_VISUAL_PERCEPTION_REQUIRED } from "./constants.js";

export async function upscaleR107Hero(env,sourceBase64,mime="image/jpeg",{
  minWidth=3200,
  minHeight=1800,
  maxDimension=4096,
  maxScale=4
}={}) {
  if(!env.BROWSER) throw new Error("BROWSER_BINDING_NOT_CONFIGURED");
  const browser=await puppeteer.launch(env.BROWSER);
  try {
    const page=await browser.newPage();
    try {
      await page.setViewport({width:64,height:64,deviceScaleFactor:1});
      await page.setContent("<!doctype html><html><head><style>html,body{margin:0;padding:0;background:#0a0a0a;overflow:hidden}#hero{display:block;margin:0;padding:0}</style></head><body><img id=\"hero\" alt=\"\"></body></html>",{waitUntil:"domcontentloaded",timeout:30000});
      const source="data:"+String(mime||"image/jpeg")+";base64,"+String(sourceBase64||"");
      const natural=await page.evaluate(async(src)=>{
        const img=document.getElementById("hero");
        img.src=src;
        if(img.decode) await img.decode();
        else await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});
        return {width:img.naturalWidth,height:img.naturalHeight};
      },source);
      const nw=Math.max(1,Number(natural?.width||0));
      const nh=Math.max(1,Number(natural?.height||0));
      if(nw<64 || nh<64) throw new Error("R107_HERO_MASTER_SOURCE_INVALID");
      let scale=Math.max(1,Number(minWidth)/nw,Number(minHeight)/nh);
      scale=Math.min(scale,Number(maxScale),Number(maxDimension)/nw,Number(maxDimension)/nh);
      scale=Math.max(1,scale);
      const width=Math.max(nw,Math.round(nw*scale));
      const height=Math.max(nh,Math.round(nh*scale));
      if(scale<=1.001) return {unchanged:true,width:nw,height:nh,source_width:nw,source_height:nh,scale:1};
      await page.setViewport({width,height,deviceScaleFactor:1});
      await page.evaluate(({width,height})=>{
        const img=document.getElementById("hero");
        Object.assign(document.documentElement.style,{width:width+"px",height:height+"px"});
        Object.assign(document.body.style,{width:width+"px",height:height+"px"});
        Object.assign(img.style,{width:width+"px",height:height+"px",objectFit:"fill",imageRendering:"auto"});
      },{width,height});
      const bytes=await page.screenshot({type:"jpeg",quality:RENDER_JPEG_QUALITY,fullPage:true});
      return {unchanged:false,bytes:new Uint8Array(bytes),mime:"image/jpeg",width,height,source_width:nw,source_height:nh,scale:Number(scale.toFixed(4))};
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

async function renderPage(browser,html,width,height,{qaDeviceScaleFactor=RENDER_DEVICE_SCALE_FACTOR,qaJpegQuality=QA_JPEG_QUALITY}={}) {
  const page=await browser.newPage();
  try {
    await page.setViewport({width,height,deviceScaleFactor:RENDER_DEVICE_SCALE_FACTOR});
    await page.setContent(html,{waitUntil:"domcontentloaded",timeout:30000});
    await page.evaluate(async()=>{ if(document.fonts?.ready) await document.fonts.ready; });
    const runtimeImageTreatment=await page.evaluate(async(renderScale)=>{
      const treated=[];
      const skipped=[];
      for(const img of [...document.images]) {
        try {
          if(img.decode) await img.decode();
          if(!img.complete || !img.naturalWidth || !img.naturalHeight) continue;
          const src=String(img.currentSrc||img.src||"");
          if(!src.startsWith("data:image/") || /^data:image\/svg\+xml/i.test(src)) {
            skipped.push({reason:"NON_RASTER_OR_NON_DATA",src:src.slice(0,48)});
            continue;
          }
          const rect=img.getBoundingClientRect();
          if(rect.width<24 || rect.height<24) continue;
          const sourceWidth=img.naturalWidth;
          const sourceHeight=img.naturalHeight;
          const desiredWidth=Math.min(4096,Math.max(sourceWidth,Math.ceil(rect.width*renderScale)));
          const scale=Math.min(4,desiredWidth/sourceWidth);
          if(scale<=1.01) continue;
          const width=Math.max(sourceWidth,Math.round(sourceWidth*scale));
          const height=Math.max(sourceHeight,Math.round(sourceHeight*scale));
          const canvas=document.createElement("canvas");
          canvas.width=width;
          canvas.height=height;
          const ctx=canvas.getContext("2d",{alpha:false});
          ctx.imageSmoothingEnabled=true;
          ctx.imageSmoothingQuality="high";
          ctx.drawImage(img,0,0,width,height);
          img.src=canvas.toDataURL("image/jpeg",0.96);
          if(img.decode) await img.decode();
          treated.push({source_width:sourceWidth,source_height:sourceHeight,width,height,scale:Number(scale.toFixed(3))});
        } catch(error) {
          skipped.push({reason:String(error?.message||error).slice(0,120)});
        }
      }
      return {treated_count:treated.length,treated,skipped_count:skipped.length,skipped};
    },RENDER_DEVICE_SCALE_FACTOR);
    const diagnostics=await page.evaluate((runtimeImageTreatment)=>{
      const root=document.documentElement;
      const images=[...document.images];
      const logo=document.querySelector("[data-official-logo]");
      const bodyStyle=getComputedStyle(document.body);
      const verifiedContacts=[...document.querySelectorAll("[data-verified-contact]")];
      const header=document.querySelector(".ix-v2-header");
      const nav=document.querySelector(".ix-v2-nav");
      const footer=document.querySelector(".ix-v2-footer");
      const hero=document.querySelector("main #hero");
      const heroImage=hero?.querySelector("img")||null;
      const heroH1=hero?.querySelector("h1")||null;
      const heroLede=hero?.querySelector(".ixg-lede")||hero?.querySelector("p")||null;
      const heroActions=hero?.querySelector(".ixg-actions")||null;
      const rect=el=>el?el.getBoundingClientRect():null;
      const overlaps=(a,b)=>{
        if(!a||!b) return false;
        return Math.min(a.right,b.right)>Math.max(a.left,b.left)
          && Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);
      };
      const imageRect=rect(heroImage);
      const h1Rect=rect(heroH1);
      const ledeRect=rect(heroLede);
      const actionsRect=rect(heroActions);
      const finalCta=document.querySelector("main #final-cta");
      const requiredSections=["hero","positioning","services","trust","bridge","final-cta"];
      return {
        horizontal_overflow:root.scrollWidth>root.clientWidth+2,
        overflow_elements:[...document.querySelectorAll("body *")]
          .map(el=>{const r=el.getBoundingClientRect();return {tag:el.tagName.toLowerCase(),id:el.id||"",class:String(el.className||"").slice(0,160),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width)};})
          .filter(x=>x.right>root.clientWidth+2 || x.left<-2)
          .sort((a,b)=>Math.max(b.right-root.clientWidth,-b.left)-Math.max(a.right-root.clientWidth,-a.left))
          .slice(0,12),
        broken_images:images.filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.getAttribute("src")||"").slice(0,12),
        image_count:images.length,
        document_width:root.scrollWidth,
        document_height:root.scrollHeight,
        viewport_width:root.clientWidth,
        body_font_px:Number.parseFloat(bodyStyle.fontSize||"0"),
        logo_width:logo?logo.getBoundingClientRect().width:0,
        logo_height:logo?logo.getBoundingClientRect().height:0,
        official_logo_present:Boolean(logo && logo.complete && logo.naturalWidth>0),
        verified_contact_count:verifiedContacts.length,
        header_present:Boolean(header),
        nav_link_count:nav?[...nav.querySelectorAll("a")].length:0,
        header_cta_present:Boolean(document.querySelector(".ix-v2-header-cta")),
        footer_present:Boolean(footer),
        footer_nav_link_count:footer?[...footer.querySelectorAll(".ix-v2-footer-nav a")].length:0,
        h1_count:document.querySelectorAll("main h1").length,
        section_count:document.querySelectorAll("main section").length,
        required_sections_present:requiredSections.filter(id=>document.getElementById(id)),
        hero_action_count:hero?[...hero.querySelectorAll("a")].length:0,
        hero_text_over_image:Boolean(overlaps(h1Rect,imageRect)),
        hero_copy_over_image:Boolean(overlaps(ledeRect,imageRect)),
        hero_cta_over_image:Boolean(overlaps(actionsRect,imageRect)),
        hero_image_natural_width:Number(heroImage?.naturalWidth||0),
        hero_image_natural_height:Number(heroImage?.naturalHeight||0),
        hero_image_is_vector:/^data:image\/svg\+xml/i.test(String(heroImage?.currentSrc||heroImage?.src||"")),
        hero_image_rendered_width:Number(imageRect?.width||0),
        hero_image_rendered_height:Number(imageRect?.height||0),
        hero_image_resolution_ratio:imageRect&&heroImage
          ? Math.min(
              Number(heroImage.naturalWidth||0)/Math.max(1,imageRect.width),
              Number(heroImage.naturalHeight||0)/Math.max(1,imageRect.height)
            )
          : 0,
        final_cta_present:Boolean(finalCta),
        final_cta_action_count:finalCta?[...finalCta.querySelectorAll("a")].length:0,
        clipped_contacts:verifiedContacts
          .filter(el=>el.scrollWidth>el.clientWidth+2 || el.scrollHeight>el.clientHeight+2)
          .map(el=>(el.textContent||"").trim()).filter(Boolean).slice(0,8),
        runtime_high_res_treated_images:Number(runtimeImageTreatment?.treated_count||0),
        runtime_high_res_treatment:runtimeImageTreatment||{}
      };
    },runtimeImageTreatment);
    const bytes=await page.screenshot({type:"jpeg",quality:RENDER_JPEG_QUALITY,fullPage:true});
    if(Number(qaDeviceScaleFactor)!==Number(RENDER_DEVICE_SCALE_FACTOR)) {
      await page.setViewport({width,height,deviceScaleFactor:qaDeviceScaleFactor});
    }
    const qaBytes=await page.screenshot({type:"jpeg",quality:qaJpegQuality,fullPage:true});
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
  if(desktop.diagnostics.clipped_contacts?.length) issues.push("DESKTOP_VERIFIED_CONTACT_CLIPPED");
  if(mobile.diagnostics.clipped_contacts?.length) issues.push("MOBILE_VERIFIED_CONTACT_CLIPPED");
  for(const [label,diag] of [["DESKTOP",desktop.diagnostics],["MOBILE",mobile.diagnostics]]) {
    if(!diag.header_present) issues.push(label+"_PREMIUM_HEADER_MISSING");
    if(Number(diag.nav_link_count||0)<3) issues.push(label+"_NAVIGATION_INCOMPLETE");
    if(!diag.header_cta_present) issues.push(label+"_HEADER_CTA_MISSING");
    if(Number(diag.h1_count||0)!==1) issues.push(label+"_H1_COUNT_INVALID");
    if(Number(diag.hero_action_count||0)<2) issues.push(label+"_HERO_ACTIONS_INCOMPLETE");
    if(HERO_TEXT_OVER_IMAGE_REQUIRED && !diag.hero_text_over_image) issues.push(label+"_HERO_H1_NOT_OVER_IMAGE");
    if(HERO_TEXT_OVER_IMAGE_REQUIRED && !diag.hero_copy_over_image) issues.push(label+"_HERO_COPY_NOT_OVER_IMAGE");
    if(HERO_TEXT_OVER_IMAGE_REQUIRED && !diag.hero_cta_over_image) issues.push(label+"_HERO_CTA_NOT_OVER_IMAGE");
    if(HIGH_RESOLUTION_VISUAL_PERCEPTION_REQUIRED && !diag.hero_image_is_vector && Number(diag.hero_image_resolution_ratio||0)<1) issues.push(label+"_HERO_SOURCE_RESOLUTION_TOO_LOW");
    if(Number(diag.section_count||0)<6) issues.push(label+"_PAGE_ARCHITECTURE_TOO_SHALLOW");
    if((diag.required_sections_present||[]).length<6) issues.push(label+"_REQUIRED_SECTIONS_MISSING");
    if(!diag.final_cta_present || Number(diag.final_cta_action_count||0)<1) issues.push(label+"_FINAL_CTA_INCOMPLETE");
    if(!diag.footer_present || Number(diag.footer_nav_link_count||0)<4) issues.push(label+"_PREMIUM_FOOTER_INCOMPLETE");
  }
  const needsLogo=String(inputPayload?.official_logo?.status||"").toUpperCase()!=="NO_OFFICIAL_LOGO_CONFIRMED";
  if(needsLogo && (desktop.diagnostics.logo_width<40 || mobile.diagnostics.logo_width<32)) issues.push("OFFICIAL_IDENTITY_NOT_VISIBLE");
  return {pass:issues.length===0,issues};
}

export async function captureVariant(env,html,inputPayload) {
  if(!env.BROWSER) throw new Error("BROWSER_BINDING_NOT_CONFIGURED");
  const browser=await puppeteer.launch(env.BROWSER);
  try {
    const r118FastQa=inputPayload?.r118_perceptual_jury===true;
    const qaOptions=r118FastQa
      ? {qaDeviceScaleFactor:R118_QA_DEVICE_SCALE_FACTOR,qaJpegQuality:R118_QA_JPEG_QUALITY}
      : {};
    const [desktop,mobile]=await Promise.all([
      renderPage(browser,html,1440,900,qaOptions),
      renderPage(browser,html,390,844,qaOptions)
    ]);
    const gate=deterministicBrowserGate(desktop,mobile,inputPayload);
    return {desktop,mobile,gate};
  } finally {
    await browser.close();
  }
}
