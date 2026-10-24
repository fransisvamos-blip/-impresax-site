export const R122_DESIRE_ENGINE_STANDARD="R122_DESIRE_ENGINE_15K_V1";

export const R122_CONCEPT_RULES=[
  "R122 DESIRE ENGINE: the concept must make the prospect feel larger, more authoritative, more desirable and more expensive before it makes the site merely informative.",
  "LOGO-FIRST DNA: derive the visual system from the immutable official identity: geometry, chromatic tension, contrast, rhythm, button silhouette, spatial aggressiveness/softness and shell behavior must feel causally related to the logo/brand DNA rather than applied afterward.",
  "ONE MEMORABLE THESIS: the campaign thesis must be ownable, commercially useful and impossible to transplant unchanged to another company. Style labels such as industrial premium, minimal luxury, dark editorial, modern corporate or clean grid are not concepts.",
  "VISUAL WORLD: plan at least six materially different visual roles: hero, process/service, proof/detail, atmosphere, scale/environment and technical/graphic support. Never fake richness with repeated crops of the same scene.",
  "SELLABILITY: the owner should understand in seconds that the redesign makes the business look more important and worth contacting. The concept must create desire, not just clarity.",
  "CONVERSION CLIMAX: the final CTA is a designed decision object, not a button under a paragraph. Hero CTA and final CTA must feel like authored brand components.",
  "PREMIUM SHELL: navigation and footer are part of the art direction and must feel commissioned, not theme defaults.",
  "MOBILE RE-AUTHORING: 390px is a second composition with deliberate crop, order, scale, CTA choreography and visual rhythm."
];

export const R122_IMPLEMENTATION_RULES=[
  "R122 IMPLEMENTATION HARD GATE — output is rejected unless the finished HTML/CSS visibly expresses the locked campaign at a EUR 15k+ perceived-value bar.",
  "Mark the hero section data-r122-design=\"desire-engine\" and data-r122-hero=\"campaign\".",
  "Create at least THREE unmistakable visual set-pieces and mark their section/article roots data-r122-wow=\"true\".",
  "Use at least FIVE distinct non-logo image assets in the main composition. R121 campaign images must be materially different and each R121 token may be used as a primary visual no more than once.",
  "Every image needs a narrative job. No decorative thumbnail rows, no repeated stock collage, no image used merely to fill empty space.",
  "Hero must be a photographic/CGI campaign field with headline, body and both CTAs integrated into the visual composition. No boxed copy panel floating beside a generic image.",
  "Hero primary CTA must carry data-premium-button=\"true\" and data-r122-cta=\"hero-primary\". Secondary CTA must be visually subordinate but still authored.",
  "Final CTA must carry data-r122-final-cta=\"conversion-object\" and include a child element with data-r122-action=\"true\". It must be asymmetric/modular and visually distinct from ordinary buttons.",
  "Style .ix-v2-header, .ix-v2-header-inner, .ix-v2-nav and .ix-v2-header-cta as a coherent premium navigation object derived from the brand. No browser-default/plain text nav.",
  "Style .ix-v2-footer and .ix-v2-footer-grid as the final campaign scene with intentional grid, border/separation, hierarchy and contact emphasis. No generic link cemetery.",
  "Use typography as composition: large scale contrast, disciplined line breaks, editorial rhythm and controlled copy density. Avoid centered marketing stacks repeated through the page.",
  "No card soup, SaaS grammar, equal-size feature tiles, alternating copy/image template rhythm or repetitive rounded rectangles.",
  "Mobile max-width:700px must materially change at least hero scale/crop and one later set-piece; do not merely stack desktop columns.",
  "The rendered page must remain truthful: generated campaign imagery is illustrative, not documentary, and cannot depict unverifiable premises, employees, projects, clients, machinery, partner branding or process specifics."
];

function tokenOccurrences(html,token){
  return (String(html||"").match(new RegExp("\\{\\{asset:"+String(token)+"\\}\\}","g"))||[]).length;
}

