const ART_MODEL = "@cf/openai/gpt-oss-120b";
const HTML_MODEL = "@cf/zai-org/glm-4.7-flash";
const MASTER_URL = "https://raw.githubusercontent.com/fransisvamos-blip/-impresax-site/9578da3fa1b173283bf5c748b0e7d89497537e76/docs/RENDERING_STUDIO_V1_FROZEN.md";

function aiText(result) {
  if (typeof result === "string") return result;
  if (typeof result?.response === "string") return result.response;
  if (typeof result?.output_text === "string") return result.output_text;
  if (typeof result?.result?.response === "string") return result.result.response;
  if (Array.isArray(result?.choices)) {
    const content = result.choices[0]?.message?.content;
    if (typeof content === "string") return content;
  }
  if (Array.isArray(result?.output)) {
    const parts = [];
    for (const item of result.output) {
      if (typeof item?.content === "string") parts.push(item.content);
      if (Array.isArray(item?.content)) {
        for (const part of item.content) {
          if (typeof part?.text === "string") parts.push(part.text);
        }
      }
    }
    if (parts.length) return parts.join("\n");
  }
  return "";
}

async function runModel(env, model, messages, maxTokens, temperature) {
  if (!env.AI || typeof env.AI.run !== "function") throw new Error("WORKERS_AI_BINDING_NOT_CONFIGURED");
  const fallbackModel = model===ART_MODEL ? HTML_MODEL : ART_MODEL;
  try {
    return await env.AI.run(model, {
      messages,
      max_tokens: maxTokens,
      temperature,
      top_p: 0.92
    });
  } catch (primaryError) {
    try {
      return await env.AI.run(fallbackModel, {
        messages,
        max_tokens: maxTokens,
        temperature,
        top_p: 0.92
      });
    } catch {
      throw primaryError;
    }
  }
}

function extractJson(text) {
  const raw = String(text || "").trim();
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try { return JSON.parse(raw.slice(first, last + 1)); }
  catch { return null; }
}

