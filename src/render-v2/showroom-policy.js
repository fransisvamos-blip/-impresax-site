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
  /\bscheda azienda\b/i,
  /\busare solo\b/i,
  /\bsegnali di fiducia\b/i,
  /\besplicitamente verificat[oaie]*\b/i,
  /\bfonti verificate\b/i,
  /\bnon assumere\b/i,
  /\bnon inventare\b/i,
  /\bsource references?\b/i
];

export function isLowValueHomepageFact(value="") {
  const text=String(value||"").replace(/\s+/g," ").trim();
  return LOW_VALUE_HOMEPAGE_FACTS.some(re=>re.test(text));
}

export function filterHomepageTrustPoints(points=[]) {
  return (Array.isArray(points)?points:[]).filter(point=>!isLowValueHomepageFact(point?.text||point));
}

function normalizedVisualSignal(value="") {
  return String(value||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

function verifiedServiceWords(inputPayload={}) {
  const raw=normalizedVisualSignal(
    Array.isArray(inputPayload?.verified_services)
      ? inputPayload.verified_services.map(x=>typeof x==="string"?x:JSON.stringify(x)).join(" ")
      : inputPayload?.verified_services||""
  );
  const stop=new Set(["attivita","servizi","servizio","panoramica","generale","azienda","societa","della","delle","degli","dello","dell","per","con","del"]);
  return [...new Set(raw.split(/\s+/).filter(x=>x.length>=5 && !stop.has(x)))];
}

function sectionVisualScore(token,meta={},inputPayload={},index=0) {
  const source=normalizedVisualSignal(meta?.source_url||meta?.asset_url||"");
  const role=String(meta?.role||"").toLowerCase();
  const sourceType=String(meta?.source_type||"").toUpperCase();
  let score=0;
  if(role==="editorial") score+=12;
  if(sourceType.includes("FIRST_PARTY")) score+=22;
  if(/\.(?:avif|webp|png|jpe?g)(?:\?|$)/i.test(String(meta?.source_url||meta?.asset_url||""))) score+=14;
  else if(/^https?:\/\//i.test(String(meta?.source_url||meta?.asset_url||""))) score-=18;

  const cheapGeneric=/\b(?:congrat(?:ulation)?|handshake|business people|meeting|teamwork|celebrat(?:ion)?|stock photo|success people)\b/i;
  if(cheapGeneric.test(source)) score-=90;

  const technical=/\b(?:edil|cantiere|carpenter|metal|amianto|anten|telecom|impiant|nolegg|macchin|costruz|industr|officin|ponteggi|scavi|demoliz)\w*/g;
  const technicalHits=new Set(source.match(technical)||[]);
  score+=Math.min(technicalHits.size,4)*7;

  const serviceWords=verifiedServiceWords(inputPayload);
  let serviceHits=0;
  for(const word of serviceWords) {
    const stem=word.length>8?word.slice(0,7):word;
    if(stem.length>=5 && source.includes(stem)) serviceHits++;
  }
  score+=Math.min(serviceHits,4)*11;

  // Keep source order deterministic when quality signals tie.
  return score-(index*0.0001);
}

function sectionVisualEntries(assets={},inputPayload=null) {
  return Object.entries(assets||{})
    .map(([token,meta],index)=>({token,meta,index}))
    .filter(({token,meta})=>{
      if(token==="PRIMARY_LOGO" || token==="HERO_VISUAL") return false;
      if(meta?.unavailable) return false;
      if(String(meta?.role||"").toLowerCase()==="identity") return false;
      if(String(meta?.role||"").toLowerCase()==="hero") return false;
      if(meta?.mime && !String(meta.mime).startsWith("image/")) return false;
      return true;
    })
    .map(entry=>({...entry,base_score:sectionVisualScore(entry.token,entry.meta,inputPayload,entry.index)}));
}

export function sectionVisualTokens(assets={},inputPayload=null) {
  return sectionVisualEntries(assets,inputPayload)
    .sort((a,b)=>{
      const delta=b.base_score-a.base_score;
      return Math.abs(delta)>0.00001?delta:a.index-b.index;
    })
    .map(({token})=>token);
}

function semanticSectionScore(entry,section,inputPayload={}) {
  const source=normalizedVisualSignal(entry?.meta?.source_url||entry?.meta?.asset_url||entry?.token||"");
  let score=Number(entry?.base_score||0);
  const broad=/\b(?:ediliz|impiant|costruz|cantiere|nolegg|serviz|azienda|sede|operativ|industr|officin)\w*/g;
  const narrow=/\b(?:amianto|anten|telecom|carpenter|metal|meccanic|assicur|pratic|finanzi|garanzi|soccorso|demoliz|scav|tondo|rebar|acciaio|cement|material)\w*/g;
  const trust=/\b(?:qualit|sicurezz|formazion|certific|accredit|conform|normativ|autorizzat|partner|rivenditor|dealer|upower|u power)\w*/g;
  const broadHits=new Set(source.match(broad)||[]).size;
  const narrowHits=new Set(source.match(narrow)||[]).size;
  const trustHits=new Set(source.match(trust)||[]).size;
  const serviceWords=verifiedServiceWords(inputPayload);
  let serviceHits=0;
  for(const word of serviceWords){
    const stem=word.length>8?word.slice(0,7):word;
    if(stem.length>=5 && source.includes(stem)) serviceHits++;
  }
  if(section==="services") {
    score+=Math.min(narrowHits,3)*28;
    score+=Math.min(serviceHits,4)*28;
    score+=Math.min(broadHits,2)*8;
    score-=Math.min(trustHits,2)*10;
    if(serviceHits===0 && narrowHits===0) score-=120;
  } else if(section==="trust") {
    score+=Math.min(trustHits,3)*52;
    score-=Math.min(narrowHits,3)*18;
    if(trustHits===0) score-=180;
  } else {
    score+=Math.min(broadHits,3)*24;
    score+=Math.min(serviceHits,2)*12;
    score-=Math.min(narrowHits,3)*12;
    score-=Math.min(trustHits,2)*10;
  }
  return score;
}

export function sectionVisualPlan(assets={},inputPayload=null,variantKey="A") {
  const entries=sectionVisualEntries(assets,inputPayload);
  const key=["A","B","C"].includes(String(variantKey))?String(variantKey):"A";
  const roles=key==="B"
    ? ["trust","services","positioning"]
    : key==="C"
      ? ["services","bridge","trust"]
      : ["positioning","services","trust"];
  const serviceOffset=key==="B"?1:key==="C"?2:0;
  const used=new Set();
  const plan={};
  for(const role of roles) {
    const ranked=entries
      .filter(entry=>!used.has(entry.token))
      .map(entry=>({...entry,semantic_score:semanticSectionScore(entry,role,inputPayload)}))
      .sort((a,b)=>{
        const delta=b.semantic_score-a.semantic_score;
        return Math.abs(delta)>0.00001?delta:a.index-b.index;
      });
    if(!ranked.length){plan[role]=null;continue;}
    const best=ranked[0].semantic_score;
    const semanticFloor=role==="trust"?35:(role==="services"?28:8);
    if(best<semanticFloor){plan[role]=null;continue;}
    const window=role==="services"?18:12;
    const near=ranked.filter(entry=>entry.semantic_score>=Math.max(semanticFloor,best-window));
    const offset=role==="services"?serviceOffset:0;
    const picked=near[offset%near.length]||ranked[0];
    plan[role]=picked.token;
    used.add(picked.token);
  }
  plan.used=[...used];
  plan.strategy="R108_SECTION_COHERENCE_STRICT_V1";
  plan.strict_semantic=true;
  plan.allow_empty_instead_of_wrong_asset=true;
  return plan;
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

export function iconicCommissionedViolations(mainHtml="",css="") {
  const main=String(mainHtml||"");
  const styles=String(css||"");
  const issues=[];
  const hero=main.match(/<section\b[^>]*\bid=["']hero["'][^>]*>/i)?.[0]||"";
  if(!/\bdata-commissioned-experience=["']true["']/i.test(hero)) issues.push("COMMISSIONED_EXPERIENCE_MARKER_REQUIRED");
  if(!/\bdata-authorship=["']irreproducible["']/i.test(hero)) issues.push("IRREPRODUCIBLE_AUTHORSHIP_MARKER_REQUIRED");
  if(!/\bdata-scroll-narrative=["']continuous["']/i.test(hero)) issues.push("SCROLL_NARRATIVE_MARKER_REQUIRED");
  const iconic=(main.match(/\bdata-iconic-moment=["']true["']/gi)||[]).length;
  if(iconic<4) issues.push("ICONIC_MOMENTS_REQUIRED:"+iconic+"/4");
  const transitions=(main.match(/\bdata-authored-transition=["']true["']/gi)||[]).length;
  if(transitions<3) issues.push("AUTHORED_TRANSITIONS_REQUIRED:"+transitions+"/3");
  if(!/--ix-signature-angle\s*:/i.test(styles)) issues.push("SIGNATURE_SYSTEM_VARIABLE_REQUIRED");
  if(!/--ix-signature-rule\s*:/i.test(styles)) issues.push("SIGNATURE_RULE_VARIABLE_REQUIRED");
  if(!/\.ix-v2-header/i.test(styles) || !/\.ix-v2-footer/i.test(styles)) issues.push("COMMISSIONED_SHELL_REQUIRED");
  return issues;
}

export function r107UltraVisualViolations(mainHtml="",css="") {
  const main=String(mainHtml||"");
  const styles=String(css||"");
  const issues=[];
  const hero=main.match(/<section\b[^>]*\bid=["']hero["'][^>]*>/i)?.[0]||"";
  if(!/\bdata-r107-ultra-visual=["']true["']/i.test(hero)) issues.push("R107_ULTRA_VISUAL_MARKER_REQUIRED");
  if(!/\bdata-hero-text-over-image=["']required["']/i.test(hero)) issues.push("R107_HERO_TEXT_OVER_IMAGE_MARKER_REQUIRED");
  if(!/\.ixm-hero__media[\s\S]*position\s*:\s*absolute/i.test(styles)
     && !/\.ixb-hero__media[\s\S]*position\s*:\s*absolute/i.test(styles)
     && !/\.ixc-hero__media[\s\S]*position\s*:\s*absolute/i.test(styles)) {
    issues.push("R107_ABSOLUTE_HERO_MEDIA_REQUIRED");
  }
  if(!/text-wrap\s*:\s*balance/i.test(styles)) issues.push("R107_PREMIUM_HEADLINE_FORMATTING_REQUIRED");
  if(!/text-wrap\s*:\s*pretty/i.test(styles)) issues.push("R107_PREMIUM_BODY_FORMATTING_REQUIRED");
  if(!/image-rendering\s*:\s*auto/i.test(styles)) issues.push("R107_HIGH_RES_IMAGE_TREATMENT_REQUIRED");
  if(!/hero_text_on_image_integration|data-hero-text-over-image/i.test(main+"\n"+styles)) {
    issues.push("R107_HERO_OVERLAY_CONTRACT_REQUIRED");
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
      section_visuals:"REAL_FIRST_PARTY_OR_LICENSED_EDITORIAL_WHEN_AVAILABLE",
      sparse_visual_fallback:"R107_GRAPHIC_ASSISTED_PREMIUM_NO_FAKE_PHOTOS",
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
      signature_moments_minimum:4,
      premium_art_direction:"TOP_TIER_AGENCY_STANDARD",
      brand_specificity:"DIFFICULT_TO_REUSE_FOR_ANOTHER_PROSPECT",
      imagery_credibility:"REAL_OR_HIGH_CREDIBILITY_PREMIUM",
      detail_refinement:"MANIACAL",
      mobile_premium_integrity:"EQUAL_VALUE_TO_DESKTOP",
      fifteen_k_value_perception:"BLOCKING_MIN_9_7",
      target_quality_band:"9_8_TO_9_9",
      commissioned_experience:"BLOCKING_MIN_9_8",
      irreproducible_brand_authorship:"BLOCKING_MIN_9_7",
      scroll_narrative_continuity:"BLOCKING_MIN_9_7",
      signature_system_coherence:"BLOCKING_MIN_9_7",
      editorial_campaign_quality:"BLOCKING_MIN_9_7",
      transition_art_direction:"BLOCKING_MIN_9_6",
      visual_memory_factor:"BLOCKING_MIN_9_7",
      cross_viewport_art_direction:"BLOCKING_MIN_9_7",
      recognizable_without_logo_or_copy:"REQUIRED",
      section_transitions:"AUTHORED_NOT_STACKED",
      campaign_level_photography_treatment:"REQUIRED",
      hero_first_pipeline:"REQUIRED_BEFORE_PAGE_COMPOSITION",
      hero_selection:"PREMIUM_RELEVANCE_RANKING_FIRST_PARTY_PREFERRED",
      single_concept_delivery:"ONE_CONCEPT_MAXIMUM_CARE",
      full_size_client_preview:"DESKTOP_1440_AND_MOBILE_390_FULL_HEIGHT",
      text_background_contrast:"BLOCKING_NO_LOW_CONTRAST_TEXT",
      premium_section_polish:"BLOCKING_DEPTH_SHADOWS_SURFACES_SPACING",
      premium_button_system:"BLOCKING_REFINED_HIERARCHY_TOUCH_TARGETS",
      section_alignment_grid:"BLOCKING_COMMON_BASELINES_AND_COLUMNS",
      section_semantic_coherence:"BLOCKING_COPY_IMAGE_TRUST_MUST_MATCH",
      unrelated_section_visuals:"FORBIDDEN",
      empty_visual_preferred_over_wrong_visual:true,
      section_narrative_unit:"ONE_MESSAGE_ONE_VISUAL_SYSTEM",
      art_direction_gate:"R109_15K_ART_DIRECTION_GATE_V1",
      section_first_architecture:"R110_SECTION_FIRST_PREMIUM_ARCHITECTURE_V1",
      section_blueprint_before_design:"BLOCKING",
      section_purpose_required:"BLOCKING",
      why_us_richness:"MIN_THREE_REASONS_PLUS_GRAPHIC_SUPPORT",
      partner_brand_module:"SEPARATE_FROM_WHY_US",
      verified_partner_logo:"REQUIRED_WHEN_AVAILABLE",
      uniform_service_rows:"BLOCKING_IDENTICAL_GEOMETRY_PER_ROW",
      anchored_section_media:"BLOCKING_NO_FLOATING_RANDOM_MEDIA",
      trust_section_completeness:"BLOCKING_REAL_REASONS_REQUIRED",
      partner_proof_separation:"BLOCKING_PARTNER_AUTHORIZATION_OUTSIDE_TRUST_REASONS",
      color_saturation_integrity:"BLOCKING_NO_WASHED_OUT_SURFACES",
      footer_contact_legibility:"BLOCKING_FULL_CONTRAST",
      hero_text_over_image:"BLOCKING_DESKTOP_AND_MOBILE",
      hero_overlay_legibility:"BLOCKING_PREMIUM",
      high_resolution_visual_perception:"BLOCKING",
      premium_typography:"BLOCKING_SUPER_PREMIUM",
      sitewide_visual_polish:"BLOCKING",
      cheap_ai_look:"FORBIDDEN",
      low_detail_imagery:"FORBIDDEN",
      render_density:"2X",
      mobile:"FULL_REINTERPRETATION_REQUIRED"
    },
    conversion:{
      services:"EDITORIAL_SHOWCASE",
      trust:"QUALITATIVE_VISUAL_PROOF",
      final_cta:"COMMERCIAL_CLIMAX",
      sales_architecture:"STRATEGIC_PERSUASION_NOT_DECORATION",
      perceived_value_goal:"MAKE_2500_EUR_FEEL_LIKE_A_BARGAIN_VS_10000_15000_EUR",
      iconic_goal:"RECOGNIZABLE_AS_THIS_PROSPECT_WITHOUT_LOGO_OR_COPY",
      target_score:"9_8_TO_9_9_NOT_EASY_10"
    }
  });
}