export function r122DesireEngineViolations(spec={},manifests={}){
  const issues=[];
  const html=String(spec?.main_html||"");
  const css=String(spec?.custom_css||"");
  const active=String(spec?.r122_desire_engine_standard||"")===R122_DESIRE_ENGINE_STANDARD
    || String(spec?.r121_standard||"")==="R121_CREATIVE_DIRECTOR_ENGINE_V1";
  if(!active) return issues;

  if(!/data-r122-design=["']desire-engine["']/i.test(html)) issues.push("R122_DESIRE_ENGINE_MARKER_REQUIRED");
  if(!/<section\b[^>]*id=["']hero["'][^>]*data-r122-hero=["']campaign["']/i.test(html)
     && !/<section\b[^>]*data-r122-hero=["']campaign["'][^>]*id=["']hero["']/i.test(html)) {
    issues.push("R122_CAMPAIGN_HERO_REQUIRED");
  }

  const wowCount=(html.match(/data-r122-wow=["']true["']/gi)||[]).length;
  if(wowCount<3) issues.push("R122_THREE_WOW_MOMENTS_REQUIRED:"+wowCount+"/3");

  const usedAssets=[...String(html).matchAll(/\{\{asset:([A-Z0-9_]+)\}\}/g)].map(m=>m[1]);
  const nonLogo=[...new Set(usedAssets.filter(x=>x!=="PRIMARY_LOGO" && !/LOGO$/.test(x)))];
  if(nonLogo.length<5) issues.push("R122_VISUAL_RICHNESS_REQUIRED:"+nonLogo.length+"/5");

  const campaignTokens=Object.keys(manifests?.assets||{}).filter(x=>/^R121_/.test(x));
  const usedCampaign=[...new Set(nonLogo.filter(x=>/^R121_/.test(x)))];
  if(campaignTokens.length>=5 && usedCampaign.length<5) issues.push("R122_CAMPAIGN_VISUAL_DIVERSITY_REQUIRED:"+usedCampaign.length+"/5");
  for(const token of usedCampaign){
    const n=tokenOccurrences(html,token);
    if(n>1) issues.push("R122_CAMPAIGN_ASSET_REUSE_FORBIDDEN:"+token+":"+n);
  }

  const imgCount=(html.match(/<img\b/gi)||[]).length;
  if(imgCount<5) issues.push("R122_MINIMUM_IMAGE_PRESENCE_REQUIRED:"+imgCount+"/5");

  if(!/data-r122-cta=["']hero-primary["']/i.test(html)) issues.push("R122_HERO_PRIMARY_CTA_OBJECT_REQUIRED");
  if(!/data-r122-final-cta=["']conversion-object["']/i.test(html)) issues.push("R122_FINAL_CONVERSION_OBJECT_REQUIRED");
  if(!/data-r122-action=["']true["']/i.test(html)) issues.push("R122_FINAL_CTA_ACTION_MODULE_REQUIRED");

  const premiumButtons=(html.match(/data-premium-button=["']true["']/gi)||[]).length;
  if(premiumButtons<2) issues.push("R122_PREMIUM_BUTTON_SYSTEM_REQUIRED:"+premiumButtons+"/2");

  for(const selector of [".ix-v2-header",".ix-v2-header-inner",".ix-v2-nav",".ix-v2-header-cta",".ix-v2-footer",".ix-v2-footer-grid"]){
    if(!css.includes(selector)) issues.push("R122_PREMIUM_SHELL_STYLE_REQUIRED:"+selector);
  }
  if(!/\.ix-v2-header-inner\s*\{[\s\S]{0,1200}(?:grid-template-columns|display\s*:\s*grid|display\s*:\s*flex)/i.test(css)) {
    issues.push("R122_AUTHORED_HEADER_LAYOUT_REQUIRED");
  }
  if(!/\.ix-v2-footer-grid\s*\{[\s\S]{0,1400}(?:grid-template-columns|display\s*:\s*grid)[\s\S]{0,1400}(?:border-top|border-block-start)/i.test(css)) {
    issues.push("R122_AUTHORED_FOOTER_LAYOUT_REQUIRED");
  }
  if(!/@media\s*\([^)]*max-width\s*:\s*700px/i.test(css)) issues.push("R122_MOBILE_REAUTHORING_REQUIRED");

  const cardish=(html.match(/class=["'][^"']*\b(?:card|tile|feature-card)\b[^"']*["']/gi)||[]).length;
  if(cardish>6) issues.push("R122_CARD_SOUP_FORBIDDEN:"+cardish);

  return issues;
}
