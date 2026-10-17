import { MIN_SECTION_VISUALS, SHOWROOM_RULES_VERSION } from "./constants.js";

const LOW_VALUE_HOMEPAGE_FACTS=[
  /\bfatturato\b/i,
  /\bricavi\b/i,
  /\brevenue\b/i,
  /\bturnover\b/i,
  /\bdipendent[ei]\b/i,
  /\bemployees?\b/i,
  /\bheadcount\b/i,
  /\baddetti\b/i
];

const INTERNAL_OR_CHEAP_COPY=[
  /\bdati verificati\b/i,
  /\binformazioni verificate\b/i,
  /\binformazioni operative verificate\b/i,
  /\bprofilo operativo\b/i,
  /\bnumeri da visura\b/i,
  /\bvisura\b/i,
  /\bdatabase\b/i,
  /\bscheda azienda\b/i
];

export function isLowValueHomepageFact(value="") {
  const text=String(value||"").replace(/\s+/g," ").trim();
  return LOW_VALUE_HOMEPAGE_FACTS.some(re=>re.test(text));
}

export function filterHomepageTrustPoints(points=[]) {
  return (Array.isArray(points)?points:[]).filter(point=>!isLowValueHomepageFact(point?.text||point));
}

export function sectionVisualTokens(assets={}) {
  return Object.entries(assets||{})
    .filter(([token,meta])=>{
      if(token==="PRIMARY_LOGO" || token==="HERO_VISUAL") return false;
      if(meta?.unavailable) return false;
      if(String(meta?.role||"").toLowerCase()==="identity") return false;
      if(String(meta?.role||"").toLowerCase()==="hero") return false;
      if(meta?.mime && !String(meta.mime).startsWith("image/")) return false;
      return true;
    })
    .map(([token])=>token);
}

export function requiredSectionVisualCount(assets={}) {
  const available=sectionVisualTokens(assets).length;
  return Math.min(MIN_SECTION_VISUALS,available);
}

export function copyPolicyViolations(copyManifest={},usedKeys=[]) {
  const keys=(usedKeys?.length?usedKeys:Object.keys(copyManifest||{})).filter(k=>k in (copyManifest||{}));
  const issues=[];
  const normalized=new Map();

  for(const key of keys) {
    const value=String(copyManifest?.[key]||"").replace(/\s+/g," ").trim();
    if(!value) continue;
    if(isLowValueHomepageFact(value)) issues.push("LOW_VALUE_CORPORATE_STAT_VISIBLE:"+key);
    if(INTERNAL_OR_CHEAP_COPY.some(re=>re.test(value))) issues.push("INTERNAL_OR_GENERIC_COPY_VISIBLE:"+key);
    if(value.length>=45) {
      const n=value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
      if(normalized.has(n)) issues.push("DUPLICATE_SECTION_COPY:"+normalized.get(n)+":"+key);
      else normalized.set(n,key);
    }
  }
  return [...new Set(issues)];
}

function parseRootVars(css="") {
  const vars={};
  const root=String(css).match(/:root\s*\{([\s\S]*?)\}/i)?.[1]||"";
  for(const m of root.matchAll(/(--[a-z0-9_-]+)\s*:\s*([^;]+)(?:;|$)/gi)) vars[m[1]]=m[2].trim();
  return vars;
}

function resolveCssColor(value="",vars={}) {
  let v=String(value||"").trim();
  const vm=v.match(/^var\((--[a-z0-9_-]+)\)$/i);
  if(vm && vars[vm[1]]) v=String(vars[vm[1]]).trim();
  const hex=v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  let r,g,b;
  if(hex) {
    let h=hex[1];
    if(h.length===3) h=h.split("").map(x=>x+x).join("");
    r=parseInt(h.slice(0,2),16); g=parseInt(h.slice(2,4),16); b=parseInt(h.slice(4,6),16);
  } else {
    const rgb=v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i);
    if(!rgb) return null;
    r=Math.min(255,Number(rgb[1])); g=Math.min(255,Number(rgb[2])); b=Math.min(255,Number(rgb[3]));
  }
  const max=Math.max(r,g,b),min=Math.min(r,g,b);
  const lum=(0.2126*r+0.7152*g+0.0722*b)/255;
  const sat=max===0?0:(max-min)/max;
  return {r,g,b,lum,sat,raw:v};
}

