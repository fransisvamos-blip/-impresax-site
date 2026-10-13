import { neon } from "@neondatabase/serverless";
import puppeteer from "@cloudflare/puppeteer";

const DOMAIN_SUFFIX = ".impresax.org";
const MAX_FACTORY_CYCLES = 5;
const MAX_VISUAL_DIFF = 0.20;
const VIEWPORTS = Object.freeze([
  { width:390, height:844, reference:"mobile" },
  { width:430, height:932, reference:"mobile" },
  { width:1440, height:1000, reference:"desktop" },
]);

function db(env) {
  if (!env.OPS_DATABASE_URL) throw new Error("OPS_DATABASE_URL_NOT_CONFIGURED");
  return neon(env.OPS_DATABASE_URL);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function safeUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return ["http:","https:","tel:","mailto:"].includes(parsed.protocol) ? url : "";
  } catch {
    return /^(tel:|mailto:)/i.test(url) ? url : "";
  }
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"").slice(0,63);
}

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function objectHasData(value) {
  return Boolean(value && typeof value === "object" && Object.keys(value).length);
}

const REQUIRED_BRAND_DNA_KEYS=Object.freeze([
  "brand_personality","visual_cues","tone","business_type","audience","offer",
  "local_context","trust_signals","existing_colors","typography_cues","imagery_cues",
  "business_positioning","commercial_behavior"
]);

function brandDnaComplete(value) {
  if (!value || typeof value!=="object") return false;
  return REQUIRED_BRAND_DNA_KEYS.every(key => {
    const v=value[key];
    if (Array.isArray(v)) return v.length>0;
    if (v && typeof v==="object") return Object.keys(v).length>0;
    return String(v || "").trim().length>2;
  });
}

function pick(obj, keys, fallback="") {
  for (const key of keys) {
    if (obj && obj[key] != null && obj[key] !== "") return obj[key];
  }
  return fallback;
}

function color(value, fallback) {
  const v=String(value || "").trim();
  return /^#[0-9a-f]{3,8}$/i.test(v) || /^rgb/i.test(v) || /^hsl/i.test(v) ? v : fallback;
}