function extractHtml(text) {
  let raw = String(text || "").trim();
  raw = raw.replace(/^\s*\`\`\`(?:html)?/i, "").replace(/\`\`\`\s*$/i, "").trim();
  let start = raw.toLowerCase().indexOf("<!doctype html");
  if (start < 0) start = raw.toLowerCase().indexOf("<html");
  const end = raw.toLowerCase().lastIndexOf("</html>");
  if (start < 0 || end < start) throw new Error("AI_HTML_DOCUMENT_REQUIRED");
  let html = raw.slice(start, end + 7).trim();
  html = html
    .replace(/<script\b[\s\S]*?<\/script>/gi,"")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi,"")
    .replace(/<object\b[\s\S]*?<\/object>/gi,"")
    .replace(/<embed\b[^>]*>/gi,"")
    .replace(/javascript\s*:/gi,"");
  if (html.length < 4500) throw new Error("AI_HTML_TOO_SHORT");
  if (html.length > 180000) throw new Error("AI_HTML_TOO_LARGE");
  return html;
}

function officialLogoUrl(prospect) {
  const logo = prospect?.logo || {};
  if (logo?.status === "PASS" && typeof logo?.url === "string" && logo.url.startsWith("https://")) return logo.url;
  if (logo?.status === "OFFICIAL_LOGO_LOCKED" && typeof logo?.url === "string") return logo.url;
  return null;
}

function canonicalAssetUrl(value) {
  try {
    const u=new URL(String(value || ""));
    u.hash="";
    return u.href;
  } catch {
    return "";
  }
}

function verifiedImageUrls(prospect) {
  const urls=new Set();
  const add=(value)=>{
    const raw = value && typeof value==="object" ? (value.url || value.src || value.asset_url) : value;
    const u=canonicalAssetUrl(raw);
    if (u && /^https:\/\//i.test(u)) urls.add(u);
  };
  const logo=prospect?.logo || {};
  add(logo.url || logo.official_source);
  for (const img of prospect?.firstPartyImages || prospect?.first_party_images || []) add(img);
  for (const img of prospect?.approvedExternalImages || prospect?.approved_external_images || []) add(img);
  return urls;
}

function htmlImageUrls(html) {
  const source=String(html || "");
  const urls=[];
  for (const m of source.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    if (/^https:\/\//i.test(m[1])) urls.push(m[1]);
  }
  for (const m of source.matchAll(/<source\b[^>]*\bsrcset=["']([^"']+)["']/gi)) {
    const first=String(m[1]||"").split(",")[0].trim().split(/\s+/)[0];
    if (/^https:\/\//i.test(first)) urls.push(first);
  }
  for (const m of source.matchAll(/(?:background|background-image)\s*:[^;{}]*url\(\s*["']?(https:\/\/[^"'\)\s]+)["']?\s*\)/gi)) {
    urls.push(m[1]);
  }
  return urls;
}

function unverifiedImageUrls(html, prospect) {
  const allowed=verifiedImageUrls(prospect);
  return [...new Set(htmlImageUrls(html).map(canonicalAssetUrl).filter(Boolean))]
    .filter(value => !allowed.has(value));
}

function repeatedImageUrls(html, prospect) {
  const logo=canonicalAssetUrl(officialLogoUrl(prospect));
  const counts=new Map();
  for (const raw of htmlImageUrls(html)) {
    const u=canonicalAssetUrl(raw);
    if (!u || u===logo) continue;
    counts.set(u,(counts.get(u)||0)+1);
  }
  const inventoryCount=assetInventory(prospect).length;
  const limit=inventoryCount>=3 ? 1 : 2;
  return [...counts.entries()].filter(([,n])=>n>limit).map(([u,n])=>({url:u,count:n}));
}

function officialLogoImmutable(html, prospect) {
  const logoUrl=officialLogoUrl(prospect);
  if (!logoUrl) return true;
  const tags=[...String(html || "").matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]);
  const tag=tags.find(t => {
    const m=t.match(/\bsrc=["']([^"']+)["']/i);
    return m && m[1]===logoUrl;
  });
  if (!tag) return false;
  if (/\bstyle=["'][^"']*(?:filter|mix-blend-mode|opacity)\s*:/i.test(tag)) return false;
  const classMatch=tag.match(/\bclass=["']([^"']+)["']/i);
  const classes=classMatch ? classMatch[1].split(/\s+/).filter(Boolean) : [];
  for (const cls of classes) {
    const safe=cls.replace(/[^a-zA-Z0-9_-]/g,"");
    if (!safe) continue;
    const re=new RegExp("\\."+safe+"(?:[^,{]*)\\{([^}]*)\\}","gi");
    for (const m of String(html || "").matchAll(re)) {
      if (/(?:filter|mix-blend-mode|opacity)\s*:/i.test(m[1])) return false;
    }
  }
  return true;
}

function noLogoIdentitySafe(html, prospect) {
  if (String(prospect?.logo?.status || "").toUpperCase()!=="NO_OFFICIAL_LOGO_CONFIRMED") return true;
  const businessName=String(prospect?.businessName || prospect?.business_name || "").trim();
  if (!businessName || !String(html || "").toLowerCase().includes(businessName.toLowerCase())) return false;
  const suspiciousTag=/<(?:img|svg)\b[^>]*(?:class|id|alt)=["'][^"']*(?:logo|monogram|brand[-_ ]?mark|emblem)[^"']*["'][^>]*>/i.test(html);
  return !suspiciousTag;
}
function hardGate(html, prospect) {
  const issues = [];
  const logoUrl = officialLogoUrl(prospect);
  const lower = html.toLowerCase();

  if (!/<header[\s>]/i.test(html)) issues.push("header_missing");
  if (!/<footer[\s>]/i.test(html)) issues.push("footer_missing");
  if (!/<main[\s>]/i.test(html)) issues.push("main_missing");
  if ((html.match(/<section[\s>]/gi) || []).length < 4) issues.push("body_too_thin");
  if ((html.match(/<h[12][\s>]/gi) || []).length < 3) issues.push("hierarchy_too_thin");
  if (!/@media/i.test(html)) issues.push("mobile_pass_missing");
  if (!/viewport/i.test(html)) issues.push("viewport_missing");
  if (logoUrl && !officialLogoImmutable(html,prospect)) issues.push("official_logo_not_exact_or_modified");
  if (/lorem ipsum|coming soon|your company/i.test(html)) issues.push("placeholder_copy");
  if (!/mailto:|tel:/i.test(html) && prospect?.verifiedContacts) issues.push("verified_contact_path_missing");
  if (!/<img[\s>]/i.test(html) && !/background-image/i.test(html)) {
    const imageryOptional =
      String(prospect?.logo?.status || "").toUpperCase()==="NO_OFFICIAL_LOGO_CONFIRMED" ||
      creativeAssetMode(prospect)==="ZERO_PHOTO_PREMIUM";
    if (!imageryOptional) issues.push("imagery_missing");
  }
  const unverifiedImages=unverifiedImageUrls(html,prospect);
  if (unverifiedImages.length) issues.push("unverified_image_provenance:" + unverifiedImages.slice(0,4).join("|"));
  const repeatedImages=repeatedImageUrls(html,prospect);
  if (repeatedImages.length) issues.push("repetitive_imagery:" + repeatedImages.slice(0,3).map(x=>x.url+"x"+x.count).join("|"));
  if (!noLogoIdentitySafe(html,prospect)) issues.push("invented_or_missing_no_logo_identity");
  if (/data:image\//i.test(html)) issues.push("unverified_embedded_image");
  if (lower.includes("award-winning") || lower.includes("leader di mercato") || lower.includes("n. 1")) issues.push("unverified_claim_risk");

  return { pass: issues.length === 0, issues, image_provenance:{verified_urls:[...verifiedImageUrls(prospect)],image_urls:[...new Set(htmlImageUrls(html))]} };
}

function directionText(value) {
  if (typeof value==="string") return value.trim();
  if (value && typeof value==="object") return String(value.brief || value.direction || value.text || "").trim();
  return "";
}

function directionTokens(text) {
  return new Set(String(text || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g," ")
    .split(/\s+/)
    .filter(x=>x.length>=5));
}

function jaccard(a,b) {
  const A=directionTokens(a),B=directionTokens(b);
  if(!A.size || !B.size) return 1;
  let inter=0;
  for(const x of A) if(B.has(x)) inter++;
  return inter/(A.size+B.size-inter);
}

function validDirections(parsed) {
  if (!parsed?.A || !parsed?.B || !parsed?.C) return false;
  const values=[directionText(parsed.A),directionText(parsed.B),directionText(parsed.C)];
  if(values.some(v=>v.length<350)) return false;
  if(new Set(values.map(v=>v.toLowerCase())).size!==3) return false;
  return jaccard(values[0],values[1])<0.72 &&
         jaccard(values[0],values[2])<0.72 &&
         jaccard(values[1],values[2])<0.72;
}

function reworkHistory(prospect, key=null) {
  const rows=Array.isArray(prospect?.visualReworkFeedback) ? prospect.visualReworkFeedback : [];
  const selected=key ? rows.filter(x=>String(x.variant||"").toUpperCase()===String(key).toUpperCase()) : rows;
  return selected.map(x=>({
    variant:x.variant,
    issues:Array.isArray(x?.critique?.issues) ? x.critique.issues : [],
    rework_instructions:Array.isArray(x?.critique?.rework_instructions) ? x.critique.rework_instructions : [],
    scores:x?.critique?.scores || {}
  }));
}

function assetInventory(prospect) {
  const first=(prospect?.firstPartyImages || prospect?.first_party_images || []).map(item=>{
    if(typeof item==="string") return {url:item,role:"unclassified_verified_first_party",source_type:"FIRST_PARTY"};
    return item;
  });
  const external=(prospect?.approvedExternalImages || prospect?.approved_external_images || []).map(item=>{
    if(typeof item==="string") return {url:item,role:"approved_external",source_type:"APPROVED_EXTERNAL"};
    return {...item,source_type:item?.source_type || "APPROVED_EXTERNAL"};
  });
  const byUrl=new Map();
  for(const item of [...first,...external]) {
    const url=String(item?.url || item?.src || item?.asset_url || "");
    if(url && !byUrl.has(url)) byUrl.set(url,{...item,url});
  }
  return [...byUrl.values()];
}

function creativeAssetMode(prospect) {
  const explicit=String(prospect?.assetMode || prospect?.asset_mode || "").toUpperCase();
  if (explicit) return explicit;
  const usable=assetInventory(prospect).filter(x=>{
    const role=String(x?.role || x?.vision_role || "").toLowerCase();
    if (role==="identity" || role==="trust" || role.includes("logo") || role.includes("badge")) return false;
    const hero=Number(x?.hero_suitability || 0);
    const body=Number(x?.body_suitability || 0);
    return hero>=6 || body>=6;
  });
  return usable.length ? "VERIFIED_VISUALS" : "ZERO_PHOTO_PREMIUM";
}

function assetPolicyText(prospect) {
  const mode=creativeAssetMode(prospect);
  if(mode==="ZERO_PHOTO_PREMIUM") {
    return [
      "ASSET MODE: ZERO_PHOTO_PREMIUM.",
      "Do NOT propose, mention, commission, fetch or use photography, stock imagery, maps, external icons, icon libraries, public-domain imagery, illustrations from external URLs or any unverified visual asset.",
      "Allowed visual assets are ONLY the exact official logo/name and verified trust assets already present in the inventory.",
      "Build visual richness through typography, spacing, rules, grids, CSS-only geometry, abstract inline SVG authored inside the document, material surfaces, verified data and precise composition."
    ].join(" ");
  }
  return [
    "ASSET MODE: VERIFIED_VISUALS.",
    "Use ONLY exact URLs from the verified asset inventory and only in their verified role. Never supplement with stock, maps, external icons or invented photography."
  ].join(" ");
}

function sanitizeGeneratedHtml(html, prospect) {
  let out=String(html || "");
  const allowed=verifiedImageUrls(prospect);
  const logoUrl=officialLogoUrl(prospect);
  const businessName=String(prospect?.businessName || prospect?.business_name || "").trim();
  const safeName=businessName.replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  out=out.replace(/<img\b[^>]*>/gi,tag=>{
    const srcMatch=tag.match(/\bsrc=["']([^"']+)["']/i);
    const src=canonicalAssetUrl(srcMatch?.[1] || "");
    const signal=tag.toLowerCase();
    const looksLikeIdentity=/logo|brand[-_ ]?mark|emblem/.test(signal);

    if(logoUrl && looksLikeIdentity) {
      return '<img src="'+logoUrl+'" alt="'+safeName+'" class="ix-official-logo" style="display:block;max-width:240px;width:auto;height:auto;filter:none;mix-blend-mode:normal;opacity:1">';
    }
    if(!src || !allowed.has(src)) {
      return '<div class="ix-sanitized-visual" aria-hidden="true"></div>';
    }
    return tag.replace(/\sloading=["'][^"']*["']/i,"");
  });

  out=out.replace(/<source\b[^>]*\bsrcset=["']([^"']+)["'][^>]*>/gi,(tag,srcset)=>{
    const first=canonicalAssetUrl(String(srcset||"").split(",")[0].trim().split(/\s+/)[0]);
    return first && allowed.has(first) ? tag : "";
  });

  out=out.replace(/(?:background|background-image)\s*:\s*([^;{}]*?)url\(\s*["']?(https:\/\/[^"'\)\s]+)["']?\s*\)([^;{}]*)(;?)/gi,(full,before,url,after,semi)=>{
    const canonical=canonicalAssetUrl(url);
    if(allowed.has(canonical)) return full;
    return "background-image:none"+(semi||";");
  });
  out=out.replace(/url\(\s*["']?data:image\/[^\)]*\)/gi,"none");

  if(logoUrl) {
    const escaped=logoUrl.replace(/[.*+?^$()|[\]\\]/g,"\\$&");
    const hasExact=new RegExp('<img\\b[^>]*\\bsrc=["\\\']'+escaped+'["\\\']','i').test(out);
    if(!hasExact) {
      const identity='<img src="'+logoUrl+'" alt="'+safeName+'" class="ix-official-logo" style="display:block;max-width:240px;width:auto;height:auto;filter:none;mix-blend-mode:normal;opacity:1">';
      if(/<header\b[^>]*>/i.test(out)) out=out.replace(/<header\b([^>]*)>/i,'<header$1>'+identity);
      else out=out.replace(/<body\b([^>]*)>/i,'<body$1><header class="ix-recovered-header">'+identity+'</header>');
    }
    out=out.replace(/\.ix-official-logo\s*\{[^}]*\}/gi,"");
  } else if(String(prospect?.logo?.status || "").toUpperCase()==="NO_OFFICIAL_LOGO_CONFIRMED") {
    out=out.replace(/<img\b[^>]*(?:class|id|alt)=["'][^"']*(?:logo|monogram|brand[-_ ]?mark|emblem)[^"']*["'][^>]*>/gi,"");
    if(businessName && !out.toLowerCase().includes(businessName.toLowerCase())) {
      const identity='<div class="ix-verified-name">'+safeName+'</div>';
      if(/<header\b[^>]*>/i.test(out)) out=out.replace(/<header\b([^>]*)>/i,'<header$1>'+identity);
    }
  }

  if(!/<header[\s>]/i.test(out)) {
    const identity=logoUrl
      ? '<img src="'+logoUrl+'" alt="'+safeName+'" class="ix-official-logo" style="display:block;max-width:240px;width:auto;height:auto">'
      : '<div class="ix-verified-name">'+safeName+'</div>';
    out=out.replace(/<body\b([^>]*)>/i,'<body$1><header class="ix-recovered-header">'+identity+'</header>');
  }
  if(!/<footer[\s>]/i.test(out)) {
    out=out.replace(/<\/body>/i,'<footer class="ix-recovered-footer"><span>'+safeName+'</span></footer></body>');
  }
  if(!/<main[\s>]/i.test(out) && /<\/header>/i.test(out) && /<footer\b/i.test(out)) {
    out=out.replace(/<\/header>/i,'</header><main>');
    out=out.replace(/<footer\b/i,'</main><footer');
  }

  const recoveryCss='<style id="ix-v84-recovery">.ix-sanitized-visual{min-height:160px;border:1px solid currentColor;opacity:.14;background:transparent}.ix-official-logo{filter:none!important;mix-blend-mode:normal!important;opacity:1!important}.ix-recovered-header,.ix-recovered-footer{padding:24px}.ix-verified-name{font:inherit;font-weight:700}</style>';
  out=out.replace(/<\/head>/i,recoveryCss+'</head>');
  return out;
}

async function buildCreativeStrategy(env, master, prospect) {
  const prompt=[
    "Create a concise CREATIVE STRATEGY MEMO for one prospect before any visual direction is invented.",
    "The memo must identify the prospect-specific design opportunity, strongest verified visual/brand signals, commercial journey, local/contextual anchors, asset strengths/weaknesses, typography opportunity, materiality opportunity, and explicit anti-patterns.",
    "Do not propose generic sector tropes. Do not invent imagery that is not in the verified asset inventory.",
    "If imagery is weak, explicitly recommend a typography/materiality-led solution rather than imaginary photography.",
    "Any previous visual QA failures are mandatory lessons: state what must never be repeated.",
    "Return plain text only.",
    "",
    "VERIFIED PROSPECT:",JSON.stringify(prospect),
    "VERIFIED ASSET INVENTORY:",JSON.stringify(assetInventory(prospect)),
    "CREATIVE ASSET POLICY:",assetPolicyText(prospect),
    "PREVIOUS QA HISTORY:",JSON.stringify(reworkHistory(prospect)),
    "SET-LEVEL QA HISTORY:",JSON.stringify(prospect?.visualSetFeedback || null),
    "PRE-RENDER GENERATION FAILURE:",JSON.stringify({
      count:Number(prospect?.generationFailureCount || 0),
      last_error:prospect?.generationFailureFeedback || null
    }),
    "FROZEN MASTER:",master
  ].join("\n");
  const out=await runModel(env,ART_MODEL,[
    {role:"system",content:"You are the creative strategy director for a flagship identity-led website studio. Ground every recommendation in verified evidence."},
    {role:"user",content:prompt}
  ],1800,0.34);
  const text=aiText(out).trim();
  if(text.length<400) throw new Error("CREATIVE_STRATEGY_MEMO_REQUIRED");
  return text;
}

function parseCandidateDirections(value) {
  const candidates=Array.isArray(value?.candidates) ? value.candidates : [];
  const normalized=candidates.map((x,i)=>({
    name:String(x?.name || ("Direction "+(i+1))).trim(),
    brief:String(x?.brief || x?.direction || "").trim()
  })).filter(x=>x.brief.length>=300);
  return normalized.length>=5 ? normalized.slice(0,8) : null;
}

async function generateDirectionCandidates(env, master, prospect, strategy, priorIssues=[]) {
  const prompt=[
    "Generate SIX bespoke, genuinely different flagship homepage art directions for this one prospect.",
    "These are a creative pool, not A/B/C templates. Derive each from a DIFFERENT strong verified signal in the prospect.",
    "Each candidate must differ materially in hero logic, composition/grid, typographic behavior, visual/material language, signature device, section rhythm, mobile reinterpretation and CTA integration.",
    "No fixed identity/evidence/information archetypes. No generic sector clichés.",
    "Only rely on imagery that exists in VERIFIED ASSET INVENTORY. Never describe hypothetical photos, premises, people, projects or scenes as if available.",
    "If assets are weak, use typography, geometry, color/material fields, verified text/data and local cues rather than fake imagery.",
    "Do not name proprietary/unavailable typefaces. Use implementable open-web/system typography or describe typographic behavior.",
    "Previous QA failures must not be repeated.",
    "Return ONLY JSON: {\"candidates\":[{\"name\":\"...\",\"brief\":\"...\"}, ... six items]}.",
    "",
    "CREATIVE STRATEGY:",strategy,
    "PRIOR DIRECTION-SET ISSUES:",JSON.stringify(priorIssues),
    "VERIFIED PROSPECT:",JSON.stringify(prospect),
    "VERIFIED ASSET INVENTORY:",JSON.stringify(assetInventory(prospect)),
    "CREATIVE ASSET POLICY:",assetPolicyText(prospect),
    "PREVIOUS QA HISTORY:",JSON.stringify(reworkHistory(prospect)),
    "FROZEN MASTER:",master
  ].join("\n");
  const out=await runModel(env,ART_MODEL,[
    {role:"system",content:"You are a world-class art director producing six non-template creative routes from verified evidence. Output strict JSON only."},
    {role:"user",content:prompt}
  ],5200,0.58);
  const parsed=extractJson(aiText(out));
  const candidates=parseCandidateDirections(parsed);
  if(!candidates) throw new Error("SIX_BESPOKE_DIRECTION_CANDIDATES_REQUIRED");
  return candidates;
}

async function curateDirections(env, master, prospect, strategy, candidates) {
  const prompt=[
    "Select the THREE strongest directions from the six candidates and refine them into final A/B/C briefs.",
    "Selection objective: maximum prospect fit + flagship quality + maximum mutual difference + actual implementation feasibility with the verified assets.",
    "There is NO preferred A/B/C archetype. Do not force one identity-led, one image-led and one information-led route.",
    "Reject candidates that depend on nonexistent imagery, unavailable proprietary fonts, invented proof or sector clichés.",
    "Each final brief must explicitly define: core idea, evidence anchor, hero, composition/grid, typography behavior, asset plan using exact verified URLs where relevant, signature device, section progression, CTA, desktop behavior, mobile reinterpretation, and what makes it impossible to reuse for 50 other businesses.",
    "Return ONLY strict JSON {\"A\":\"...\",\"B\":\"...\",\"C\":\"...\"}.",
    "",
    "CREATIVE STRATEGY:",strategy,
    "CANDIDATES:",JSON.stringify(candidates),
    "VERIFIED PROSPECT:",JSON.stringify(prospect),
    "VERIFIED ASSET INVENTORY:",JSON.stringify(assetInventory(prospect)),
    "CREATIVE ASSET POLICY:",assetPolicyText(prospect),
    "FROZEN MASTER:",master
  ].join("\n");
  const out=await runModel(env,ART_MODEL,[
    {role:"system",content:"You are the creative director selecting three portfolio-grade routes. Output strict JSON only."},
    {role:"user",content:prompt}
  ],5000,0.28);
  const parsed=extractJson(aiText(out));
  if(!validDirections(parsed)) throw new Error("CURATED_DIRECTION_SET_NOT_DISTINCT_ENOUGH");
  return {A:directionText(parsed.A),B:directionText(parsed.B),C:directionText(parsed.C)};
}

async function directionSetGate(env, prospect, directions) {
  const prompt=[
    "Audit this set of THREE proposed art directions BEFORE HTML generation.",
    "PASS only if all three are at least 8/10 for prospect specificity and implementation feasibility, and every pair is at least 8/10 for meaningful visual/structural diversity.",
    "Hard fail if the three routes are merely cosmetic variations, depend on unavailable imagery, name unavailable proprietary fonts, repeat previous QA failures, or could be reused for generic businesses.",
    "Return ONLY JSON with: pass(boolean), specificity_A/B/C(number 0-10), feasibility_A/B/C(number 0-10), diversity_AB/AC/BC(number 0-10), issues(array of strings).",
    "",
    "PROSPECT:",JSON.stringify(prospect),
    "ASSETS:",JSON.stringify(assetInventory(prospect)),
    "CREATIVE ASSET POLICY:",assetPolicyText(prospect),
    "PREVIOUS QA:",JSON.stringify(reworkHistory(prospect)),
    "DIRECTIONS:",JSON.stringify(directions)
  ].join("\n");
  const out=await runModel(env,ART_MODEL,[
    {role:"system",content:"You are an independent creative-review board. Be strict and output JSON only."},
    {role:"user",content:prompt}
  ],1600,0.08);
  const x=extractJson(aiText(out)) || {};
  const nums=["specificity_A","specificity_B","specificity_C","feasibility_A","feasibility_B","feasibility_C","diversity_AB","diversity_AC","diversity_BC"];
  const numeric=nums.every(k=>Number.isFinite(Number(x[k])));
  const min=numeric ? Math.min(...nums.map(k=>Number(x[k]))) : 0;
  return {pass:x.pass===true && numeric && min>=8,issues:Array.isArray(x.issues)?x.issues:[],scores:Object.fromEntries(nums.map(k=>[k,Number(x[k]||0)]))};
}

async function deriveIndependentDirection(env, master, prospect, key, previous=[]) {
  const prompt=[
    "Create ONE flagship art-direction brief for this prospect.",
    "Variant label: "+key+". The label has no archetype.",
    "Choose the strongest prospect-specific creative anchor that is NOT already used by the previous directions.",
    "Only use available verified assets; never depend on imagined photography. Avoid unavailable proprietary fonts.",
    "Incorporate previous visual-QA lessons and fix them explicitly.",
    "Specify core idea, evidence anchor, hero, grid/composition, typography behavior, exact asset plan, materiality, signature device, section sequence, CTA, desktop and deliberate mobile behavior.",
    "Return plain text only, at least 500 characters.",
    "PREVIOUS DIRECTIONS TO DIFFER FROM:",JSON.stringify(previous),
    "PROSPECT:",JSON.stringify(prospect),
    "ASSETS:",JSON.stringify(assetInventory(prospect)),
    "CREATIVE ASSET POLICY:",assetPolicyText(prospect),
    "QA HISTORY:",JSON.stringify(reworkHistory(prospect)),
    "FROZEN MASTER:",master
  ].join("\n");
  const out=await runModel(env,ART_MODEL,[
    {role:"system",content:"You are a senior art director. Produce a unique prospect-specific route, not a sector template."},
    {role:"user",content:prompt}
  ],2200,0.52);
  const text=aiText(out).trim();
  if(text.length<500) throw new Error("PROSPECT_SPECIFIC_ART_DIRECTION_REQUIRED");
  return text;
}

async function deriveDirections(env, master, prospect) {
  const strategy=await buildCreativeStrategy(env,master,prospect);
  let priorIssues=[];
  for(let round=1;round<=2;round++) {
    try {
      const candidates=await generateDirectionCandidates(env,master,prospect,strategy,priorIssues);
      const directions=await curateDirections(env,master,prospect,strategy,candidates);
      const gate=await directionSetGate(env,prospect,directions);
      if(gate.pass) return {directions,strategy,direction_set_gate:gate};
      priorIssues=[...(gate.issues||[]),"Direction-set scores: "+JSON.stringify(gate.scores)];
    } catch(error) {
      priorIssues=[String(error?.message || error)];
    }
  }

  const A=await deriveIndependentDirection(env,master,prospect,"A",[]);
  const B=await deriveIndependentDirection(env,master,prospect,"B",[A]);
  const C=await deriveIndependentDirection(env,master,prospect,"C",[A,B]);
  const independent={A,B,C};
  if(!validDirections(independent)) throw new Error("PROSPECT_SPECIFIC_ART_DIRECTION_REQUIRED");
  const gate=await directionSetGate(env,prospect,independent);
  if(!gate.pass) throw new Error("DIRECTION_SET_QUALITY_GATE_FAILED:"+gate.issues.join("|"));
  return {directions:independent,strategy,direction_set_gate:gate};
}

function buildVariantPrompt(master, prospect, key, direction, repairIssues, previousHtml) {
  const variantHistory=reworkHistory(prospect,key);
  const setHistory=prospect?.visualSetFeedback || null;
  const parts=[
    "Build ONE complete premium homepage implementation reference for ImpresaX Rendering Studio.",
    "Variant: "+key,
    "FINAL APPROVED ART DIRECTION BRIEF:",
    direction,
    "",
    "FROZEN MASTER:",master,
    "",
    "VERIFIED PROSPECT DATA:",JSON.stringify(prospect),
    "",
    "VERIFIED VISUAL ASSET INVENTORY:",JSON.stringify(assetInventory(prospect)),
    "CREATIVE ASSET MODE:",creativeAssetMode(prospect),
    "CREATIVE ASSET POLICY:",assetPolicyText(prospect),
    "",
    "MANDATORY REWORK HISTORY FOR THIS VARIANT:",JSON.stringify(variantHistory),
    "MANDATORY SET-LEVEL REWORK HISTORY:",JSON.stringify(setHistory),
    "MANDATORY PRE-RENDER FAILURE HISTORY:",JSON.stringify({
      count:Number(prospect?.generationFailureCount || 0),
      last_error:prospect?.generationFailureFeedback || null
    }),
    "",
    "NON-NEGOTIABLE OUTPUT:",
    "- Return ONLY one complete standalone HTML document, starting with <!doctype html> and ending with </html>.",
    "- Embedded CSS only. NO JavaScript. NO iframe/object/embed.",
    "- Full desktop art direction for 1440px and deliberate mobile art direction for 390px.",
    "- Complete header/navigation, distinctive hero, at least four meaningful body sections, verified offering, verified trust/evidence where available, conversion/contact section and footer.",
    "- Follow THIS direction closely. Do not silently replace its signature idea with an easier generic layout.",
    "- Use ONLY verified facts in the supplied prospect data. Do not invent staff, projects, awards, branches, clients, metrics, capabilities or service subcategories.",
    "- If an official logo URL is supplied and marked verified, use that exact URL in <img>; never redraw, recolor, filter, restyle, spell or approximate the logo.",
    "- Use image URLs ONLY when they appear exactly in VERIFIED VISUAL ASSET INVENTORY (or approved_external_images). Never invent a same-domain path.",
    "- Respect each asset's role/alt/context. Do not turn a partner badge, logo, icon or unrelated image into hero imagery.",
    "- Do not repeat the same non-logo image across multiple major sections when the inventory contains alternatives.",
    "- If verified imagery is insufficient, solve the page with typography, verified logo/name, material/color fields, geometry, rules, negative space and verified data. Never fake company staff, premises, projects, facilities, products or scenes.",
    "- Use implementable open-web/system typography. Do not depend on proprietary fonts that are not actually loaded.",
    "- Typography and composition must do most of the design work. Avoid generic cards, gradients, glows, glassmorphism, blobs, dashboards, cheap icons/emoji and SaaS tropes.",
    "- CTA language must match the verified business and contacts.",
    "- If verified contact data exists, include at least one clickable tel: and/or mailto: link using ONLY the verified phone/email values.",
    "- Include responsive @media rules that materially redesign mobile hierarchy, crop/asset behavior, CTA placement, spacing, density and scroll rhythm.",
    "- Do not expose internal research language such as 'verified', 'according to the site', 'source', 'prospect', 'data unavailable' or implementation notes in customer-facing copy.",
    "- Every prior QA issue listed above is a mandatory regression test. Do not repeat it.",
    "- Quality is more important than brevity."
  ];

  if(repairIssues?.length && previousHtml) {
    parts.push(
      "",
      "LOCAL REPAIR PASS — current draft failed:",
      repairIssues.join(" | "),
      "Repair these failures while preserving the approved art direction and all previously successful aspects.",
      "PREVIOUS HTML:",previousHtml
    );
  }
  return parts.join("\n");
}

function visibleCopy(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<svg[\s\S]*?<\/svg>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/\s+/g," ")
    .trim()
    .slice(0,18000);
}

async function semanticContentGate(env, prospect, key, html) {
  const prompt=[
    "Audit the CUSTOMER-VISIBLE COPY of this generated homepage against the VERIFIED PROSPECT DATA.",
    "Hard fail any invented service, sub-service, project, client, partner, certification, metric, employee, location, capability, testimonial or claim.",
    "Hard fail internal/meta research wording, language inconsistency, misleading presentation of representative imagery/premises, or CTA/contact paths unsupported by verified data.",
    "Also fail if the copy is generic enough to fit another business or fails to communicate the prospect's real offer clearly.",
    "Return ONLY JSON: {\"pass\":boolean,\"issues\":[\"...\"],\"rework_instructions\":[\"...\"]}.",
    "VARIANT:",key,
    "VERIFIED PROSPECT:",JSON.stringify(prospect),
    "VISIBLE COPY:",visibleCopy(html)
  ].join("\n");
  const out=await runModel(env,ART_MODEL,[
    {role:"system",content:"You are a factual editorial QA reviewer. Be strict. Output JSON only."},
    {role:"user",content:prompt}
  ],1400,0.05);
  const x=extractJson(aiText(out)) || {};
  const issues=Array.isArray(x.issues)?x.issues.map(String).slice(0,12):[];
  const instructions=Array.isArray(x.rework_instructions)?x.rework_instructions.map(String).slice(0,12):[];
  return {pass:x.pass===true && issues.length===0,issues,instructions};
}

async function generateOne(env, master, prospect, key, direction) {
  let lastError = null;
  let previousHtml = null;
  let repairIssues = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const retryNote = attempt > 1
        ? [
            "",
            "STRICT RETRY " + attempt + ": the prior model response was unusable.",
            "Failure: " + (lastError?.message || repairIssues.join(", ") || "invalid HTML output"),
            "Return exactly one complete HTML document. No markdown, no commentary, no truncation."
          ].join("\n")
        : "";

      const generationModel = HTML_MODEL;
      const result = await runModel(env, generationModel, [
        {
          role: "system",
          content: attempt === 1
            ? "You are a senior frontend implementation specialist. Implement the already-approved art direction exactly. Output production-grade standalone HTML only."
            : "You are repairing a failed homepage implementation without changing its approved art direction. Output one complete standalone HTML document only."
        },
        {
          role: "user",
          content: buildVariantPrompt(
            master,
            prospect,
            key,
            direction,
            previousHtml ? repairIssues : null,
            previousHtml
          ) + retryNote
        }
      ], 14000, attempt === 1 ? 0.22 : 0.14);

      const extractedHtml = extractHtml(aiText(result));
      const html = sanitizeGeneratedHtml(extractedHtml, prospect);
      const gate = hardGate(html, prospect);
      if (!gate.pass) {
        previousHtml=html;
        repairIssues=gate.issues;
        lastError=new Error("QUALITY_GATE_"+gate.issues.join("_"));
        continue;
      }

      const semantic=await semanticContentGate(env,prospect,key,html);
      if (semantic.pass) return { key, html, direction, gate:{...gate,semantic_content:semantic} };

      previousHtml=html;
      repairIssues=[
        ...semantic.issues.map(x=>"CONTENT_TRUTH:"+x),
        ...semantic.instructions.map(x=>"CONTENT_REWORK:"+x)
      ];
      lastError=new Error("SEMANTIC_CONTENT_GATE_FAILED");
    } catch (error) {
      lastError = error;
      if (!previousHtml) repairIssues = [String(error?.message || error)];
    }
  }

  throw lastError || new Error("VARIANT_" + key + "_GENERATION_FAILED");
}
async function loadMaster() {
  const r = await fetch(MASTER_URL, { headers: { "Cache-Control": "no-cache" } });
  if (!r.ok) throw new Error("FROZEN_MASTER_FETCH_" + r.status);
  const text = await r.text();
  if (!text || text.length < 1000 || !text.includes("RENDERING STUDIO V1") || !text.includes("STATUS: FROZEN")) {
    throw new Error("FROZEN_MASTER_INVALID");
  }
  return text;
}
export async function generateRenderVariants(env, prospect) {
  const master = await loadMaster();
  const plan = await deriveDirections(env, master, prospect);
  const directions=plan.directions;

  const variants = await Promise.all([
    generateOne(env, master, prospect, "A", directions.A),
    generateOne(env, master, prospect, "B", directions.B),
    generateOne(env, master, prospect, "C", directions.C)
  ]);

  return {
    master: "RENDERING_STUDIO_V1_FROZEN",
    creative_quality_revision: "V8.4_ZERO_PHOTO_DETERMINISTIC_REPAIR",
    asset_mode: creativeAssetMode(prospect),
    master_commit: "9578da3fa1b173283bf5c748b0e7d89497537e76",
    model: ART_MODEL,
    repair_model: HTML_MODEL,
    creative_strategy:plan.strategy,
    direction_set_gate:plan.direction_set_gate,
    variants
  };
}
