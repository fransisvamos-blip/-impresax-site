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
const IDENTITY_TOKEN=/\{\{identity:([A-Z0-9_]+)\}\}/g;

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

function canonicalizeKnownBareCopyTokens(html,copyManifest) {
  const copyKeys=new Set(Object.keys(copyManifest||{}));
  return String(html||"").replace(/\{\{([A-Z0-9_]+)\}\}/g,(full,key)=>
    copyKeys.has(key) ? "{{copy:"+key+"}}" : full
  );
}

function normalizeIdentityImagePlacement(html) {
  return String(html||"")
    .replace(/<img\b[^>]*\bsrc\s*=\s*["']\s*\{\{identity:PRIMARY_LOGO\}\}\s*["'][^>]*>/gi,"{{identity:PRIMARY_LOGO}}")
    .replace(/<source\b[^>]*\bsrc(?:set)?\s*=\s*["']\s*\{\{identity:PRIMARY_LOGO\}\}\s*["'][^>]*>/gi,"{{identity:PRIMARY_LOGO}}");
}

function removeCompilerOwnedIdentityFromMain(html) {
  return String(html||"")
    .replace(/<img\b[^>]*\{\{asset:PRIMARY_LOGO\}\}[^>]*>/gi,"")
    .replace(/<source\b[^>]*\{\{asset:PRIMARY_LOGO\}\}[^>]*>/gi,"");
}

function neutralizeUnsafeTextAttributes(html) {
  return String(html||"").replace(/\b(alt|title|aria-label)\s*=\s*(["'])(.*?)\2/gi,(full,name,quote,value)=>{
    const v=String(value||"").trim();
    if(!v || /^\{\{copy:[A-Z0-9_]+\}\}$/.test(v)) return full;
    return name+"="+quote+quote;
  });
}

function keepOnlyCanonicalTokensInTextNode(text) {
  const source=String(text||"");
  const tokens=source.match(/\{\{(?:copy|asset|cta|identity):[A-Z0-9_]+\}\}/g)||[];
  if(tokens.length) return " "+tokens.join(" ")+" ";
  return source.replace(/\S/g,"");
}

function stripUnauthorizedLiteralTextNodes(html) {
  return String(html||"").split(/(<[^>]+>)/g).map(part=>
    part.startsWith("<") ? part : keepOnlyCanonicalTokensInTextNode(part)
  ).join("");
}

function stripCssContentProperty(css) {
  return String(css||"").replace(/(^|[;{]\s*)content\s*:[^;}]*;?/gim,"$1");
}

export function normalizeRenderSpecForCompile(spec,manifests={}) {
  const source=(spec&&typeof spec==="object")?spec:{};
  const normalizations=[];
  let main=normalizeMainFragment(source.main_html);
  const beforeBare=main;
  main=canonicalizeKnownBareCopyTokens(main,manifests.copy||{});
  if(main!==beforeBare) normalizations.push("CANONICALIZED_BARE_COPY_TOKENS");

  const beforeIdentityPlacement=main;
  main=normalizeIdentityImagePlacement(main);
  if(main!==beforeIdentityPlacement) normalizations.push("NORMALIZED_IDENTITY_IMAGE_PLACEMENT");

  const beforeLogo=main;
  main=removeCompilerOwnedIdentityFromMain(main);
  if(main!==beforeLogo) normalizations.push("REMOVED_COMPILER_OWNED_PRIMARY_LOGO");

  const beforeAttrs=main;
  main=neutralizeUnsafeTextAttributes(main);
  if(main!==beforeAttrs) normalizations.push("NEUTRALIZED_UNVERIFIED_TEXT_ATTRIBUTES");

  const beforeText=main;
  main=stripUnauthorizedLiteralTextNodes(main);
  if(main!==beforeText) normalizations.push("STRIPPED_UNVERIFIED_LITERAL_TEXT");

  let css=String(source.custom_css||"");
  const beforeCss=css;
  css=stripCssContentProperty(css);
  if(css!==beforeCss) normalizations.push("STRIPPED_CSS_CONTENT_PROPERTY");

  const sectionIds=[...main.matchAll(/<section\b[^>]*\bid\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]);
  const normalized={
    ...source,
    main_html:main,
    custom_css:css,
    section_ids:sectionIds.length?sectionIds:(Array.isArray(source.section_ids)?source.section_ids:[]),
    used_copy_tokens:tokenSet(main,COPY_TOKEN),
    used_asset_tokens:tokenSet(main,ASSET_TOKEN)
  };
  return {spec:normalized,normalizations};
}

function visibleLiteralText(html) {
  let x=String(html||"")
    .replace(/<!--[\s\S]*?-->/g," ")
    .replace(/<style\b[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/\{\{(?:copy|asset|cta|identity):[A-Z0-9_]+\}\}/g," ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g," ")
    .replace(/\s+/g," ").trim();
  return x;
}

function tokenSet(source,re) {
  const out=[];
  for(const m of String(source||"").matchAll(re)) out.push(m[1]);
  return [...new Set(out)];
}

function tokenCount(source,re) {
  let n=0;
  for(const _ of String(source||"").matchAll(re)) n++;
  return n;
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
  const identityKeys=new Set(Object.keys(manifests?.identity||{}));

  for(const key of tokenSet(main,COPY_TOKEN)) if(!copyKeys.has(key)) issues.push("UNKNOWN_COPY_TOKEN:"+key);
  for(const key of tokenSet(main,ASSET_TOKEN)) if(!assetKeys.has(key)) issues.push("UNKNOWN_ASSET_TOKEN:"+key);
  for(const key of tokenSet(main,IDENTITY_TOKEN)) if(!identityKeys.has(key)) issues.push("UNKNOWN_IDENTITY_TOKEN:"+key);
  if(tokenCount(main,IDENTITY_TOKEN)>1) issues.push("IDENTITY_TOKEN_MAX_ONE");
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

function displayContactHref(href) {
  const v=String(href||"");
  if(v.startsWith("tel:")) return v.slice(4);
  if(v.startsWith("mailto:")) return v.slice(7);
  return v;
}

export async function compileRenderSpec(spec,{businessName,logoToken,copyManifest,assetManifest,ctaManifest}) {
  const identityManifest=logoToken?{PRIMARY_LOGO:logoToken}:{};
  const manifests={copy:copyManifest,assets:assetManifest,cta:ctaManifest,identity:identityManifest};
  const normalized=normalizeRenderSpecForCompile(spec,manifests);
  const normalizedSpec=normalized.spec;
  const gate=validateRenderSpec(normalizedSpec,manifests);
  if(!gate.pass) return {ok:false,issues:gate.issues,normalizations:normalized.normalizations,normalized_spec:normalizedSpec};

  let main=normalizeMainFragment(normalizedSpec.main_html);
  main=replaceAllTokens(main,COPY_TOKEN,copyManifest,"COPY");
  main=replaceAllTokens(main,ASSET_TOKEN,assetManifest,"ASSET");
  main=replaceAllTokens(main,CTA_TOKEN,ctaManifest,"CTA");
  main=String(main).replace(IDENTITY_TOKEN,(_,key)=>{
    if(key!=="PRIMARY_LOGO" || !logoToken) throw new Error("UNRESOLVED_IDENTITY_TOKEN:"+key);
    return '<img class="ix-v2-identity-main" data-official-logo-main src="'+esc(logoToken)+'" alt="'+esc(businessName)+'">';
  });

  const logo=logoToken ? '<img class="ix-v2-logo" data-official-logo src="'+esc(logoToken)+'" alt="'+esc(businessName)+'">' : '<strong class="ix-v2-wordmark">'+esc(businessName)+'</strong>';
  const footerIdentity=logoToken
    ? '<span class="ix-v2-footer-identity"><img class="ix-v2-footer-logo" data-official-logo-footer src="'+esc(logoToken)+'" alt="'+esc(businessName)+'"></span>'
    : '<strong class="ix-v2-footer-wordmark">'+esc(businessName)+'</strong>';
  const primaryHref=esc(ctaManifest.PRIMARY||"#");
  const primaryLabel=esc(copyManifest.PRIMARY_CTA_LABEL||"Contatti");
  const headerContact='<a class="ix-v2-header-cta" data-verified-contact href="'+primaryHref+'">'+primaryLabel+'</a>';
  const footerPairs=[
    [ctaManifest.PRIMARY,ctaManifest.PRIMARY_DISPLAY||displayContactHref(ctaManifest.PRIMARY)],
    [ctaManifest.SECONDARY,ctaManifest.SECONDARY_DISPLAY||displayContactHref(ctaManifest.SECONDARY)]
  ].filter(([href],i,a)=>href&&a.findIndex(([x])=>x===href)===i);
  const footerContacts=footerPairs
    .map(([href,label])=>'<a class="ix-v2-footer-contact" data-verified-contact href="'+esc(href)+'">'+esc(label)+'</a>')
    .join('');
  const footerAddress=String(ctaManifest.ADDRESS||"").trim()
    ? '<span class="ix-v2-footer-address" data-verified-address>'+esc(ctaManifest.ADDRESS)+'</span>'
    : '';
  const baseCss=[
    "*{box-sizing:border-box}",
    "html,body{margin:0;padding:0}",
    "body{overflow-x:hidden}",
    "img{max-width:100%;height:auto;display:block}",
    "main a{color:inherit;text-decoration:none}",
    ".ix-v2-identity-main{width:min(420px,72vw);max-height:180px;object-fit:contain}",
    ".ix-v2-header,.ix-v2-footer{padding:24px clamp(20px,5vw,72px)}",
    ".ix-v2-header{display:flex;align-items:center;justify-content:space-between;gap:24px;background:#fff;color:#111;border-bottom:1px solid rgba(17,17,17,.14);min-height:118px}",
    ".ix-v2-logo{width:auto;max-width:min(320px,58vw);max-height:96px;object-fit:contain}",
    ".ix-v2-header-cta{display:inline-flex;align-items:center;min-height:44px;text-decoration:none;color:inherit;border-bottom:1px solid currentColor}",
    ".ix-v2-footer{min-height:96px;display:flex;align-items:flex-end;justify-content:space-between;gap:28px;flex-wrap:wrap;border-top:1px solid rgba(17,17,17,.14)}",
    ".ix-v2-footer-identity{display:flex;align-items:center;min-height:56px}",
    ".ix-v2-footer-logo{max-width:min(260px,48vw);max-height:72px;object-fit:contain}",
    ".ix-v2-footer-contacts{display:flex;flex-wrap:wrap;gap:14px 22px;align-items:center}",
    ".ix-v2-footer-address{max-width:48ch;line-height:1.35;overflow-wrap:anywhere}",
    ".ix-v2-footer-contact{color:inherit;text-decoration:none;border-bottom:1px solid currentColor;padding-bottom:2px;overflow-wrap:anywhere;word-break:break-word}",
    "@media(max-width:700px){.ix-v2-header,.ix-v2-footer{padding:14px 20px}.ix-v2-header{gap:12px;min-height:86px}.ix-v2-logo{max-width:180px;max-height:60px}.ix-v2-header-cta{font-size:11px;line-height:1.1;white-space:nowrap;min-height:38px}.ix-v2-footer{align-items:flex-start;flex-direction:column}.ix-v2-footer-contacts{flex-direction:column;align-items:flex-start;gap:10px;width:100%}.ix-v2-footer-contact{max-width:100%}}"
  ].join("");

  const csp="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
  const html='<!doctype html><html lang="it"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+esc(csp)+'"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>'+esc(businessName)+' · ImpresaX Preview</title><style>'+baseCss+String(spec.custom_css)+'</style></head><body><header class="ix-v2-header">'+logo+headerContact+'</header><main>'+main+'</main><footer class="ix-v2-footer">'+footerIdentity+'<span class="ix-v2-footer-contacts">'+footerAddress+footerContacts+'</span></footer></body></html>';
  const sourceHash=await sha256(html);
  return {ok:true,html,source_hash:sourceHash,compiler_version:COMPILER_VERSION,render_spec_hash:await sha256(stableStringify(normalizedSpec)),normalized_spec:normalizedSpec,normalizations:normalized.normalizations};
}

export function buildCaptureHtml(compiledHtml,materializedAssets) {
  let html=String(compiledHtml||"");
  for(const [token,dataUrl] of Object.entries(materializedAssets||{})) {
    html=html.split(esc("asset://"+token)).join(dataUrl);
    html=html.split(esc("identity://"+token)).join(dataUrl);
  }
  return html;
}