function font(value, fallback) {
  const v=String(value || "").trim();
  return v && /^[a-z0-9 ,"'\-]+$/i.test(v) ? v : fallback;
}

function assetUrl(map, key) {
  const item = map?.[key];
  if (typeof item === "string") return safeUrl(item);
  if (item && typeof item === "object") return safeUrl(pick(item,["url","asset_url","src"]));
  return "";
}

function renderCta(cta) {
  if (!cta) return "";
  const label=typeof cta === "string" ? cta : pick(cta,["label","text","title"]);
  const href=typeof cta === "object" ? safeUrl(pick(cta,["href","url"])) : "";
  if (!label || !href) return "";
  return `<a class="ix-cta" data-ix-cta href="${esc(href)}">${esc(label)}</a>`;
}

function renderContentItems(items) {
  const list=asArray(items).filter(v => v != null && v !== "");
  if (!list.length) return "";
  return `<ul class="ix-list">${list.map(item => {
    if (typeof item === "object") {
      const title=pick(item,["title","label","name"]);
      const body=pick(item,["text","body","description"]);
      return `<li>${title?`<strong>${esc(title)}</strong>`:""}${body?`<span>${esc(body)}</span>`:""}</li>`;
    }
    return `<li>${esc(item)}</li>`;
  }).join("")}</ul>`;
}

function renderSection(section, contentMap, ctaMap, imageMap) {
  const spec=typeof section === "string" ? { id:section } : (section || {});
  const id=String(pick(spec,["id","key","section"],"section")).trim();
  const content=(contentMap && contentMap[id]) || spec.content || {};
  const layout=String(pick(spec,["layout","type"],"standard")).toLowerCase();
  const eyebrow=pick(content,["eyebrow","kicker","overline"]);
  const title=pick(content,["title","headline","heading"]);
  const body=pick(content,["body","text","description","copy"]);
  const items=pick(content,["items","bullets","cards"],[]);
  const imageKey=pick(spec,["image","image_key","asset"],pick(content,["image","image_key"],id));
  const image=assetUrl(imageMap,imageKey);
  const ctaKey=pick(spec,["cta","cta_key"],id);
  const cta=ctaMap?.[ctaKey] || content.cta || null;

  return `<section class="ix-section ix-${esc(layout)}" id="${esc(id)}" data-section="${esc(id)}" data-layout="${esc(layout)}">
    <div class="ix-inner">
      <div class="ix-copy">
        ${eyebrow?`<span class="ix-eyebrow">${esc(eyebrow)}</span>`:""}
        ${title?`<h2>${esc(title)}</h2>`:""}
        ${body?`<p>${esc(body)}</p>`:""}
        ${renderContentItems(items)}
        ${renderCta(cta)}
      </div>
      ${image?`<figure class="ix-media"><img src="${esc(image)}" alt="${esc(pick(content,["image_alt","alt"],title || id))}" loading="eager"></figure>`:""}
    </div>
  </section>`;
}

function renderFactoryHtml(prospect, pack) {
  const palette=pack.palette || {};
  const typography=pack.typography || {};
  const imageMap=pack.image_asset_map || {};
  const sections=asArray(pack.section_map);
  const contentMap=pack.content_map || {};
  const ctaMap=pack.cta_map || {};
  const logoUrl=safeUrl(pick(pack.official_logo,["url","asset_url","src"]));
  const logoAlt=pick(pack.official_logo,["alt","label"],prospect.business_name);

  const bg=color(pick(palette,["background","bg","surface"]),"#ffffff");
  const text=color(pick(palette,["text","foreground","ink"]),"#111111");
  const accent=color(pick(palette,["accent","primary","brand"]),"#111111");
  const muted=color(pick(palette,["muted","secondary"]),"#666666");
  const headingFont=font(pick(typography,["heading","headings","display"]),"Inter, Arial, sans-serif");
  const bodyFont=font(pick(typography,["body","text"]),"Inter, Arial, sans-serif");

  const css=`
    :root{--bg:${bg};--text:${text};--accent:${accent};--muted:${muted};--hf:${headingFont};--bf:${bodyFont}}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:var(--bf);line-height:1.5}
    img{display:block;max-width:100%;height:auto}.ix-shell{overflow:hidden}.ix-header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:22px clamp(20px,5vw,80px)}
    .ix-logo{max-width:min(220px,45vw);max-height:72px}.ix-section{padding:clamp(54px,7vw,110px) clamp(20px,5vw,80px)}
    .ix-inner{width:min(1180px,100%);margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(30px,6vw,90px);align-items:center}
    .ix-section[data-layout="full"] .ix-inner,.ix-section[data-layout="standard"] .ix-inner{grid-template-columns:1fr}.ix-section[data-layout="hero"]{padding-top:clamp(56px,8vw,128px)}
    .ix-eyebrow{display:block;margin-bottom:14px;color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
    h1,h2,h3{font-family:var(--hf);letter-spacing:-.035em;line-height:1.02}h2{margin:0 0 20px;font-size:clamp(38px,6vw,78px)}p{margin:0 0 24px;max-width:66ch;font-size:clamp(16px,1.6vw,21px);color:var(--muted)}
    .ix-list{display:grid;gap:14px;padding:0;margin:26px 0;list-style:none}.ix-list li{display:grid;gap:4px}.ix-list span{color:var(--muted)}
    .ix-media img{width:100%;max-height:720px;object-fit:cover}.ix-cta{display:inline-flex;padding:14px 20px;background:var(--accent);color:var(--bg);text-decoration:none;font-weight:800}
    @media(max-width:760px){.ix-header{padding:18px 20px}.ix-inner{grid-template-columns:1fr}.ix-section{padding:48px 20px}.ix-media{order:-1}.ix-section[data-layout="hero"] .ix-media{order:0}h2{font-size:clamp(34px,11vw,56px)}}
  `;

  return `<!doctype html><html lang="it"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive">
    <title>${esc(prospect.business_name)} · Demo ImpresaX</title>
    <style>${css}</style>
  </head><body><div class="ix-shell">
    <header class="ix-header" data-ix-header>
      ${logoUrl?`<img class="ix-logo" data-ix-official-logo src="${esc(logoUrl)}" alt="${esc(logoAlt)}">`:`<strong>${esc(prospect.business_name)}</strong>`}
    </header>
    <main>${sections.map(s => renderSection(s,contentMap,ctaMap,imageMap)).join("")}</main>
  </div></body></html>`;
}

async function sha256(value) {
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

async function approvedContext(sql, prospectId) {
  const prospects=await sql`select * from prospects where id=${prospectId}::uuid limit 1`;
  const prospect=prospects[0];
  if (!prospect) throw new Error("PROSPECT_NOT_FOUND");

  const packs=await sql`select * from render_packs
    where prospect_id=${prospectId}::uuid and approved_reference=true and status='APPROVED'
    order by version desc,approved_at desc nulls last limit 1`;
  const pack=packs[0];
  if (!pack) throw new Error("APPROVED_RENDER_PACK_NOT_FOUND");

  const assets=await sql`select * from render_assets where render_pack_id=${pack.id}::uuid order by created_at asc`;
  return { prospect,pack,assets };
}

function validateApprovedPack(pack) {
  const missing=[];
  if (!pack.desktop_render_url) missing.push("DESKTOP_REFERENCE");
  if (!pack.mobile_render_url) missing.push("MOBILE_REFERENCE");
  if (!objectHasData(pack.official_logo)) missing.push("OFFICIAL_IDENTITY_RECORD");
  if (!brandDnaComplete(pack.brand_dna)) missing.push("FROZEN_BRAND_DNA");
  if (!objectHasData(pack.content_map)) missing.push("CONTENT_MAP");
  if (!String(pack.content_map?.implementation_html || "").trim()) missing.push("IMPLEMENTATION_HTML");
  if (!pack.content_map?.selected_variant || !pack.content_map?.selected_variant_id) missing.push("EXPLICIT_SELECTED_VARIANT");
  if (!Array.isArray(pack.source_references) || !pack.source_references.length) missing.push("SOURCE_REFERENCES");
  return missing;
}

async function validateApprovedVisualQa(sql, packId) {
  const rows=await sql`
    select
      count(*) filter (
        where rv.variant_key in ('A','B','C')
          and rv.desktop_render_url is not null
          and rv.mobile_render_url is not null
          and s.status='RENDERED'
          and s.desktop_image_base64 is not null
          and s.mobile_image_base64 is not null
          and s.rendered_at is not null
          and coalesce(s.design_notes->>'source','')='RENDERING_STUDIO_V1_FROZEN'
          and coalesce(s.design_notes->'visual_qa'->>'pass','false')='true'
          and coalesce(s.design_notes->'visual_qa'->>'model','')='@cf/qwen/qwen3.8-27b'
      )::int as qa_passed,
      count(*) filter (where rv.selected=true)::int as selected_count
    from render_variants rv
    join render_staging_payloads s
      on s.render_pack_id=rv.render_pack_id and s.variant_key=rv.variant_key
    where rv.render_pack_id=${packId}::uuid`;
  const state=rows[0] || {};
  return Number(state.qa_passed||0)===3 && Number(state.selected_count||0)===1;
}
export async function buildApprovedReference(env, prospectId) {
  const sql=db(env);
  const { prospect,pack,assets }=await approvedContext(sql,prospectId);

  // Hard stop per approved Render Pack: never exceed the frozen 5-cycle limit,
  // even if an upstream state counter is reset or a stale job is reconciled again.
  const cycleRows=await sql`select count(*)::int as cycles
    from site_builds
    where prospect_id=${prospectId}::uuid
      and render_pack_id=${pack.id}::uuid
      and status not in ('STALE_VISUAL_REJECTED','STALE_REFERENCE_V1')`;
  const packCycles=Number(cycleRows[0]?.cycles || 0);
  if (packCycles>=MAX_FACTORY_CYCLES) {
    const error="FACTORY_MAX_CYCLES_REACHED";
    await sql`select * from ops_transition_prospect(
      ${prospectId}::uuid,'ESCALATION_REQUIRED','FACTORY_MAX_CYCLES_REACHED',
      ${JSON.stringify({render_pack_id:pack.id,render_pack_version:pack.version,factory_cycles:packCycles,max_cycles:MAX_FACTORY_CYCLES})}::jsonb,
      'site-factory'
    )`;
    await sql`update prospects
      set build_status='STOPPED',qa_status='FAIL',error=${error},updated_at=now()
      where id=${prospectId}::uuid`;
    return {pass:false,status:"ESCALATION_REQUIRED",error,factory_cycle:packCycles,max_cycles:MAX_FACTORY_CYCLES};
  }

  const missing=validateApprovedPack(pack);
  const approvedVisualQa=await validateApprovedVisualQa(sql,pack.id);
  if (!approvedVisualQa) missing.push("THREE_VISUAL_QA_PASSES_AND_ONE_SELECTED_VARIANT");
  if (missing.length) {
    const error="RENDER_PACK_INCOMPLETE: "+missing.join(",");
    await sql`select * from ops_register_factory_failure(${prospectId}::uuid,'build',${error},
      ${JSON.stringify({ missing })}::jsonb)`;
    return { pass:false,error,missing };
  }

  let slug=prospect.slug || slugify(prospect.business_name);
  if (!slug) slug="demo-"+String(prospect.id).slice(0,8);
  const collision=await sql`select id from prospects where slug=${slug} and id<>${prospectId}::uuid limit 1`;
  if (collision.length) slug=(slug.slice(0,54)+"-"+String(prospect.id).slice(0,8)).replace(/-+$/,"");

  const html=String(pack.content_map?.implementation_html || "").trim();
  if (!html) {
    const error="RENDER_PACK_INCOMPLETE: IMPLEMENTATION_HTML";
    await sql`select * from ops_register_factory_failure(${prospectId}::uuid,'build',${error},
      ${JSON.stringify({ missing:["IMPLEMENTATION_HTML"] })}::jsonb)`;
    return { pass:false,error,missing:["IMPLEMENTATION_HTML"] };
  }
  const referenceLock={
    render_pack_id:pack.id,
    desktop_reference:pack.desktop_render_url,
    mobile_reference:pack.mobile_render_url,
    official_logo:pack.official_logo,
    brand_dna:pack.brand_dna,
    palette:pack.palette,
    typography:pack.typography,
    image_asset_map:pack.image_asset_map,
    section_map:pack.section_map,
    cta_map:pack.cta_map,
    content_map:{...pack.content_map,verified_business_name:prospect.business_name,implementation_html:"[LOCKED_BUILD_ARTIFACT]"},
    implementation_contract_version:pack.content_map?.implementation_contract_version || null,
    implementation_html_digest:await sha256(html),
    source_references:pack.source_references,
    assets:assets.map(a=>({type:a.asset_type,url:a.asset_url,source_type:a.source_type,rights_status:a.rights_status}))
  };
  const lockDigest=await sha256(JSON.stringify(referenceLock));
  const liveUrl="https://"+slug+DOMAIN_SUFFIX+"/";
  const attempts=await sql`select coalesce(max(attempt),0)+1 as attempt from site_builds where prospect_id=${prospectId}::uuid`;
  const attempt=Number(attempts[0]?.attempt || 1);

  const build=await sql`insert into site_builds(
    prospect_id,render_pack_id,status,attempt,repository,branch,live_url,build_meta,started_at,completed_at
  ) values(
    ${prospectId}::uuid,${pack.id}::uuid,'COMPLETED',${attempt},
    'fransisvamos-blip/-impresax-site','main',${liveUrl},
    ${JSON.stringify({
      factory:"AUTONOMOUS_SITE_FACTORY_V1",
      rendered_html:html,
      slug,
      reference_lock_digest:lockDigest,
      reference_lock:referenceLock,
      noindex:true,
      disclaimer:true,
      responsive_viewports:[390,430,1440]
    })}::jsonb,now(),now()
  ) returning *`;

  await sql`update prospects set slug=${slug},live_url=${liveUrl},build_status='COMPLETED',brand_dna=${JSON.stringify(pack.brand_dna)}::jsonb where id=${prospectId}::uuid`;
  await sql`select * from ops_transition_prospect(${prospectId}::uuid,'QA_RUNNING','BUILD_COMPLETED',
    ${JSON.stringify({site_build_id:build[0].id,render_pack_id:pack.id,live_url:liveUrl,reference_lock_digest:lockDigest})}::jsonb,'site-factory')`;

  return { pass:true,site_build_id:build[0].id,render_pack_id:pack.id,live_url:liveUrl,reference_lock_digest:lockDigest };
}

function bytesToBase64(bytes) {
  let binary="";
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk) {
    binary += String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  }
  return btoa(binary);
}

async function compareImagesInPage(page, screenshotBytes, referenceUrl) {
  const response=await fetch(referenceUrl);
  if (!response.ok) throw new Error("REFERENCE_FETCH_"+response.status);
  const refBytes=new Uint8Array(await response.arrayBuffer());
  const a="data:image/png;base64,"+bytesToBase64(screenshotBytes);
  const mime=response.headers.get("content-type") || "image/png";
  const b="data:"+mime+";base64,"+bytesToBase64(refBytes);

  return page.evaluate(async ({a,b}) => {
    const load=src=>new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error("IMAGE_DECODE_FAILED"));
      img.src=src;
    });
    const [site,ref]=await Promise.all([load(a),load(b)]);
    const width=Math.min(site.naturalWidth,1440);
    const height=Math.min(site.naturalHeight,ref.naturalHeight,5000);
    const canvas=document.createElement("canvas");
    canvas.width=width; canvas.height=height;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    ctx.drawImage(site,0,0,width,height);
    const siteData=ctx.getImageData(0,0,width,height).data;
    ctx.clearRect(0,0,width,height);
    ctx.drawImage(ref,0,0,width,height);
    const refData=ctx.getImageData(0,0,width,height).data;
    let sum=0;
    for(let i=0;i<siteData.length;i+=4){
      sum+=Math.abs(siteData[i]-refData[i]);
      sum+=Math.abs(siteData[i+1]-refData[i+1]);
      sum+=Math.abs(siteData[i+2]-refData[i+2]);
    }
    const diff=sum/(width*height*3*255);
    return { diff,width,height,site_width:site.naturalWidth,site_height:site.naturalHeight,reference_width:ref.naturalWidth,reference_height:ref.naturalHeight };
  },{a,b});
}

