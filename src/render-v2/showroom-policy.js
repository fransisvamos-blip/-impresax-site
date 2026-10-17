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
  for(const m of root.matchAll(/(--[a-z0-9_-]+)\s*:\s*([^;]+);/gi)) vars[m[1]]=m[2].trim();
  return vars;
}

function resolveCssColor(value="",vars={}) {
  let v=String(value||"").trim();
  const vm=v.match(/^var\((--[a-z0-9_-]+)\)$/i);
  if(vm && vars[vm[1]]) v=String(vars[vm[1]]).trim();
  const hex=v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if(!hex) return null;
  let h=hex[1];
  if(h.length===3) h=h.split("").map(x=>x+x).join("");
  const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
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
      mobile:"FULL_REINTERPRETATION_REQUIRED"
    },
    conversion:{
      services:"EDITORIAL_SHOWCASE",
      trust:"QUALITATIVE_VISUAL_PROOF",
      final_cta:"COMMERCIAL_CLIMAX"
    }
  });
}
