function base64ToBytes(value) {
  const raw=atob(String(value||""));
  const out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
  return out;
}

function detectImageMime(bytes) {
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);
  if(b.length>=3 && b[0]===0xff && b[1]===0xd8 && b[2]===0xff) return "image/jpeg";
  if(b.length>=8 && b[0]===0x89 && b[1]===0x50 && b[2]===0x4e && b[3]===0x47) return "image/png";
  if(b.length>=12 && String.fromCharCode(...b.slice(0,4))==="RIFF" && String.fromCharCode(...b.slice(8,12))==="WEBP") return "image/webp";
  throw new Error("HERO_IMAGE_UNSUPPORTED_FORMAT");
}

function clean(value,max=1200) {
  return String(value||"").replace(/\s+/g," ").trim().slice(0,max);
}

function isIndustrialMaterialsContext(inputPayload={}) {
  const hay=[
    inputPayload.vertical,
    inputPayload.verified_services,
    inputPayload.brand_dna?.offer,
    inputPayload.brand_dna?.business_type,
    inputPayload.brand_dna?.business_positioning
  ].map(x=>String(x||"").toLowerCase()).join(" ");
  return /materiali|ingrosso|distribuz|tondo|cemento armato|rebar|acciaio|fornitur/.test(hay) &&
    /edil|costruz|cement|materiali|rebar|tondo|acciaio/.test(hay);
}

function isConstructionContext(inputPayload={}) {
  const hay=[
    inputPayload.vertical,
    inputPayload.verified_services,
    inputPayload.brand_dna?.offer,
    inputPayload.brand_dna?.business_type,
    inputPayload.brand_dna?.business_positioning
  ].map(x=>String(x||"").toLowerCase()).join(" ");
  return /edil|costruz|construction|cantiere|ristruttur|immobil|architett/.test(hay);
}

function isGeneralContractorInfrastructureContext(inputPayload={}) {
  const hay=[
    inputPayload.vertical,
    inputPayload.verified_services,
    inputPayload.brand_dna?.offer,
    inputPayload.brand_dna?.business_type,
    inputPayload.brand_dna?.business_positioning
  ].map(x=>String(x||"").toLowerCase()).join(" ");
  const contractor=/general contractor|costruzion|edilizia|construction/.test(hay);
  const institutional=/industrial|industriali|ospedal|hospital|lavori stradali|road works|infrastruttur|impianti tecnologici/.test(hay);
  return contractor && institutional;
}