function expectedPackLock(pack) {
  const sections=asArray(pack.section_map).map(section => {
    const spec=typeof section === "string" ? {id:section} : (section || {});
    return String(pick(spec,["id","key","section"],"section")).trim();
  });
  const images=[];
  const ctas=[];
  for(const section of asArray(pack.section_map)) {
    const spec=typeof section === "string" ? {id:section} : (section || {});
    const id=String(pick(spec,["id","key","section"],"section")).trim();
    const content=pack.content_map?.[id] || spec.content || {};
    const imageKey=pick(spec,["image","image_key","asset"],pick(content,["image","image_key"],id));
    const image=assetUrl(pack.image_asset_map || {},imageKey);
    if(image) images.push(image);
    const ctaKey=pick(spec,["cta","cta_key"],id);
    const cta=pack.cta_map?.[ctaKey] || content.cta || null;
    const href=cta && typeof cta === "object" ? safeUrl(pick(cta,["href","url"])) : "";
    if(href) ctas.push(href);
  }
  const logo=safeUrl(pick(pack.official_logo,["url","asset_url","src"]));
  const bodyFont=String(pick(pack.typography || {},["body","text"],"")).split(",")[0].replace(/['"]/g,"").trim().toLowerCase();
  const logoStatus=String(pack.official_logo?.status || "").toUpperCase();
  return {
    sections,
    images:[...new Set(images)],
    ctas:[...new Set(ctas)],
    logo,
    no_logo_confirmed:logoStatus==="NO_OFFICIAL_LOGO_CONFIRMED",
    business_name:String(pack.content_map?.business_name || ""),
    body_font:bodyFont
  };
}

async function runViewportQa(browser,liveUrl,pack,viewport) {
  const page=await browser.newPage();
  const consoleErrors=[];
  const brokenAssets=[];
  page.on("console",msg=>{ if(msg.type()==="error") consoleErrors.push(msg.text().slice(0,400)); });
  page.on("requestfailed",req=>brokenAssets.push(req.url()));
  page.on("response",res=>{ if(res.status()>=400) brokenAssets.push(res.url()); });

  try {
    await page.setViewport({width:viewport.width,height:viewport.height});
    const response=await page.goto(liveUrl,{waitUntil:"networkidle0",timeout:30000});
    const technical=await page.evaluate(() => {
      const robots=document.querySelector('meta[name="robots"]')?.content || "";
      const logo=document.querySelector("[data-ix-official-logo]");
      const images=[...document.images];
      const ctas=[...document.querySelectorAll("[data-ix-cta]")];
      const sections=[...document.querySelectorAll("[data-section]")];
      return {
        title:document.title,
        robots,
        logo_present:Boolean(logo),
        logo_src:logo?.getAttribute("src") || null,
        body_text:(document.body?.innerText || "").replace(/\s+/g," ").slice(0,12000),
        images_total:images.length,
        image_srcs:images.map(img=>img.currentSrc || img.src),
        images_broken:images.filter(img=>!img.complete || img.naturalWidth===0).map(img=>img.src),
        cta_count:ctas.length,
        cta_hrefs:ctas.map(a=>a.href),
        section_ids:sections.map(s=>s.getAttribute("data-section")),
        body_font:getComputedStyle(document.body).fontFamily,
        disclaimer_present:Boolean(document.querySelector("[data-impresax-demo-notice]")),
      };
    });
    const screenshot=await page.screenshot({type:"png",fullPage:true});
    const referenceUrl=viewport.reference==="desktop" ? pack.desktop_render_url : pack.mobile_render_url;
    const visual=await compareImagesInPage(page,new Uint8Array(screenshot),referenceUrl);
    const expected=expectedPackLock(pack);
    const normalize=u=>{ try{return new URL(u,liveUrl).href;}catch{return String(u||"");} };
    const actualImages=new Set((technical.image_srcs||[]).map(normalize));
    const actualCtas=new Set((technical.cta_hrefs||[]).map(normalize));
    const verifiedBusinessName=String(pack.content_map?.verified_business_name || "").trim();
    const identityPass=expected.logo
      ? normalize(technical.logo_src)===normalize(expected.logo)
      : expected.no_logo_confirmed
        ? Boolean(verifiedBusinessName && String(technical.body_text||"").toLowerCase().includes(verifiedBusinessName.toLowerCase()))
        : false;
    const lockChecks={
      identity: identityPass,
      images: expected.images.every(url=>actualImages.has(normalize(url))),
      ctas: expected.ctas.every(url=>actualCtas.has(normalize(url))),
      section_order: JSON.stringify(technical.section_ids||[])===JSON.stringify(expected.sections),
      typography: !expected.body_font || String(technical.body_font||"").toLowerCase().includes(expected.body_font),
    };
    const referenceLockPass=Object.values(lockChecks).every(Boolean);
    const pass=Boolean(
      response && response.ok() &&
      new URL(page.url()).protocol==="https:" &&
      /noindex/i.test(technical.robots) &&
      referenceLockPass &&
      technical.images_broken.length===0 &&
      technical.cta_count>0 &&
      technical.disclaimer_present &&
      consoleErrors.length===0 &&
      brokenAssets.length===0 &&
      referenceLockPass &&
      visual.diff<=MAX_VISUAL_DIFF
    );
    return {
      width:viewport.width,height:viewport.height,pass,
      http_status:response?.status() || null,
      final_url:page.url(),
      technical:{...technical,reference_lock:lockChecks,reference_lock_pass:referenceLockPass},
      console_errors:consoleErrors,broken_assets:[...new Set(brokenAssets)].slice(0,30),
      visual:{...visual,threshold:MAX_VISUAL_DIFF,pass:visual.diff<=MAX_VISUAL_DIFF}
    };
  } finally {
    await page.close();
  }
}

export async function qaApprovedReference(env, prospectId) {
  const sql=db(env);
  const { prospect,pack }=await approvedContext(sql,prospectId);
  pack.content_map={...(pack.content_map||{}),verified_business_name:prospect.business_name};
  const builds=await sql`select * from site_builds where prospect_id=${prospectId}::uuid and status='COMPLETED' order by attempt desc,created_at desc limit 1`;
  const build=builds[0];
  if (!build) throw new Error("SITE_BUILD_NOT_FOUND");
  if (!env.BROWSER) throw new Error("BROWSER_BINDING_NOT_CONFIGURED");

  let browser;
  let results=[];
  try {
    browser=await puppeteer.launch(env.BROWSER);
    for(const viewport of VIEWPORTS) {
      results.push(await runViewportQa(browser,build.live_url,pack,viewport));
    }
  } finally {
    if(browser) await browser.close();
  }

  const pass=results.every(r=>r.pass);
  const attemptRows=await sql`select coalesce(max(attempt),0)+1 as attempt from qa_runs where prospect_id=${prospectId}::uuid`;
  const attempt=Number(attemptRows[0]?.attempt || 1);
  const visualResults={
    pass,
    threshold:MAX_VISUAL_DIFF,
    viewports:Object.fromEntries(results.map(r=>[String(r.width),r.visual]))
  };
  const technicalResults={
    pass:results.every(r=>r.http_status>=200&&r.http_status<300&&r.technical.reference_lock_pass&&r.technical.images_broken.length===0&&r.technical.disclaimer_present&&r.console_errors.length===0&&r.broken_assets.length===0),
    checks:Object.fromEntries(results.map(r=>[String(r.width),{
      http_status:r.http_status,final_url:r.final_url,robots:r.technical.robots,logo_present:r.technical.logo_present,
      cta_count:r.technical.cta_count,body_font:r.technical.body_font,images_broken:r.technical.images_broken,
      reference_lock:r.technical.reference_lock,reference_lock_pass:r.technical.reference_lock_pass,
      disclaimer_present:r.technical.disclaimer_present,console_errors:r.console_errors,broken_assets:r.broken_assets
    }]))
  };

  await sql`insert into qa_runs(
    prospect_id,site_build_id,status,attempt,viewport_results,technical_results,visual_results,screenshots,error,started_at,completed_at
  ) values(
    ${prospectId}::uuid,${build.id}::uuid,${pass?"PASS":"FAIL"},${attempt},
    ${JSON.stringify(Object.fromEntries(results.map(r=>[String(r.width),{pass:r.pass,width:r.width,height:r.height}]))) }::jsonb,
    ${JSON.stringify(technicalResults)}::jsonb,
    ${JSON.stringify(visualResults)}::jsonb,
    ${JSON.stringify({captured:true,stored:false,viewports:VIEWPORTS.map(v=>v.width)})}::jsonb,
    ${pass?null:"REFERENCE_FIDELITY_OR_TECHNICAL_QA_FAILED"},now(),now()
  )`;

  if(pass) {
    await sql`update prospects set qa_status='PASS',build_status='COMPLETED' where id=${prospectId}::uuid`;
    await sql`select * from ops_transition_prospect(${prospectId}::uuid,'DEMO_READY','QA_PASSED',
      ${JSON.stringify({site_build_id:build.id,visual_results:visualResults,technical_results:technicalResults})}::jsonb,'site-factory')`;
    return { pass:true,status:"DEMO_READY",results };
  }

  await sql`select * from ops_register_factory_failure(${prospectId}::uuid,'qa','REFERENCE_FIDELITY_OR_TECHNICAL_QA_FAILED',
    ${JSON.stringify({site_build_id:build.id,visual_results:visualResults,technical_results:technicalResults})}::jsonb)`;
  const current=await sql`select pipeline_status,build_qa_cycle_count from prospects where id=${prospectId}::uuid`;
  return { pass:false,status:current[0]?.pipeline_status || "QA_FAILED",factory_cycle:current[0]?.build_qa_cycle_count || 0,max_cycles:MAX_FACTORY_CYCLES,results };
}

export async function resolveFactoryTenant(env, slug) {
  if (!env.OPS_DATABASE_URL) return null;
  const sql=db(env);
  const rows=await sql`
    select p.id as prospect_id,p.slug,p.business_name,p.vertical,p.pipeline_status,p.qa_status,p.live_url,
           sb.id as site_build_id,sb.build_meta
    from prospects p
    join lateral (
      select * from site_builds s
      where s.prospect_id=p.id and s.status='COMPLETED'
      order by s.attempt desc,s.created_at desc limit 1
    ) sb on true
    where p.slug=${slug}
      and p.pipeline_status in ('QA_RUNNING','QA_FAILED','BUILD_REWORK','ESCALATION_REQUIRED','DEMO_READY')
    limit 1`;
  const row=rows[0];
  if (!row) return null;
  const meta=row.build_meta || {};
  return {
    tenant_id:"factory:"+row.site_build_id,
    prospect_id:row.prospect_id,
    slug:row.slug,
    business_name:row.business_name,
    vertical:row.vertical,
    status:row.pipeline_status,
    qa_status:row.qa_status,
    rendered_html:meta.rendered_html || "",
    public_preview:true,
    autonomous_factory:true,
    noindex:true,
    disclaimer_enabled:true,
    reference_lock_digest:meta.reference_lock_digest || null,
  };
}
