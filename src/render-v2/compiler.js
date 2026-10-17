import { COMPILER_VERSION, MIN_SECTION_VISUALS } from "./constants.js";
import { copyPolicyViolations, flatStrongSectionBackgroundViolations, surfaceContractViolations } from "./showroom-policy.js";
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
  const sectionIds=[...main.matchAll(/<section\b[^>]*\bid\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]);
  for(const requiredId of ["hero","positioning","services","trust","bridge","final-cta"]) {
    if(!sectionIds.includes(requiredId)) issues.push("PREMIUM_SECTION_REQUIRED:"+requiredId);
  }
  if(!/@media/i.test(css)) issues.push("MOBILE_RULES_REQUIRED");
  for(const selector of [".ix-v2-header",".ix-v2-nav",".ix-v2-footer"]) {
    if(!css.includes(selector)) issues.push("SHELL_ART_DIRECTION_REQUIRED:"+selector);
  }

  const literal=visibleLiteralText(main);
  if(literal) issues.push("UNAUTHORIZED_LITERAL_COPY:"+literal.slice(0,120));
  const textAttrs=unsafeTextAttributes(main);
  if(textAttrs.length) issues.push("UNAUTHORIZED_TEXT_ATTRIBUTE:"+textAttrs.join("|").slice(0,120));

  const copyKeys=new Set(Object.keys(manifests?.copy||{}));
  const assetKeys=new Set(Object.keys(manifests?.assets||{}));
  const ctaKeys=new Set(Object.keys(manifests?.cta||{}));
  const identityKeys=new Set(Object.keys(manifests?.identity||{}));
  const usedCopyKeys=tokenSet(main,COPY_TOKEN);
  const usedAssetKeys=tokenSet(main,ASSET_TOKEN);
  for(const issue of copyPolicyViolations(manifests?.copy||{},usedCopyKeys)) issues.push(issue);
  for(const issue of surfaceContractViolations(main)) issues.push(issue);
  for(const issue of flatStrongSectionBackgroundViolations(main,css)) issues.push(issue);

  const availableSectionAssets=[...assetKeys].filter(key=>key!=="HERO_VISUAL");
  const usedSectionAssets=usedAssetKeys.filter(key=>key!=="HERO_VISUAL");
  const requiredSectionAssets=availableSectionAssets.length>=MIN_SECTION_VISUALS ? MIN_SECTION_VISUALS : 0;
  if(requiredSectionAssets>0 && usedSectionAssets.length<requiredSectionAssets) {
    issues.push("SECTION_VISUAL_DENSITY_REQUIRED:"+usedSectionAssets.length+"/"+requiredSectionAssets);
  }

  const heroStart=main.search(/<section\b[^>]*\bid\s*=\s*["']hero["'][^>]*>/i);
  if(heroStart<0) {
    issues.push("HERO_SECTION_REQUIRED");
  } else {
    const heroEnd=main.indexOf("</section>",heroStart);
    const heroHtml=main.slice(heroStart,heroEnd>=0?heroEnd+10:Math.min(main.length,heroStart+6000));
    if(!assetKeys.has("HERO_VISUAL")) {
      issues.push("HERO_VISUAL_ASSET_REQUIRED");
    } else {
      const heroToken=/\{\{asset:HERO_VISUAL\}\}/g;
      const tokenCountInHero=(heroHtml.match(heroToken)||[]).length;
      if(tokenCountInHero!==1) issues.push("HERO_VISUAL_EXACTLY_ONCE_IN_HERO:"+tokenCountInHero);
      if(!/<img\b[^>]*\bsrc\s*=\s*["']\{\{asset:HERO_VISUAL\}\}["'][^>]*>/i.test(heroHtml)) {
        issues.push("HERO_VISUAL_REAL_IMG_REQUIRED");
      }
      if(!/<h1\b[^>]*>[\s\S]*?\{\{copy:HERO_HEADLINE\}\}[\s\S]*?<\/h1>/i.test(heroHtml)) {
        issues.push("HERO_H1_HEADLINE_REQUIRED");
      }
      if(!heroHtml.includes("{{copy:HERO_BODY}}")) issues.push("HERO_BODY_REQUIRED");
      if(!heroHtml.includes("{{cta:PRIMARY}}")) issues.push("HERO_PRIMARY_CTA_REQUIRED");
      if(!heroHtml.includes("{{cta:SECONDARY}}")) issues.push("HERO_SECONDARY_CTA_REQUIRED");
    }
  }

  const sectionHtml=id=>{
    const re=new RegExp('<section\\b[^>]*\\bid\\s*=\\s*["\\\']'+id+'["\\\'][^>]*>[\\s\\S]*?<\\/section>','i');
    return (main.match(re)||[])[0]||"";
  };
  if(requiredSectionAssets>=MIN_SECTION_VISUALS) {
    const sectionsUsingVisuals=sectionIds
      .filter(id=>id!=="hero")
      .filter(id=>{
        const html=sectionHtml(id);
        return usedSectionAssets.some(token=>html.includes("{{asset:"+token+"}}"));
      });
    if(new Set(sectionsUsingVisuals).size<MIN_SECTION_VISUALS) {
      issues.push("SECTION_VISUAL_DISTRIBUTION_REQUIRED:"+new Set(sectionsUsingVisuals).size+"/"+MIN_SECTION_VISUALS);
    }
  }
  const positioningHtml=sectionHtml("positioning");
  if(positioningHtml && (!positioningHtml.includes("{{copy:POSITIONING_TITLE}}") || !positioningHtml.includes("{{copy:POSITIONING_BODY}}"))) {
    issues.push("POSITIONING_COPY_REQUIRED");
  }
  const servicesHtml=sectionHtml("services");
  if(servicesHtml && (!servicesHtml.includes("{{copy:SERVICES_TITLE}}") || !servicesHtml.includes("{{copy:SERVICES_INTRO}}"))) {
    issues.push("SERVICES_EDITORIAL_HEADER_REQUIRED");
  }
  const trustHtml=sectionHtml("trust");
  if(trustHtml && (!trustHtml.includes("{{copy:TRUST_TITLE}}") || !trustHtml.includes("{{copy:TRUST_INTRO}}"))) {
    issues.push("TRUST_EDITORIAL_HEADER_REQUIRED");
  }
  const closingHtml=sectionHtml("final-cta");
  if(closingHtml && (!closingHtml.includes("{{copy:CLOSING_TITLE}}") || !closingHtml.includes("{{copy:CLOSING_BODY}}") || !closingHtml.includes("{{cta:PRIMARY}}"))) {
    issues.push("FINAL_CTA_CONTRACT_REQUIRED");
  }

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
  const headerNav='<nav class="ix-v2-nav" aria-label="Navigazione principale">'
    +'<a href="#services">Servizi</a>'
    +'<a href="#trust">Perché noi</a>'
    +'<a href="#final-cta">Contatti</a>'
    +'</nav>';
  const headerContact='<a class="ix-v2-header-cta" data-verified-contact href="'+primaryHref+'">'+primaryLabel+'</a>';
  const header='<header class="ix-v2-header"><div class="ix-v2-header-inner"><a class="ix-v2-brand" href="#hero">'+logo+'</a>'+headerNav+headerContact+'</div></header>';
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
  const footerTagline=String(copyManifest.FOOTER_LINE||"").trim()
    ? '<p class="ix-v2-footer-tagline">'+esc(copyManifest.FOOTER_LINE)+'</p>'
    : '';
  const footerNav='<nav class="ix-v2-footer-nav" aria-label="Navigazione footer">'
    +'<a href="#hero">Home</a>'
    +'<a href="#services">Servizi</a>'
    +'<a href="#trust">Perché noi</a>'
    +'<a href="#final-cta">Contatti</a>'
    +'</nav>';
  const footer='<footer class="ix-v2-footer"><div class="ix-v2-footer-grid">'
    +'<div class="ix-v2-footer-brand">'+footerIdentity+footerTagline+'</div>'
    +footerNav
    +'<div class="ix-v2-footer-contact-block">'+footerAddress+'<span class="ix-v2-footer-contacts">'+footerContacts+'</span></div>'
    +'</div></footer>';
  const baseCss=[
    "*{box-sizing:border-box}",
    "html{scroll-behavior:smooth}",
    "html,body{margin:0;padding:0}",
    "body{overflow-x:hidden;background:#fff;color:#111}",
    "img{max-width:100%;height:auto;display:block}",
    "main a{color:inherit;text-decoration:none}",
    ".ix-v2-identity-main{width:min(420px,72vw);max-height:180px;object-fit:contain}",
    ".ix-v2-header{position:relative;z-index:20;background:rgba(255,255,255,.96);color:#111;border-bottom:1px solid rgba(17,17,17,.1)}",
    ".ix-v2-header-inner{width:min(1440px,calc(100% - clamp(40px,8vw,120px)));margin:0 auto;min-height:96px;display:grid;grid-template-columns:minmax(180px,1fr) auto auto;align-items:center;gap:clamp(24px,4vw,64px)}",
    ".ix-v2-brand{display:inline-flex;align-items:center;width:max-content;max-width:100%;text-decoration:none;color:inherit}",
    ".ix-v2-logo{width:auto;max-width:min(250px,42vw);max-height:68px;object-fit:contain}",
    ".ix-v2-wordmark{font:700 clamp(18px,2vw,28px)/1.05 Arial,Helvetica,sans-serif;letter-spacing:-.03em}",
    ".ix-v2-nav{display:flex;align-items:center;gap:clamp(18px,2.6vw,38px)}",
    ".ix-v2-nav a,.ix-v2-footer-nav a{color:inherit;text-decoration:none;font:600 13px/1.2 Arial,Helvetica,sans-serif;letter-spacing:.02em}",
    ".ix-v2-header-cta{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:0 22px;border:1px solid currentColor;text-decoration:none;color:inherit;font:700 13px/1 Arial,Helvetica,sans-serif;letter-spacing:.02em}",
    ".ix-v2-footer{background:#111;color:#f7f6f2;padding:clamp(64px,8vw,110px) clamp(24px,6vw,90px)}",
    ".ix-v2-footer-grid{width:min(1320px,100%);margin:0 auto;display:grid;grid-template-columns:minmax(260px,1.25fr) minmax(150px,.55fr) minmax(260px,.9fr);gap:clamp(36px,6vw,96px);align-items:start}",
    ".ix-v2-footer-brand{display:grid;gap:22px}.ix-v2-footer-identity{display:flex;align-items:center;min-height:58px}",
    ".ix-v2-footer-logo{max-width:min(260px,48vw);max-height:72px;object-fit:contain;filter:none}",
    ".ix-v2-footer-wordmark{font:700 28px/1 Arial,Helvetica,sans-serif}",
    ".ix-v2-footer-tagline{margin:0;max-width:42ch;color:rgba(247,246,242,.7);font:400 15px/1.55 Arial,Helvetica,sans-serif}",
    ".ix-v2-footer-nav{display:grid;gap:16px}.ix-v2-footer-nav a{color:rgba(247,246,242,.82)}",
    ".ix-v2-footer-contact-block{display:grid;gap:18px}.ix-v2-footer-contacts{display:grid;gap:12px}",
    ".ix-v2-footer-address{max-width:38ch;color:rgba(247,246,242,.68);font:400 13px/1.45 Arial,Helvetica,sans-serif;overflow-wrap:anywhere}",
    ".ix-v2-footer-contact{color:#f7f6f2;text-decoration:none;font:600 13px/1.4 Arial,Helvetica,sans-serif;overflow-wrap:anywhere}",
    "@media(max-width:820px){.ix-v2-header-inner{width:min(calc(100% - 32px),1440px);min-height:84px;grid-template-columns:1fr auto;gap:14px}.ix-v2-nav{grid-column:1/-1;grid-row:2;overflow-x:auto;gap:22px;padding:0 0 14px;white-space:nowrap}.ix-v2-header-cta{grid-column:2;grid-row:1;min-height:40px;padding:0 14px}.ix-v2-logo{max-width:170px;max-height:54px}.ix-v2-footer{padding:56px 20px}.ix-v2-footer-grid{grid-template-columns:1fr;gap:34px}.ix-v2-footer-nav{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 20px}}"
  ].join("");

  const csp="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
  const html='<!doctype html><html lang="it"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+esc(csp)+'"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>'+esc(businessName)+' · ImpresaX Preview</title><style>'+baseCss+String(spec.custom_css)+'</style></head><body>'+header+'<main>'+main+'</main>'+footer+'</body></html>';
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