function variantComposition(variantKey,inputPayload={}) {
  if(isIndustrialMaterialsContext(inputPayload)) {
    if(variantKey==="B") {
      return "Material-and-environment composition: premium wide documentary photograph of real steel/rebar inventory, warehouse or processing context. Human presence may be partial and secondary. No staged poses, no faces required. Keep the visual center crop-safe and use natural industrial depth.";
    }
    if(variantKey==="C") {
      return "Process-first documentary composition with NO PEOPLE: make the visual about authentic rebar processing itself — a believable industrial rebar bending/cutting/straightening machine, round steel bars feeding through or stacked beside it, realistic wear, dust, oil traces and natural workshop light. No workers, faces, hands, posed humans or corporate interaction. No sparks unless mechanically plausible. Keep the machine/action and round rebar inside the central 60% of frame with useful depth and mobile-safe margins. All equipment surfaces must be blank and unbranded with no labels, screens, plates, stickers or readable markings.";
    }
    return "Commissioned architecture-magazine macro editorial photograph with NO PEOPLE: round rebar/steel bars are the unmistakable hero, photographed from a very low oblique close-to-medium angle so ribbed steel texture, repetition and depth become an abstract architectural composition. Use dramatic natural raking side light with controlled highlights, deep charcoal shadows, subtle warm/cool tonal contrast, shallow-to-medium depth of field and a faint atmospheric warehouse falloff in the far background. Build an asymmetric diagonal rhythm across the entire frame with one visually memorable convergence point; avoid a centered pile, ordinary aisle view, catalog inventory shot or generic warehouse perspective. The image should feel like a premium commissioned industrial campaign photographed by an architectural photographer. No workers, hands, PPE, tools, cranes, forklifts, packaging, tags, signs, stickers, screens or equipment that could introduce text. No I-beams as the dominant product. Keep the strongest convergence and ribbed steel detail inside the central 60% so wide desktop and 390px mobile crops both remain dense and striking. Tactile, moody, cinematic, high-end, bespoke — never stock, e-commerce, symmetrical inventory, CGI or 3D render.";
  }
  if(isGeneralContractorInfrastructureContext(inputPayload)) {
    if(variantKey==="A") {
      return "Large-scale operations composition: exterior civil/infrastructure construction only. Show authentic structural concrete, steel, roadworks, institutional or industrial construction in progress, with one distant supervisor at most and no close-up faces. The site itself is the hero. Use realistic wear, dust, temporary works and natural daylight. Absolutely no luxury residential interior, finished villa, staged tablet review, showroom-like surfaces or generic renovation scene. Keep the main structural geometry and machinery inside the central 60% for a strong 390px crop.";
    }
    if(variantKey==="B") {
      return "Architecture-and-scale composition: credible exterior institutional/industrial/civil construction with strong structural geometry and depth; workers are small and secondary. No luxury residential styling, no office scene, no staged consultation.";
    }
    return "Infrastructure process composition: believable roadworks, structural installation or large-scale civil works in progress, emphasizing execution capability and scale. Human presence should be distant and natural, never posed.";
  }
  if(variantKey==="B") {
    return "Architecture-first composition: the environment is the hero, with real work activity secondary; cinematic wide frame, strong depth, premium editorial photography, generous natural breathing room for later HTML copy.";
  }
  if(variantKey==="C") {
    return "Trust-and-collaboration composition: two relevant professionals or a professional with a client reviewing the work/context; subjects placed away from the copy area; sophisticated editorial realism.";
  }
  if(isConstructionContext(inputPayload)) {
    return "Construction-first flagship composition: use a close-to-medium exterior site perspective where the actual structure, façade, concrete/steel frame, scaffolding or active construction geometry occupies roughly 65–80% of the frame. The building/site is the dominant focal subject, not the sky. Keep visible sky to about 20% or less and never use a large pale/white sky area as breathing room. Place the strongest structural focal point inside the central 55% horizontally and central 65% vertically so a 390px portrait crop remains dense and credible. Human presence may be small and secondary. Avoid empty horizon, distant tiny buildings, luxury staging, generic office imagery and decorative negative space.";
  }
  return "Flagship operational composition: one relevant professional supervising or performing the core work in a premium real-world setting; subject placed within a mobile-safe composition with natural breathing room for later HTML copy.";
}

