function base64ToBytes(value) {
  const raw=atob(String(value||""));
  const out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
  return out;
}

function clean(value,max=1200) {
  return String(value||"").replace(/\s+/g," ").trim().slice(0,max);
}

function variantComposition(variantKey) {
  if(variantKey==="B") {
    return "Architecture-first composition: the environment is the hero, with real work activity secondary; cinematic wide frame, strong depth, premium editorial photography, generous negative space for copy.";
  }
  if(variantKey==="C") {
    return "Trust-and-collaboration composition: two relevant professionals or a professional with a client reviewing the work/context; subjects placed away from the copy area; sophisticated editorial realism.";
  }
  return "Flagship operational composition: one relevant professional supervising or performing the core work in a premium real-world setting; subject placed on the right half with generous clean copy space on the left.";
}

function sectorDirection(inputPayload={}) {
  const hay=[
    inputPayload.vertical,
    inputPayload.verified_services,
    inputPayload.brand_dna?.offer,
    inputPayload.brand_dna?.business_type,
    inputPayload.brand_dna?.business_positioning
  ].map(x=>String(x||"").toLowerCase()).join(" ");

  if(/edil|costruz|ristruttur|cement|materiali|cantiere|immobil|architett/.test(hay)) {
    return "Show a believable high-end Italian construction / renovation context: quality building site, refined residential or commercial architecture, scaffolding or materials only where natural, clean professional workwear, credible site supervision or craftsmanship. Avoid generic corporate offices.";
  }
  if(/dent|odont|medic|fisioter|clinic|salute|sanit/.test(hay)) {
    return "Show a premium, clean, believable healthcare environment relevant to the verified service, with professional staff and equipment appropriate to the field. Avoid fake procedures, dramatic illness, or generic office imagery.";
  }
  if(/ristor|bar|food|cucina|pizzeria|hospitality|hotel/.test(hay)) {
    return "Show a premium hospitality or food-service environment relevant to the verified offer, with authentic service activity, refined materials and natural human presence. Avoid generic stock-table shots.";
  }
  if(/auto|carrozzer|meccanic|officina|moto|veicol/.test(hay)) {
    return "Show a premium automotive workshop / service environment with believable equipment, skilled professional activity and clean commercial presentation. Avoid racing clichés.";
  }
  if(/legal|avvocat|commercialist|consulenz|studio profession/.test(hay)) {
    return "Show a sophisticated professional-services environment with credible consultation, documents and architectural context, premium but restrained. Avoid handshake clichés and fake boardrooms.";
  }
  if(/beauty|estetic|parruc|salon|benessere|spa/.test(hay)) {
    return "Show a refined beauty / wellness environment with authentic service context, premium materials and natural human presence. Avoid exaggerated glamour or generic spa stock imagery.";
  }
  if(/retail|negozio|vendita|showroom|arredo|abbigli/.test(hay)) {
    return "Show a refined retail / showroom environment centered on the verified category, with real merchandising, premium materials and natural commercial activity.";
  }
  return "Create a believable premium real-world scene directly relevant to the verified business category and services. The environment and people must clearly communicate the actual commercial activity, not a generic corporate stock concept.";
}

export function explicitHeroAsset(assets={}) {
  const candidates=Object.entries(assets).filter(([token,meta])=>
    token!=="PRIMARY_LOGO" &&
    !meta?.unavailable &&
    meta?.r2_key &&
    /^(hero|featured|cover)$/i.test(String(meta?.role||""))
  );
  if(!candidates.length) return null;
  const [sourceToken,meta]=candidates[0];
  return {
    ...meta,
    asset_id:"HERO_VISUAL",
    role:"hero",
    source_type:meta.source_type||"VERIFIED_INPUT",
    hero_source_token:sourceToken,
    generated:false
  };
}

export function buildHeroPrompt({inputPayload,direction,variantKey,feedback=null}) {
  const context={
    business_name:clean(inputPayload?.business_name,180),
    vertical:clean(inputPayload?.vertical,300),
    city:clean(inputPayload?.city,120),
    verified_services:clean(inputPayload?.verified_services,900),
    audience:clean(inputPayload?.brand_dna?.audience,500),
    offer:clean(inputPayload?.brand_dna?.offer,700),
    positioning:clean(inputPayload?.brand_dna?.business_positioning,700),
    visual_cues:clean(inputPayload?.brand_dna?.visual_cues,500)
  };
  return [
    "Create ONE premium photorealistic editorial hero photograph for a high-end business website.",
    "The image must be visually arresting, commercially credible, realistic and directly relevant to the VERIFIED business context below.",
    "This is illustrative commercial imagery, not documentary proof of an actual company project, premises, employee, client or completed work.",
    "Do not render any company name, logo, signage, text, watermark, certification, number plate or invented claim.",
    "Avoid obvious AI artifacts, uncanny hands/faces, impossible architecture, oversaturated advertising gloss, generic stock-photo poses and empty decorative scenes.",
    sectorDirection(inputPayload),
    variantComposition(variantKey),
    "Composition must work as a website hero: strong focal point, premium depth/light/materiality, and a clean area for headline + CTA. It must also survive a 390px mobile crop without losing the main subject.",
    "Use natural European/Italian visual cues only when compatible with the verified city/context; do not invent a recognizable exact location.",
    "Direction intent: "+clean(direction?.hero_logic||direction?.core_idea,700),
    feedback?"REWORK FEEDBACK FROM PRIOR HERO QA: "+clean(feedback,1200):"",
    "VERIFIED BUSINESS CONTEXT (visual relevance only; never render these strings as text):",
    JSON.stringify(context)
  ].join("\n");
}

export async function generatePremiumHeroVisual(env,{inputPayload,direction,variantKey,feedback=null}) {
  if(!env.AI) throw new Error("HERO_IMAGE_AI_BINDING_REQUIRED");
  const model=env.V2_MODEL_HERO_IMAGE||"@cf/black-forest-labs/flux-2-klein-9b";
  const prompt=buildHeroPrompt({inputPayload,direction,variantKey,feedback});
  const form=new FormData();
  form.append("prompt",prompt);
  form.append("width","1536");
  form.append("height","1024");
  form.append("guidance","4.5");
  const encoded=new Response(form);
  const contentType=encoded.headers.get("content-type")||"multipart/form-data";
  const response=await env.AI.run(model,{
    multipart:{body:encoded.body,contentType}
  });
  const image=String(response?.image||"").trim();
  if(!image) throw new Error("HERO_IMAGE_EMPTY_RESPONSE");
  const bytes=base64ToBytes(image);
  if(bytes.byteLength<50000) throw new Error("HERO_IMAGE_TOO_SMALL");
  return {
    bytes,
    mime:"image/jpeg",
    model,
    prompt,
    width:1536,
    height:1024,
    generated:true
  };
}