export function flatStrongSectionBackgroundViolations(mainHtml="",css="") {
  const issues=[];
  const vars=parseRootVars(css);
  const main=String(mainHtml||"");
  for(const m of main.matchAll(/<section\b([^>]*)\bid=["\']([^"\']+)["\']([^>]*)>/gi)) {
    const id=m[2];
    if(id==="hero") continue;
    const attrs=(m[1]||"")+" "+(m[3]||"");
    const classMatch=attrs.match(/\bclass=["\']([^"\']+)["\']/i);
    const classes=(classMatch?.[1]||"").split(/\s+/).filter(Boolean);
    for(const cls of classes) {
      const esc=cls.replace(/[^a-zA-Z0-9_-]/g,"");
      const rule=new RegExp("\\."+esc+"\\s*\\{([\\s\\S]*?)\\}","i").exec(css)?.[1]||"";
      if(!rule) continue;
      const bg=(rule.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i)?.[1]||"").trim();
      if(!bg || /gradient\(|url\(|transparent/i.test(bg)) continue;
      const c=resolveCssColor(bg,vars);
      if(c && (c.lum<0.34 || (c.sat>0.42 && c.lum<0.82))) issues.push("FLAT_STRONG_SECTION_BACKGROUND_FORBIDDEN:"+id);
    }
  }
  return [...new Set(issues)];
}

export function surfaceContractViolations(mainHtml="") {
  const issues=[];
  const main=String(mainHtml||"");
  for(const m of main.matchAll(/<section\b([^>]*)\bid=["\']([^"\']+)["\']([^>]*)>/gi)) {
    const id=m[2];
    if(id==="hero") continue;
    if(!/\bdata-surface=["\']art-directed["\']/i.test(m[0])) issues.push("ART_DIRECTED_SURFACE_REQUIRED:"+id);
  }
  return issues;
}
function cssRulesForClass(css="",className="") {
  const esc=String(className||"").replace(/[^a-zA-Z0-9_-]/g,"");
  if(!esc) return [];
  const out=[];
  const re=new RegExp("\\."+esc+"(?=[\\s.:#>+~\\[,\\{])[^\\{]*\\{([^}]*)\\}","gi");
  for(const m of String(css||"").matchAll(re)) out.push(m[1]||"");
  return out;
}

function cssColorTokens(text="",vars={}) {
  const out=[];
  for(const m of String(text||"").matchAll(/#[0-9a-f]{3,6}\b|rgba?\([^)]*\)|var\((--[a-z0-9_-]+)\)/gi)) {
    const resolved=resolveCssColor(m[0],vars);
    if(resolved) out.push(resolved);
  }
  return out;
}

export function brandRichSurfaceViolations(mainHtml="",css="",minimum=2) {
  const main=String(mainHtml||"");
  const vars=parseRootVars(css);
  let rich=0;
  for(const m of main.matchAll(/<section\b([^>]*)\bid=["']([^"']+)["']([^>]*)>/gi)) {
    const id=m[2];
    if(id==="hero") continue;
    if(!/\bdata-brand-surface=["'](?:primary|secondary|dark|tint)["']/i.test(m[0])) continue;
    const attrs=(m[1]||"")+" "+(m[3]||"");
    const classes=(attrs.match(/\bclass=["']([^"']+)["']/i)?.[1]||"").split(/\s+/).filter(Boolean);
    const ruleText=classes.flatMap(cls=>cssRulesForClass(css,cls)).join("\n");
    const layered=/(?:linear|radial|conic)-gradient\(|background-image\s*:|mask(?:-image)?\s*:|clip-path\s*:/i.test(ruleText);
    const chromatic=cssColorTokens(ruleText,vars).some(color=>color.sat>=0.18);
    if(layered && chromatic) rich++;
  }
  return rich>=minimum ? [] : ["BRAND_RICH_LAYERED_SURFACES_REQUIRED:"+rich+"/"+minimum];
}

export function watermarkVisibilityViolations(mainHtml="",css="") {
  const main=String(mainHtml||"");
  const mark=main.match(/<[^>]+\bdata-brand-watermark\b[^>]*>/i);
  if(!mark) return ["OFFICIAL_LOGO_WATERMARK_REQUIRED"];
  const classes=(mark[0].match(/\bclass=["']([^"']+)["']/i)?.[1]||"").split(/\s+/).filter(Boolean);
  const wrapperRules=classes.flatMap(cls=>cssRulesForClass(css,cls)).join("\n");
  const identityRules=classes.flatMap(cls=>{
    const esc=String(cls||"").replace(/[^a-zA-Z0-9_-]/g,"");
    if(!esc) return [];
    const out=[];
    const re=new RegExp("\\."+esc+"[^\\{]*\\.ix-v2-identity-main[^\\{]*\\{([^}]*)\\}","gi");
    for(const m of String(css||"").matchAll(re)) out.push(m[1]||"");
    return out;
  }).join("\n");
  const opacitySource=identityRules||wrapperRules;
  const values=[...opacitySource.matchAll(/\bopacity\s*:\s*((?:0?\.\d+)|0|1(?:\.0+)?)\b/gi)]
    .map(m=>Number(m[1])).filter(Number.isFinite);
  if(!values.length) return ["OFFICIAL_LOGO_WATERMARK_VISIBILITY_REQUIRED:EXPLICIT_OPACITY"];
  const visible=Math.max(...values);
  if(visible<0.07) return ["OFFICIAL_LOGO_WATERMARK_VISIBILITY_REQUIRED:TOO_FAINT:"+visible.toFixed(3)];
  if(visible>0.28) return ["OFFICIAL_LOGO_WATERMARK_VISIBILITY_REQUIRED:TOO_STRONG:"+visible.toFixed(3)];
  return [];
}

export function launchGradeViolations(mainHtml="",minimumSpectacle=2) {
  const main=String(mainHtml||"");
  const hero=main.match(/<section\b[^>]*\bid=["']hero["'][^>]*>/i)?.[0]||"";
  const issues=[];
  if(!/\bdata-launch-hero=["']true["']/i.test(hero)) issues.push("LAUNCH_GRADE_HERO_REQUIRED");
  const moments=(main.match(/\bdata-spectacle-moment=["']true["']/gi)||[]).length;
  if(moments<minimumSpectacle) issues.push("SPECTACLE_MOMENTS_REQUIRED:"+moments+"/"+minimumSpectacle);
  const staged=(main.match(/\bdata-stage-depth=["'](?:cinematic|material|editorial)["']/gi)||[]).length;
  if(staged<minimumSpectacle) issues.push("STAGE_DEPTH_REQUIRED:"+staged+"/"+minimumSpectacle);
  return issues;
}

export function typographyCompositionViolations(mainHtml="",css="") {
  const main=String(mainHtml||"");
  const styles=String(css||"");
  const issues=[];
  const hero=main.match(/<section\b[^>]*\bid=["']hero["'][^>]*>/i)?.[0]||"";
  if(!/\bdata-hero-full-bleed=["']true["']/i.test(hero)) issues.push("HERO_FULL_BLEED_REQUIRED");
  if(!/\bdata-typography-system=["']responsive["']/i.test(hero)) issues.push("RESPONSIVE_TYPOGRAPHY_MARKER_REQUIRED");
  const controlled=(main.match(/\bdata-copy-density=["']controlled["']/gi)||[]).length;
  if(controlled<4) issues.push("COPY_DENSITY_CONTROL_REQUIRED:"+controlled+"/4");
  if(!/--ix-display-font\s*:/i.test(styles)) issues.push("DISPLAY_FONT_SYSTEM_REQUIRED");
  if(!/--ix-body-font\s*:/i.test(styles)) issues.push("BODY_FONT_SYSTEM_REQUIRED");
  if(!/text-wrap\s*:\s*balance/i.test(styles)) issues.push("HEADLINE_BALANCE_REQUIRED");
  if(!/text-wrap\s*:\s*pretty/i.test(styles)) issues.push("BODY_TEXT_PRETTY_WRAP_REQUIRED");
  const display=(styles.match(/--ix-display-font\s*:\s*([^;]+);/i)?.[1]||"").trim();
  if(display && /^(?:Arial|Helvetica|system-ui|sans-serif)(?:\s*,\s*(?:Arial|Helvetica|system-ui|sans-serif))*$/i.test(display)) {
    issues.push("GENERIC_DISPLAY_FONT_STACK_FORBIDDEN");
  }
  const mobile=styles.match(/@media\s*\([^)]*max-width\s*:\s*(?:700|720|768|820)px[^)]*\)\s*\{[\s\S]*$/i)?.[0]||"";
  if(!/font-size\s*:\s*clamp\(/i.test(mobile)) issues.push("MOBILE_RESPONSIVE_TYPE_SCALE_REQUIRED");
  if(!/line-height\s*:/i.test(mobile)) issues.push("MOBILE_LINE_HEIGHT_REQUIRED");
  if(!/\.ix-v2-header/i.test(styles) || !/\.ix-v2-nav/i.test(styles)) issues.push("PROFESSIONAL_HEADER_NAV_REQUIRED");
  if(!/\.ix-v2-footer/i.test(styles) || !/\.ix-v2-footer-grid/i.test(styles)) issues.push("PROFESSIONAL_FOOTER_REQUIRED");
  return issues;
}

export function fifteenKValueViolations(mainHtml="",css="") {
  const main=String(mainHtml||"");
  const styles=String(css||"");
  const issues=[];
  const hero=main.match(/<section\b[^>]*\bid=["']hero["'][^>]*>/i)?.[0]||"";
  if(!/\bdata-value-perception=["']15k["']/i.test(hero)) issues.push("FIFTEEN_K_VALUE_MARKER_REQUIRED");
  if(!/\bdata-brand-specific=["']true["']/i.test(hero)) issues.push("BRAND_SPECIFICITY_MARKER_REQUIRED");
  if(!/\bdata-sales-architecture=["']true["']/i.test(hero)) issues.push("SALES_ARCHITECTURE_MARKER_REQUIRED");
  const signatures=(main.match(/\bdata-signature-moment=["']true["']/gi)||[]).length;
  if(signatures<3) issues.push("SIGNATURE_MOMENTS_REQUIRED:"+signatures+"/3");
  const custom=(main.match(/\bdata-custom-made=["']true["']/gi)||[]).length;
  if(custom<3) issues.push("CUSTOM_MADE_MOMENTS_REQUIRED:"+custom+"/3");
  if(!/box-shadow\s*:/i.test(styles) || !/(?:linear|radial|conic)-gradient\(/i.test(styles)) {
    issues.push("PREMIUM_DETAIL_DEPTH_REQUIRED");
  }
  return issues;
}

export function showroomPolicySummary() {
  return Object.freeze({
    version:SHOWROOM_RULES_VERSION,
    content:{
      financial_and_headcount_stats:"SOURCE_ONLY_NOT_HOMEPAGE_HIGHLIGHTS",
      section_copy:"DISTINCT_PROFESSIONAL_PREMIUM_B2B",
      database_profile_language:"FORBIDDEN"
    },
    visual:{
      minimum_section_visuals:MIN_SECTION_VISUALS,
      section_visuals:"REAL_FIRST_PARTY_OR_LICENSED_EDITORIAL",
      iconography:"BRAND_NATIVE_TECHNICAL_OR_SECTOR_RELEVANT",
      repeated_card_walls:"FORBIDDEN",
      flat_full_bleed_strong_color_blocks:"FORBIDDEN",
      flat_surface_gate:"COMPILER_ENFORCED",
      section_surfaces:"ART_DIRECTED_LAYERED_BRAND_SPECIFIC",
      logo_watermark:"REQUIRED_WHEN_OFFICIAL_LOGO_EXISTS_VISIBLE_BUT_RESTRAINED",
      minimum_brand_rich_sections:2,
      brand_color_presence:"MEANINGFUL_CHROMATIC_FIELDS_REQUIRED",
      neutral_only_page:"FORBIDDEN",
      brand_motifs:"REQUIRED_AS_STRUCTURAL_SUPPORT",
      north_star:"WORLD_CLASS_LAUNCH_EXPERIENCE_UNLIMITED_BUDGET",
      launch_hero:"REQUIRED_CINEMATIC_REVEAL",
      section_model:"SET_PIECES_NOT_STACKED_SECTIONS",
      minimum_spectacle_moments:2,
      scale_shifts:"REQUIRED",
      material_depth:"REQUIRED",
      generic_premium_corporate:"FAIL",
      hero_full_bleed:"EDGE_TO_EDGE_BACKGROUND_ZERO_LATERAL_MARGIN",
      text_breathing:"REQUIRED_NO_CROWDING",
      responsive_typography:"INDEPENDENT_DESKTOP_MOBILE_OPTIMIZATION",
      font_system:"DISTINCTIVE_BRAND_FIT_DISPLAY_AND_BODY",
      copy_density:"CONTROLLED",
      headline_line_breaks:"EDITORIALLY_BALANCED",
      spacing_rhythm:"EXPLICIT_DESKTOP_AND_MOBILE",
      header_menu:"PROFESSIONAL_BRAND_EXPERIENCE_ENTRY",
      footer:"PROFESSIONAL_BRAND_EXPERIENCE_CLOSING",
      navigation_hierarchy:"CLEAR_REFINED_AND_PURPOSEFUL",
      perceived_value_target:"EUR_10000_TO_15000",
      commercial_price_reference:"EUR_2500",
      custom_made_feel:"MANDATORY",
      signature_moments_minimum:3,
      premium_art_direction:"TOP_TIER_AGENCY_STANDARD",
      brand_specificity:"DIFFICULT_TO_REUSE_FOR_ANOTHER_PROSPECT",
      imagery_credibility:"REAL_OR_HIGH_CREDIBILITY_PREMIUM",
      detail_refinement:"MANIACAL",
      mobile_premium_integrity:"EQUAL_VALUE_TO_DESKTOP",
      fifteen_k_value_perception:"BLOCKING_MIN_9_2",
      mobile:"FULL_REINTERPRETATION_REQUIRED"
    },
    conversion:{
      services:"EDITORIAL_SHOWCASE",
      trust:"QUALITATIVE_VISUAL_PROOF",
      final_cta:"COMMERCIAL_CLIMAX",
      sales_architecture:"STRATEGIC_PERSUASION_NOT_DECORATION",
      perceived_value_goal:"MAKE_2500_EUR_FEEL_LIKE_A_BARGAIN_VS_10000_15000_EUR"
    }
  });
}