function sectorDirection(inputPayload={}) {
  const hay=[
    inputPayload.vertical,
    inputPayload.verified_services,
    inputPayload.brand_dna?.offer,
    inputPayload.brand_dna?.business_type,
    inputPayload.brand_dna?.business_positioning
  ].map(x=>String(x||"").toLowerCase()).join(" ");

  if(/materiali|ingrosso|distribuz|tondo|cemento armato|rebar|acciaio|fornitur/.test(hay) && /edil|costruz|cement|materiali|rebar|tondo/.test(hay)) {
    return "Show a believable premium B2B construction-materials and rebar-supply context with a commissioned-editorial visual standard: raw steel/rebar, real warehouse or processing depth, dramatic but natural industrial light, tactile material surfaces and a distinctive asymmetric composition. The image should feel made for this specific industrial brand, not pulled from a stock library. Use ONLY blank unbranded PPE and raw materials. Avoid cardboard boxes, printed packaging, stickers, hanging tags, wall signs, warning boards, vehicle plates, branded clothing, pallets with labels, storefronts and any surface likely to contain writing. Do NOT portray the company as the builder of a luxury villa or claim a completed construction project that is not verified. Avoid generic office imagery, generic catalog inventory shots, centered product piles and showroom cleanliness.";
  }
  if(isGeneralContractorInfrastructureContext(inputPayload)) {
    return "Show a believable high-capacity Italian general-contractor context tied to the verified offer: civil, industrial, hospital/institutional construction, technological installations or road/infrastructure works. Prefer EXTERIOR works in progress, structural scale, authentic site logistics, concrete/steel and real construction texture. Do not depict luxury residential interiors, finished villas, domestic renovation, glossy showroom architecture, staged tablet meetings or invented branded projects. The image must communicate execution scale and technical credibility without claiming a specific completed project.";
  }
  if(/edil|costruz|ristruttur|cantiere|immobil|architett/.test(hay)) {
    return "Show a believable high-end Italian construction / renovation context: quality building site, refined residential or commercial architecture, scaffolding or materials only where natural, clean professional workwear, credible site supervision or craftsmanship. Make the built structure or active construction geometry fill most of the frame; keep sky to roughly 20% or less and never let blank sky dominate the upper half. Avoid distant tiny subjects, empty horizons, generic corporate offices and decorative negative space.";
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

export function explicitHeroAsset(assets={},inputPayload={}) {
  const context=[
    inputPayload?.vertical,
    inputPayload?.verified_services,
    inputPayload?.brand_dna?.offer,
    inputPayload?.brand_dna?.business_type
  ].map(x=>String(x||"").toLowerCase()).join(" ");
  const contextWords=[...new Set(context.replace(/[^a-z0-9à-ÿ]+/gi," ").split(/\s+/).filter(x=>x.length>=5))];
  const cheap=/\b(?:handshake|meeting|teamwork|celebrat|congrat|stock|generic|business people|success people)\b/i;
  const technical=/\b(?:rebar|tondo|acciaio|steel|cement|edil|cantiere|costruz|material|warehouse|industr|officin|macchin|carpenter)\w*/i;
  const candidates=Object.entries(assets)
    .filter(([token,meta])=>
      token!=="PRIMARY_LOGO" &&
      token!=="HERO_VISUAL" &&
      !meta?.unavailable &&
      meta?.r2_key &&
      String(meta?.mime||"").startsWith("image/") &&
      String(meta?.role||"").toLowerCase()!=="identity"
    )
    .map(([token,meta],index)=>{
      const signal=String(meta?.source_url||meta?.asset_url||token||"").toLowerCase();
      const role=String(meta?.role||"").toLowerCase();
      const sourceType=String(meta?.source_type||"").toUpperCase();
      let score=0;
      if(/^(hero|featured|cover)$/.test(role)) score+=120;
      if(sourceType.includes("FIRST_PARTY")||sourceType.includes("OFFICIAL")) score+=85;
      if(technical.test(signal) && technical.test(context)) score+=45;
      let relevance=0;
      for(const word of contextWords) {
        const stem=word.length>8?word.slice(0,7):word;
        if(stem.length>=5 && signal.includes(stem)) relevance++;
      }
      score+=Math.min(relevance,5)*18;
      if(cheap.test(signal)) score-=160;
      const bytes=Math.max(0,Number(meta?.bytes||0));
      score+=Math.min(28,Math.log10(bytes+10)*4);
      score-=index*0.001;
      return {token,meta,score};
    })
    .sort((a,b)=>b.score-a.score);
  if(!candidates.length) return null;
  const winner=candidates[0];
  return {
    ...winner.meta,
    asset_id:"HERO_VISUAL",
    role:"hero",
    source_type:winner.meta.source_type||"VERIFIED_INPUT",
    hero_source_token:winner.token,
    hero_selection_score:Number(winner.score.toFixed(3)),
    hero_selection_mode:"HERO_FIRST_PREMIUM_RANKING",
    generated:false
  };
}

export function buildHeroPrompt({inputPayload,direction,variantKey,feedback=null}) {
  const sector=sectorDirection(inputPayload);
  const masterProfile=String(inputPayload?.render_profile||"")==="IMPRESAX_MASTER_V1";
  const masterFullBleed=masterProfile
    ? "IMPRESAX MASTER FULL-BLEED CONTRACT: the ENTIRE 3:2 frame must remain a continuous real photograph with credible material/environment detail from left edge to right edge and top to bottom. ZERO blank copy panels, gray fields, flat gradients baked into the image, empty walls, empty sky, artificial negative-space blocks or split-layout composition. Do NOT reserve a blank side for text. HTML will overlay the copy later. Keep photographic detail underneath the future text area; readability will be handled by a CSS gradient. For construction-materials/rebar imagery, use layered steel/rebar depth across the full width, with the primary material subject spanning the frame and no dead half-frame."
    : "";
  return [
    "Create ONE premium photorealistic editorial hero photograph for a high-end business website.",
    "The image must be visually arresting, commercially credible, realistic and directly relevant to the VERIFIED business context below.",
    "This is illustrative commercial imagery, not documentary proof of an actual company project, premises, employee, client or completed work.",
    "ABSOLUTE NO-TEXT RULE: render ZERO visible letters, words, numbers, logos, signage, labels, UI, watermarks, certification marks, number plates or typographic shapes anywhere in the photograph. Surfaces that would normally contain writing must be blank, turned away, out of focus or non-readable. Do not invent pseudo-text or gibberish.",
    "Avoid obvious AI artifacts, uncanny hands/faces, impossible architecture, oversaturated advertising gloss, generic stock-photo poses and empty decorative scenes.",
    sector,
    masterFullBleed,
    variantComposition(variantKey,inputPayload),
    "This output must be a FULL-FRAME RAW PHOTOGRAPH only — never a web mockup, split-layout graphic, copy panel, poster, collage, UI or composed landing-page hero. Natural breathing room is allowed only when it remains visually subordinate to the verified subject; never let blank sky, wall, floor or air dominate the frame. Strong focal point, premium realistic depth/light/materiality, and a center-safe subject must survive a 390px mobile crop.",
    "Use natural European/Italian visual cues only when compatible with the verified city/context; do not invent a recognizable exact location.",
    "Direction intent: "+clean(direction?.hero_logic||direction?.core_idea,700),
    feedback?"REWORK FEEDBACK FROM PRIOR HERO QA: "+clean(feedback,1200):"",
    "Do not include any written business information in the image. Scene relevance is fully described above."
  ].join("\n");
}

export async function generatePremiumHeroVisual(env,{inputPayload,direction,variantKey,feedback=null,generationAttempt=1,generationCycle=1}) {
  if(String(env.V2_EXTERNAL_AI_ENABLED||"false")!=="true") throw new Error("EXTERNAL_AI_DISABLED_BY_CABINA");
  if(!env.AI) throw new Error("HERO_IMAGE_AI_BINDING_REQUIRED");
  const primary=env.V2_MODEL_HERO_IMAGE||"@cf/black-forest-labs/flux-2-dev";
  const fallback=env.V2_MODEL_HERO_IMAGE_FALLBACK||"@cf/black-forest-labs/flux-2-klein-9b";
  const prompt=buildHeroPrompt({inputPayload,direction,variantKey,feedback});
  const attempt=Math.max(1,Number(generationAttempt)||1);
  const cycle=Math.max(1,Number(generationCycle)||1);
  const deterministicSeed=Math.abs(
    (variantKey.charCodeAt(0)*1009) +
    (cycle*3571) +
    (attempt*7919) +
    (feedback?1543:0)
  );
  let lastError=null;

  for(const model of [primary,fallback]) {
    try {
      let bytes;
      let mime="image/jpeg";

      if(String(model).startsWith("@cf/")) {
        const form=new FormData();
        form.append("prompt",prompt);
        form.append("width","1536");
        form.append("height","1024");
        form.append("guidance","6.0");
        if(String(model).includes("flux-2-dev")) form.append("steps","25");
        form.append("seed",String(deterministicSeed));
        const encoded=new Response(form);
        const contentType=encoded.headers.get("content-type")||"multipart/form-data";
        const response=await env.AI.run(model,{
          multipart:{body:encoded.body,contentType}
        });
        const image=String(response?.image||"").trim();
        if(!image) throw new Error("HERO_IMAGE_EMPTY_RESPONSE");
        bytes=base64ToBytes(image);
        mime=detectImageMime(bytes);
      } else {
        const response=await env.AI.run(model,{
          prompt,
          width:1536,
          height:1024,
          output_format:"jpeg",
          seed:deterministicSeed
        });
        const imageUrl=String(response?.result?.image||response?.image||"").trim();
        if(!imageUrl) throw new Error("HERO_IMAGE_EMPTY_RESPONSE");
        if(imageUrl.startsWith("data:")) {
          const comma=imageUrl.indexOf(",");
          if(comma<0) throw new Error("HERO_IMAGE_INVALID_DATA_URI");
          const header=imageUrl.slice(0,comma);
          const payload=imageUrl.slice(comma+1);
          bytes=header.includes(";base64")?base64ToBytes(payload):new TextEncoder().encode(decodeURIComponent(payload));
          mime=header.match(/^data:([^;,]+)/)?.[1]||detectImageMime(bytes);
        } else {
          const fetched=await fetch(imageUrl,{cf:{cacheTtl:0,cacheEverything:false}});
          if(!fetched.ok) throw new Error("HERO_IMAGE_FETCH_FAILED:"+fetched.status);
          bytes=new Uint8Array(await fetched.arrayBuffer());
          mime=fetched.headers.get("content-type")||detectImageMime(bytes);
        }
      }

      if(!bytes || bytes.byteLength<50000) throw new Error("HERO_IMAGE_TOO_SMALL");
      return {
        bytes,
        mime:mime.startsWith("image/")?mime:detectImageMime(bytes),
        model,
        prompt,
        width:1536,
        height:1024,
        generated:true
      };
    } catch(error) {
      lastError=error;
    }
  }
  throw lastError||new Error("HERO_IMAGE_PROVIDER_FAILURE");
}
