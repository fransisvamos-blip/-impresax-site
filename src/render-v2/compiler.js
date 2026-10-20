import { COMPILER_VERSION, MIN_SECTION_VISUALS } from "./constants.js";
import { copyPolicyViolations, flatStrongSectionBackgroundViolations, surfaceContractViolations, brandRichSurfaceViolations, watermarkVisibilityViolations, launchGradeViolations, typographyCompositionViolations, fifteenKValueViolations, iconicCommissionedViolations, r107UltraVisualViolations, homeDepthViolations, sectionSubstanceViolations } from "./showroom-policy.js";
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
  const brandRichPolicy=/^IMPRESAX_RENDER_STANDARD_R(?:89|90|93|94|106|107)_/.test(String(spec?.surface_policy||""));
  const launchGradePolicy=/^IMPRESAX_RENDER_STANDARD_R(?:90|93|94|106|107)_/.test(String(spec?.surface_policy||""));
  const typographyPolicy=/^IMPRESAX_RENDER_STANDARD_R(?:93|94|106|107)_/.test(String(spec?.surface_policy||""));
  const fifteenKPolicy=/^IMPRESAX_RENDER_STANDARD_R(?:94|106|107)_/.test(String(spec?.surface_policy||""));
  const iconicCommissionedPolicy=/^IMPRESAX_RENDER_STANDARD_R(?:106|107)_/.test(String(spec?.surface_policy||""));
  const r107UltraVisualPolicy=String(spec?.surface_policy||"").startsWith("IMPRESAX_RENDER_STANDARD_R107_");
  if(brandRichPolicy) {
    const brandSurfaceCount=(main.match(/\bdata-brand-surface=["'](?:primary|secondary|dark|tint)["']/gi)||[]).length;
    if(brandSurfaceCount<2) issues.push("BRAND_RICH_SURFACES_REQUIRED:"+brandSurfaceCount+"/2");
    for(const issue of brandRichSurfaceViolations(main,css,2)) issues.push(issue);
    if(identityKeys.has("PRIMARY_LOGO")) {
      const watermarkCount=(main.match(/\bdata-brand-watermark\b/gi)||[]).length;
      if(watermarkCount<1 || !main.includes("{{identity:PRIMARY_LOGO}}")) issues.push("OFFICIAL_LOGO_WATERMARK_REQUIRED");
      else for(const issue of watermarkVisibilityViolations(main,css)) issues.push(issue);
    }
  }
  if(launchGradePolicy) {
    for(const issue of launchGradeViolations(main,2)) issues.push(issue);
  }
  if(typographyPolicy) {
    for(const issue of typographyCompositionViolations(main,css)) issues.push(issue);
  }
  if(fifteenKPolicy) {
    for(const issue of fifteenKValueViolations(main,css)) issues.push(issue);
  }
  if(iconicCommissionedPolicy) {
    for(const issue of iconicCommissionedViolations(main,css)) issues.push(issue);
  }
  if(r107UltraVisualPolicy) {
    for(const issue of r107UltraVisualViolations(main,css)) issues.push(issue);
  }

  if(String(spec?.home_depth_standard||"")==="R111_15K_HOME_DEPTH_ARCHITECTURE_V1") {
    for(const issue of homeDepthViolations(main,spec)) issues.push(issue);
    const blueprint=Array.isArray(spec?.section_blueprint)?spec.section_blueprint:[];
    if(JSON.stringify(blueprint)!==JSON.stringify(sectionIds)) {
      issues.push("R111_BLUEPRINT_SECTION_ORDER_MISMATCH");
    }
  }

  if(String(spec?.section_substance_standard||"")==="R112_SECTION_SUBSTANCE_COMMERCIAL_DEPTH_V1") {
    for(const issue of sectionSubstanceViolations(main,spec)) issues.push(issue);
  }

  const availableSectionAssets=[...assetKeys].filter(key=>key!=="HERO_VISUAL");
  const usedSectionAssets=usedAssetKeys.filter(key=>key!=="HERO_VISUAL");
  const strictSectionCoherence=String(spec?.section_coherence_standard||"")==="R108_SECTION_COHERENCE_STRICT_V1";
  const requiredSectionAssets=strictSectionCoherence
    ? (availableSectionAssets.length>0 ? 1 : 0)
    : (availableSectionAssets.length>=MIN_SECTION_VISUALS ? MIN_SECTION_VISUALS : 0);
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
  if(requiredSectionAssets>0) {
    const sectionsUsingVisuals=sectionIds
      .filter(id=>id!=="hero")
      .filter(id=>{
        const html=sectionHtml(id);
        return usedSectionAssets.some(token=>html.includes("{{asset:"+token+"}}"));
      });
    if(new Set(sectionsUsingVisuals).size<requiredSectionAssets) {
      issues.push("SECTION_VISUAL_DISTRIBUTION_REQUIRED:"+new Set(sectionsUsingVisuals).size+"/"+requiredSectionAssets);
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

  const detailCraftStandard=String(spec?.detail_craft_standard||"");
  if(["R113_DETAIL_CRAFTSMANSHIP_V1","R115_PREMIUM_SECTION_IDENTITY_FINISHING_V1","R116_FLAGSHIP_PREMIUM_ARCHITECTURE_V1"].includes(detailCraftStandard)) {
    const servicesDetailHtml=sectionHtml("services");
    if(servicesDetailHtml && !/data-detail-grid=["']aligned["']/i.test(servicesDetailHtml)) {
      issues.push("R113_SERVICE_DETAIL_GRID_ALIGNMENT_REQUIRED");
    }
    const serviceRows=(servicesDetailHtml.match(/data-service-index-rail=["']locked["']/gi)||[]).length;
    if(servicesDetailHtml && serviceRows<2) issues.push("R113_SERVICE_INDEX_RAIL_REQUIRED:"+serviceRows+"/2");

    const feature1=sectionHtml("service-feature-1");
    const feature2=sectionHtml("service-feature-2");
    if(assetKeys.has("SERVICE_MATERIALS_VISUAL") && (!feature1 || !feature1.includes("{{asset:SERVICE_MATERIALS_VISUAL}}"))) {
      issues.push("R113_FEATURE_1_CONTEXT_IMAGE_REQUIRED");
    }
    if(assetKeys.has("SERVICE_REBAR_VISUAL") && (!feature2 || !feature2.includes("{{asset:SERVICE_REBAR_VISUAL}}"))) {
      issues.push("R113_FEATURE_2_CONTEXT_IMAGE_REQUIRED");
    }

    if(assetKeys.has("TRUST_VISUAL")) {
      const trustDetailHtml=sectionHtml("trust");
      if(!trustDetailHtml.includes("{{asset:TRUST_VISUAL}}")) issues.push("R113_TRUST_BACKGROUND_IMAGE_REQUIRED");
      if(!/data-trust-background=["']image["']/i.test(trustDetailHtml)) issues.push("R113_TRUST_BACKGROUND_MARKER_REQUIRED");
    }

    const verifiedPartnerKeys=Object.keys(manifests?.copy||{}).filter(key=>/^PARTNER_\d+$/.test(key));
    if(verifiedPartnerKeys.length===1) {
      const partnerDetailHtml=sectionHtml("partners");
      const demoSlots=(partnerDetailHtml.match(/data-demo-partner-slot=["']true["']/gi)||[]).length;
      if(demoSlots<3) issues.push("R113_PARTNER_DEMO_CAPACITY_REQUIRED:"+demoSlots+"/3");
    }

    if(!/\.ixg-service__indexrail\s*\{[\s\S]*font-variant-numeric|\.ixg-service__index\s*\{[\s\S]*font-variant-numeric/i.test(css)) {
      issues.push("R113_TABULAR_SERVICE_INDEX_CSS_REQUIRED");
    }
    if(assetKeys.has("TRUST_VISUAL") && !/\.ixg-trust-bg\s*\{[\s\S]*position\s*:\s*absolute/i.test(css)) {
      issues.push("R113_TRUST_BACKGROUND_CSS_REQUIRED");
    }
  }

  if(["R115_PREMIUM_SECTION_IDENTITY_FINISHING_V1","R116_FLAGSHIP_PREMIUM_ARCHITECTURE_V1"].includes(detailCraftStandard)) {
    const r115Services=sectionHtml("services");
    const r115Feature1=sectionHtml("service-feature-1");
    const r115Feature2=sectionHtml("service-feature-2");
    const r115Trust=sectionHtml("trust");
    const r115Partners=sectionHtml("partners");
    const r115Bridge=sectionHtml("bridge");
    const r115Final=sectionHtml("final-cta");

    if(!/data-service-composition=["']paired-editorial-with-media["']/i.test(r115Services)) {
      issues.push("R115_PAIRED_SERVICE_COMPOSITION_REQUIRED");
    }
    const matchedCards=(r115Services.match(/data-service-card=["']matched["']/gi)||[]).length;
    if(matchedCards<2) issues.push("R115_MATCHED_SERVICE_CARDS_REQUIRED:"+matchedCards+"/2");

    if(!/data-feature-layout=["']cinematic-materials["']/i.test(r115Feature1)) {
      issues.push("R115_FEATURE_1_DISTINCT_LAYOUT_REQUIRED");
    }
    if(!/data-feature-layout=["']technical-rebar["']/i.test(r115Feature2)) {
      issues.push("R115_FEATURE_2_DISTINCT_LAYOUT_REQUIRED");
    }
    if(r115Feature1.includes("{{copy:LOCALITY_LINE}}") || r115Feature2.includes("{{copy:LOCALITY_LINE}}")) {
      issues.push("R115_SERVICE_FEATURE_LOCALITY_FILLER_FORBIDDEN");
    }
    if(copyKeys.has("SERVICE_1_TAG") && !r115Feature1.includes("{{copy:SERVICE_1_TAG}}")) {
      issues.push("R115_FEATURE_1_SERVICE_TAG_REQUIRED");
    }
    if(copyKeys.has("SERVICE_2_TAG") && !r115Feature2.includes("{{copy:SERVICE_2_TAG}}")) {
      issues.push("R115_FEATURE_2_SERVICE_TAG_REQUIRED");
    }

    if(!/data-trust-finish=["']premium-editorial["']/i.test(r115Trust)) {
      issues.push("R115_PREMIUM_TRUST_FINISH_REQUIRED");
    }
    const verifiedPartnerKeys=Object.keys(manifests?.copy||{}).filter(key=>/^PARTNER_\d+$/.test(key));
    if(verifiedPartnerKeys.length===1 && !/data-partner-facsimile=["']concept-capacity["']/i.test(r115Partners)) {
      issues.push("R115_PARTNER_FACSIMILE_CAPACITY_REQUIRED");
    }

    if(!/data-cta-premium=["']true["']/i.test(r115Bridge) || !/data-cta-premium=["']true["']/i.test(r115Final)) {
      issues.push("R115_PREMIUM_CTA_SCENES_REQUIRED");
    }
    if((main.match(/data-premium-button=["']true["']/gi)||[]).length<3) {
      issues.push("R115_PREMIUM_BUTTON_SYSTEM_REQUIRED");
    }

    if(!/\.ix-v2-header-inner\s*\{[\s\S]*box-shadow/i.test(css)) {
      issues.push("R115_PREMIUM_HEADER_SHELL_REQUIRED");
    }
    if(!/\.ix-v2-footer-grid\s*\{[\s\S]*border-top/i.test(css)) {
      issues.push("R115_PREMIUM_FOOTER_COMPOSITION_REQUIRED");
    }
    if(!/\.ixg-services__composition\s*\{[\s\S]*grid-template-columns/i.test(css)) {
      issues.push("R115_SERVICE_MEDIA_GRID_REQUIRED");
    }
  }

  if(String(spec?.flagship_architecture_standard||"")==="R116_FLAGSHIP_PREMIUM_ARCHITECTURE_V1") {
    const flagshipHero=sectionHtml("hero");
    const flagshipPositioning=sectionHtml("positioning");
    const flagshipServices=sectionHtml("services");
    const flagshipFeature1=sectionHtml("service-feature-1");
    const flagshipFeature2=sectionHtml("service-feature-2");
    const flagshipTrust=sectionHtml("trust");
    const flagshipPartners=sectionHtml("partners");
    const flagshipBridge=sectionHtml("bridge");
    const flagshipFinal=sectionHtml("final-cta");

    if(!/data-r116-flagship=["']true["']/i.test(flagshipHero)) issues.push("R116_FLAGSHIP_HERO_REQUIRED");
    const availableHeroMeta=Object.keys(manifests?.copy||{}).filter(key=>/^HERO_META_[123]$/.test(key)).length;
    const requiredHeroMeta=Math.min(3,availableHeroMeta);
    const heroMetaCount=(flagshipHero.match(/ixf-hero__meta-item/g)||[]).length;
    if(requiredHeroMeta>0 && heroMetaCount<requiredHeroMeta) issues.push("R116_HERO_META_RAIL_REQUIRED:"+heroMetaCount+"/"+requiredHeroMeta);
    if(!/ixf-hero__signature/i.test(flagshipHero)) issues.push("R116_HERO_SIGNATURE_SYSTEM_REQUIRED");

    const setPieces=(main.match(/data-r116-set-piece=["'][^"']+["']/gi)||[]).length;
    if(setPieces<8) issues.push("R116_FLAGSHIP_SET_PIECES_REQUIRED:"+setPieces+"/8");

    const availablePositionProof=Object.keys(manifests?.copy||{}).filter(key=>/^POSITIONING_PROOF_[123]$/.test(key)).length;
    const requiredPositionProof=Math.min(3,availablePositionProof);
    const positioningProof=(flagshipPositioning.match(/ixf-positioning__proof/g)||[]).length;
    if(requiredPositionProof>0 && positioningProof<requiredPositionProof) issues.push("R116_POSITIONING_PROOF_RAIL_REQUIRED:"+positioningProof+"/"+requiredPositionProof);

    const matchedServices=(flagshipServices.match(/data-service-card=["']matched["']/gi)||[]).length;
    if(matchedServices<2) issues.push("R116_MATCHED_SERVICE_EDITORIAL_SYSTEM_REQUIRED:"+matchedServices+"/2");

    if(!/data-r116-set-piece=["']cinematic-materials["']/i.test(flagshipFeature1)) issues.push("R116_MATERIALS_SET_PIECE_REQUIRED");
    if(!/data-r116-set-piece=["']technical-rebar["']/i.test(flagshipFeature2)) issues.push("R116_REBAR_SET_PIECE_REQUIRED");
    if(flagshipFeature1.includes("{{copy:LOCALITY_LINE}}") || flagshipFeature2.includes("{{copy:LOCALITY_LINE}}")) {
      issues.push("R116_CONTEXTLESS_LOCALITY_FILLER_FORBIDDEN");
    }

    if(!/data-r116-set-piece=["']trust["']/i.test(flagshipTrust)) issues.push("R116_TRUST_PROOF_ARCHITECTURE_REQUIRED");
    if(flagshipPartners && !/data-r116-set-piece=["']partners["']/i.test(flagshipPartners)) issues.push("R116_PARTNER_ECOSYSTEM_REQUIRED");
    if(!/data-r116-set-piece=["']bridge["']/i.test(flagshipBridge)) issues.push("R116_BRIDGE_BRAND_OBJECT_REQUIRED");
    if(!/data-r116-set-piece=["']final-cta["']/i.test(flagshipFinal)) issues.push("R116_FINAL_CLIMAX_REQUIRED");

    if((main.match(/data-premium-button=["']true["']/gi)||[]).length<3) issues.push("R116_BRAND_OBJECT_BUTTON_SYSTEM_REQUIRED");

    const cssChecks=[
      ["R116_CINEMATIC_HERO_CSS_REQUIRED",/\.ixf-hero__inner\s*\{/i],
      ["R116_POSITIONING_ASYMMETRY_CSS_REQUIRED",/\.ixf-positioning__grid\s*\{/i],
      ["R116_SERVICES_EDITORIAL_CSS_REQUIRED",/\.ixf-services\s+\.ixg-services__composition\s*\{/i],
      ["R116_FEATURE_ONE_IDENTITY_CSS_REQUIRED",/\.ixg-feature--one\s+\.ixf-feature__grid\s*\{/i],
      ["R116_FEATURE_TWO_IDENTITY_CSS_REQUIRED",/\.ixg-feature--two\s+\.ixf-feature__grid\s*\{/i],
      ["R116_TRUST_ARCHITECTURE_CSS_REQUIRED",/\.ixg-trust-section\s+\.ixg-section-head\s*\{/i],
      ["R116_PARTNER_MUSEUM_CSS_REQUIRED",/\.ixg-partner-proof__grid\s*\{/i],
      ["R116_PREMIUM_FOOTER_CSS_REQUIRED",/\.ix-v2-footer-grid\s*\{/i]
    ];
    for(const [code,re] of cssChecks) if(!re.test(css)) issues.push(code);

    if(!/min-height\s*:\s*clamp\(820px,92svh,1120px\)/i.test(css)) issues.push("R116_HERO_SCALE_SHIFT_REQUIRED");
    if(!/font-size\s*:\s*clamp\(74px,8\.8vw,142px\)/i.test(css)) issues.push("R116_FINAL_CTA_SCALE_SHIFT_REQUIRED");
  }

  if(String(spec?.section_first_standard||spec?.section_architecture_standard||"")==="R110_SECTION_FIRST_PREMIUM_ARCHITECTURE_V1") {
    const blueprint=Array.isArray(spec?.section_blueprint)?spec.section_blueprint:[];
    if(blueprint.length<5) issues.push("R110_SECTION_BLUEPRINT_REQUIRED");
    const ids=Array.isArray(spec?.section_ids)?spec.section_ids:[];
    if(JSON.stringify(blueprint)!==JSON.stringify(ids)) issues.push("R110_BLUEPRINT_SECTION_ORDER_MISMATCH");
    for(const id of blueprint.filter(x=>!["hero"].includes(x))) {
      const html=sectionHtml(id);
      if(html && !/data-section-plan=["']approved["']/i.test(html)) issues.push("R110_UNPLANNED_SECTION:"+id);
    }
    const trustBlock=sectionHtml("trust");
    const reasons=(trustBlock.match(/data-trust-reason=/gi)||[]).length;
    const graphics=(trustBlock.match(/ixg-trust-reason__graphic/g)||[]).length;
    if(trustBlock && reasons<3) issues.push("R110_WHY_US_MIN_THREE_REASONS");
    if(trustBlock && graphics<reasons) issues.push("R110_WHY_US_GRAPHIC_SUPPORT_REQUIRED");
    if(trustBlock && !/ixg-trust-reason\s+p/i.test(spec?.custom_css||"")) issues.push("R110_WHY_US_SUPPORT_COPY_REQUIRED");
    const partnerBlock=sectionHtml("partners");
    const hasUPowerPartner=Object.entries(manifests?.copy||{}).some(([key,value])=>/^PARTNER_\d+$/.test(key) && /u[-\s]?power/i.test(String(value||"")));
    if(hasUPowerPartner && (!partnerBlock || !/ixg-partner-logo/i.test(partnerBlock))) {
      issues.push("R110_UPOWER_OFFICIAL_LOGO_REQUIRED");
    }
  }

  if(String(spec?.art_direction_standard||"")==="R109_15K_ART_DIRECTION_GATE_V1") {
    if(!/\bid=["']services["'][^>]*\bdata-uniform-service-rows=["']true["']/i.test(main)) {
      issues.push("R109_UNIFORM_SERVICE_ROWS_REQUIRED");
    }
    if(!/\bid=["']services["'][^>]*\bdata-image-placement=["']anchored["']/i.test(main)) {
      issues.push("R109_ANCHORED_SERVICE_MEDIA_REQUIRED");
    }
    if(!/\bid=["']trust["'][^>]*\bdata-trust-reasons=["']true["']/i.test(main)) {
      issues.push("R109_TRUST_REASONS_REQUIRED");
    }
    const trustBlock=sectionHtml("trust");
    if(/data-partner-proof=["']true["']/i.test(trustBlock)) {
      issues.push("R109_PARTNER_PROOF_MUST_BE_SEPARATE");
    }
    for(const id of ["services","trust","bridge","final-cta"]) {
      const html=sectionHtml(id);
      if(html && !/data-section-grid=["']locked["']/i.test(html)) issues.push("R109_LOCKED_SECTION_GRID_REQUIRED:"+id);
    }
    if(trustBlock && (trustBlock.match(/data-trust-reason=/gi)||[]).length<2) {
      issues.push("R109_TRUST_SECTION_TOO_THIN");
    }
    const hasPartnerCopy=/\{\{copy:PARTNER_\d+\}\}/.test(main);
    const partnerBlock=sectionHtml("partners");
    if(hasPartnerCopy && !partnerBlock) issues.push("R109_PARTNER_SECTION_REQUIRED");
    if(/\{\{copy:PARTNER_\d+\}\}/.test(trustBlock)) issues.push("R109_PARTNER_COPY_FORBIDDEN_IN_TRUST");
    if(partnerBlock && !/data-partner-proof=["']true["']/i.test(partnerBlock)) issues.push("R109_PARTNER_SECTION_CONTRACT_REQUIRED");
    if(closingHtml && !/data-contrast-safe=["']true["']/i.test(closingHtml)) {
      issues.push("R109_FINAL_CTA_CONTRAST_MARKER_REQUIRED");
    }
    if(!/\.ixg-services__composition\s*\{[\s\S]*grid-template-columns/i.test(css)) {
      issues.push("R109_SERVICES_COMPOSITION_GRID_REQUIRED");
    }
    if(!/\.ixg-trust-reasons\s*\{[\s\S]*grid-template-columns/i.test(css)) {
      issues.push("R109_TRUST_REASON_GRID_REQUIRED");
    }
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
    ":root{--ix-display-font:Bahnschrift,'Arial Narrow','Roboto Condensed','Inter Tight','Aptos Display','Segoe UI Variable Display',sans-serif;--ix-body-font:Inter,Aptos,'Segoe UI Variable Text','Helvetica Neue',sans-serif}",
    "body{overflow-x:hidden;background:#fff;color:#111;font-family:var(--ix-body-font)}",
    "img{max-width:100%;height:auto;display:block}",
    "main a{color:inherit;text-decoration:none}",
    ".ix-v2-identity-main{width:min(420px,72vw);max-height:180px;object-fit:contain}",
    ".ix-v2-header{position:relative;z-index:20;background:rgba(255,255,255,.94);color:#111;border-bottom:1px solid rgba(17,17,17,.10);backdrop-filter:blur(18px);box-shadow:0 10px 40px rgba(17,17,17,.035)}",
    ".ix-v2-header-inner{width:min(1440px,calc(100% - clamp(36px,7vw,112px)));margin:0 auto;min-height:90px;display:grid;grid-template-columns:minmax(190px,1fr) auto auto;align-items:center;gap:clamp(24px,3.6vw,58px)}",
    ".ix-v2-brand{display:inline-flex;align-items:center;width:max-content;max-width:100%;min-width:0;text-decoration:none;color:inherit}",
    ".ix-v2-logo{width:auto;max-width:min(245px,42vw);max-height:64px;object-fit:contain}",
    ".ix-v2-wordmark{display:block;min-width:0;max-width:100%;font:760 clamp(18px,2vw,28px)/1 var(--ix-display-font);letter-spacing:-.035em;overflow-wrap:anywhere;word-break:normal}",
    ".ix-v2-nav{display:flex;align-items:center;gap:clamp(20px,2.4vw,36px)}",
    ".ix-v2-nav a,.ix-v2-footer-nav a{color:inherit;text-decoration:none;font:650 12px/1.2 var(--ix-body-font);letter-spacing:.075em;text-transform:uppercase}",
    ".ix-v2-nav a{padding:12px 0;background-image:linear-gradient(currentColor,currentColor);background-repeat:no-repeat;background-size:0 1px;background-position:0 100%;transition:background-size .2s ease}",
    ".ix-v2-nav a:hover{background-size:100% 1px}",
    ".ix-v2-header-cta{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 24px;border:1px solid #111;background:#111;text-decoration:none;color:#fff;font:720 12px/1 var(--ix-body-font);letter-spacing:.075em;text-transform:uppercase}",
    ".ix-v2-footer{background:radial-gradient(circle at 88% 8%,rgba(255,255,255,.07),transparent 24%),linear-gradient(135deg,#101113 0%,#17191b 58%,#0b0c0d 100%);color:#f7f6f2;padding:clamp(76px,9vw,128px) clamp(24px,6vw,90px);border-top:1px solid rgba(255,255,255,.12)}",
    ".ix-v2-footer-grid{width:min(1320px,100%);margin:0 auto;display:grid;grid-template-columns:minmax(300px,1.35fr) minmax(150px,.5fr) minmax(280px,.9fr);gap:clamp(44px,6.5vw,104px);align-items:start}",
    ".ix-v2-footer-brand{display:grid;gap:28px}.ix-v2-footer-identity{display:flex;align-items:center;min-height:62px}",
    ".ix-v2-footer-logo{max-width:min(280px,50vw);max-height:78px;object-fit:contain;filter:none}",
    ".ix-v2-footer-wordmark{font:760 30px/1 var(--ix-display-font);letter-spacing:-.035em}",
    ".ix-v2-footer-tagline{margin:0;max-width:40ch;color:rgba(247,246,242,.68);font:430 15px/1.65 var(--ix-body-font);text-wrap:pretty}",
    ".ix-v2-footer-nav{display:grid;gap:19px;padding-top:8px}.ix-v2-footer-nav a{color:rgba(247,246,242,.82)}",
    ".ix-v2-footer-contact-block{display:grid;gap:22px;padding-top:8px}.ix-v2-footer-contacts{display:grid;gap:14px}",
    ".ix-v2-footer-address{max-width:38ch;color:rgba(247,246,242,.66);font:430 13px/1.55 var(--ix-body-font);overflow-wrap:anywhere}",
    ".ix-v2-footer-contact{color:#f7f6f2;text-decoration:none;font:650 13px/1.4 var(--ix-body-font);overflow-wrap:anywhere}",
    ".ix-v2-footer-contact:first-child{display:inline-flex;width:max-content;max-width:100%;min-height:44px;align-items:center;padding:0 18px;border:1px solid rgba(255,255,255,.30)}",
    "@media(max-width:820px){.ix-v2-header{backdrop-filter:blur(14px)}.ix-v2-header-inner{width:min(calc(100% - 28px),1440px);min-height:78px;grid-template-columns:minmax(0,1fr) auto;gap:12px}.ix-v2-nav{grid-column:1/-1;grid-row:2;overflow-x:auto;gap:20px;padding:0 0 15px;white-space:nowrap}.ix-v2-nav a{font-size:11px;line-height:1.2;padding:10px 0}.ix-v2-header-cta{grid-column:2;grid-row:1;min-height:42px;padding:0 15px;font-size:10px}.ix-v2-logo{max-width:160px;max-height:50px}.ix-v2-brand{max-width:min(58vw,220px)}.ix-v2-wordmark{max-width:min(58vw,220px);font-size:clamp(15px,4.6vw,20px);line-height:1.05}.ix-v2-footer{padding:64px 20px 70px}.ix-v2-footer-grid{grid-template-columns:1fr;gap:42px}.ix-v2-footer-nav{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 22px}.ix-v2-footer-tagline{font-size:15px;line-height:1.65}.ix-v2-footer-contact{font-size:13px;line-height:1.5}}"
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
