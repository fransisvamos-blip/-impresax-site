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
      mobile:"FULL_REINTERPRETATION_REQUIRED"
    },
    conversion:{
      services:"EDITORIAL_SHOWCASE",
      trust:"QUALITATIVE_VISUAL_PROOF",
      final_cta:"COMMERCIAL_CLIMAX"
    }
  });
}
