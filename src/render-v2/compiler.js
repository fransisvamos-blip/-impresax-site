import { COMPILER_VERSION } from "./constants.js";
import { esc, stableStringify, sha256 } from "./utils.js";

const FORBIDDEN_TAGS=/<\s*(script|style|iframe|object|embed|form|base|meta|link)\b/i;
const FORBIDDEN_URL=/\b(?:src|srcset|href|poster|action|formaction)\s*=\s*["']?\s*(?:https?:|javascript:|data:|\/\/)/i;
const FORBIDDEN_CSS_NETWORK=/@import|@font-face|expression\s*\(|javascript:|url\s*\(/i;
const FORBIDDEN_CSS_CONTENT=/(?:^|[;{]\s*)content\s*:/im;
const INLINE_STYLE=/\sstyle\s*=/i;
const EVENT_HANDLER=/\son[a-z]+\s*=/i;
const COPY_TOKEN=/\{\{copy:([A-Z0-9_]+)\}\}/g;
const ASSET_TOKEN=/\{\{asset:([A-Z0-9_]+)\}\}/g;
const CTA_TOKEN=/\{\{cta:([A-Z0-9_]+)\}\}/g;

function normalizeMainFragment(value) {
  let main=String(value||"").trim();
  const wrapped=main.match(/^<main(?:\s[^>]*)?>([\s\S]*)<\/main>$/i);
  if(wrapped) main=wrapped[1].trim();
  return main;
}

function unsafeTextAttributes(html) {
  const issues=[];
  const re=/\b(?:alt|title|aria-label)\s*=\s*["']([^"']*)["']/gi;
  for(const m of String(html||"").matchAll(re)) {
    const value=String(m[1]||"").trim();
    if(!value) continue;
    if(/^\{\{copy:[A-Z0-9_]+\}\}$/.test(value)) continue;
    issues.push(value.slice(0,80));
  }
  return issues;
}

function visibleLiteralText(html) {
  let x=String(html||"")
    .replace(/<!--[\s\S]*?-->/g," ")
    .replace(/<style\b[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/\{\{(?:copy|asset|cta):[A-Z0-9_]+\}\}/g," ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g," ")
    .replace(/\s+/g," ").trim();
  return x;
}

function tokenSet(source,re) {
  const out=[];
  for(const m of String(source||"").matchAll(re)) out.push(m[1]);
  return [...new Set(out)];
}

export function validateRenderSpec(spec, manifests) {
  const issues=[];
  if(!spec || typeof spec!=="object") issues.push("RENDER_SPEC_OBJECT_REQUIRED");
  const main=normalizeMainFragment(spec?.main_html);
  const css=String(spec?.custom_css||"");
  if(main.length<1200) issues.push("MAIN_HTML_TOO_THIN");
  if(css.length<1000) issues.push("CUSTOM_CSS_TOO_THIN");
  if(FORBIDDEN_TAGS.test(main)) issues.push("FORBIDDEN_TAG");
  if(FORBIDDEN_URL.test(main)) issues.push("ARBITRARY_URL_FORBIDDEN");
  if(FORBIDDEN_CSS_NETWORK.test(css)||FORBIDDEN_CSS_CONTENT.test(css)) issues.push("UNSAFE_CSS_URL_IMPORT_OR_CONTENT");
  if(INLINE_STYLE.test(main)) issues.push("INLINE_STYLE_FORBIDDEN");
  if(EVENT_HANDLER.test(main)) issues.push("EVENT_HANDLER_FORBIDDEN");
  if(/<svg\b/i.test(main)) issues.push("INLINE_SVG_NOT_ALLOWED_V2_0");
  if(/<main\b/i.test(main)) issues.push("NESTED_MAIN_FORBIDDEN");
  const sectionCount=(main.match(/<section\b/gi)||[]).length;
  if(sectionCount<6) issues.push("SECTION_DEPTH_REQUIRED:"+sectionCount);
  if(!/@media/i.test(css)) issues.push("MOBILE_RULES_REQUIRED");

  const literal=visibleLiteralText(main);
  if(literal) issues.push("UNAUTHORIZED_LITERAL_COPY:"+literal.slice(0,120));
  const textAttrs=unsafeTextAttributes(main);
  if(textAttrs.length) issues.push("UNAUTHORIZED_TEXT_ATTRIBUTE:"+textAttrs.join("|").slice(0,120));

  const copyKeys=new Set(Object.keys(manifests?.copy||{}));
  const assetKeys=new Set(Object.keys(manifests?.assets||{}));
  const ctaKeys=new Set(Object.keys(manifests?.cta||{}));

  for(const key of tokenSet(main,COPY_TOKEN)) if(!copyKeys.has(key)) issues.push("UNKNOWN_COPY_TOKEN:"+key);
  for(const key of tokenSet(main,ASSET_TOKEN)) if(!assetKeys.has(key)) issues.push("UNKNOWN_ASSET_TOKEN:"+key);
  const ctaUsed=tokenSet(main,CTA_TOKEN);
  for(const key of ctaUsed) if(!ctaKeys.has(key)) issues.push("UNKNOWN_CTA_TOKEN:"+key);
  if(!ctaUsed.length) issues.push("VERIFIED_CONTACT_PATH_REQUIRED");

  return {pass:issues.length===0,issues};
}

function replaceAllTokens(source,re,map,kind) {
  return String(source||"").replace(re,(_,key)=>{
    if(!(key in map)) throw new Error("UNRESOLVED_"+kind+"_TOKEN:"+key);
    return esc(map[key]);
  });
}

export async function compileRenderSpec(spec,{businessName,logoToken,copyManifest,assetManifest,ctaManifest}) {
  const manifests={copy:copyManifest,assets:assetManifest,cta:ctaManifest};
  const gate=validateRenderSpec(spec,manifests);
  if(!gate.pass) return {ok:false,issues:gate.issues};

  let main=normalizeMainFragment(spec.main_html);
  main=replaceAllTokens(main,COPY_TOKEN,copyManifest,"COPY");
  main=replaceAllTokens(main,ASSET_TOKEN,assetManifest,"ASSET");
  main=replaceAllTokens(main,CTA_TOKEN,ctaManifest,"CTA");

  const logo=logoToken ? '<img class="ix-v2-logo" data-official-logo src="'+esc(logoToken)+'" alt="'+esc(businessName)+'">' : '<strong class="ix-v2-wordmark">'+esc(businessName)+'</strong>';
  const primaryHref=esc(ctaManifest.PRIMARY||"#");
  const primaryLabel=esc(copyManifest.PRIMARY_CTA_LABEL||"Contatti");
  const headerContact='<a class="ix-v2-header-cta" data-verified-contact href="'+primaryHref+'">'+primaryLabel+'</a>';
  const baseCss=[
    "*{box-sizing:border-box}",
    "html,body{margin:0;padding:0}",
    "body{overflow-x:hidden}",
    "img{max-width:100%;height:auto;display:block}",
    ".ix-v2-header,.ix-v2-footer{padding:20px clamp(20px,5vw,72px)}",
    ".ix-v2-header{display:flex;align-items:center;justify-content:space-between;gap:20px}",
    ".ix-v2-logo{max-width:min(220px,52vw);max-height:76px;object-fit:contain}",
    ".ix-v2-header-cta{display:inline-flex;align-items:center;min-height:44px;text-decoration:none;color:inherit;border-bottom:1px solid currentColor}",
    ".ix-v2-footer{min-height:96px}",
    "@media(max-width:700px){.ix-v2-header,.ix-v2-footer{padding:16px 20px}}"
  ].join("");

  const csp="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
  const html='<!doctype html><html lang="it"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+esc(csp)+'"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>'+esc(businessName)+' · ImpresaX Preview</title><style>'+baseCss+String(spec.custom_css)+'</style></head><body><header class="ix-v2-header">'+logo+headerContact+'</header><main>'+main+'</main><footer class="ix-v2-footer"><span>'+esc(businessName)+'</span></footer></body></html>';
  const sourceHash=await sha256(html);
  return {ok:true,html,source_hash:sourceHash,compiler_version:COMPILER_VERSION,render_spec_hash:await sha256(stableStringify(spec))};
}

export function buildCaptureHtml(compiledHtml,materializedAssets) {
  let html=String(compiledHtml||"");
  for(const [token,dataUrl] of Object.entries(materializedAssets||{})) {
    html=html.split(esc("asset://"+token)).join(dataUrl);
    html=html.split(esc("identity://"+token)).join(dataUrl);
  }
  return html;
}
