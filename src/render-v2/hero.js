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

  if(/materiali|ingrosso|distribuz|tondo|cemento armato|rebar|acciaio|fornitur/.test(hay) && /edil|costruz|cement|materiali|rebar|tondo/.test(hay)) {
    return "Show a believable premium B2B construction-materials and rebar-supply context: an organized Italian building-materials yard, warehouse or processing/logistics environment; quality pallets/materials, steel reinforcing bars or rebar processing only when visually natural, professional material handling or commercial supervision. Communicate scale, reliability, supply and technical capability. Do NOT portray the company as the builder of a luxury villa or claim a completed construction project that is not verified. Avoid generic office stock imagery.";
  }
  if(/edil|costruz|ristruttur|cantiere|immobil|architett/.test(hay)) {
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
  const sector=sectorDirection(inputPayload);
  return [
    "Create ONE premium photorealistic editorial hero photograph for a high-end business website.",
    "The image must be visually arresting, commercially credible, realistic and directly relevant to the VERIFIED business context below.",
    "This is illustrative commercial imagery, not documentary proof of an actual company project, premises, employee, client or completed work.",
    "ABSOLUTE NO-TEXT RULE: render ZERO visible letters, words, numbers, logos, signage, labels, UI, watermarks, certification marks, number plates or typographic shapes anywhere in the photograph. Surfaces that would normally contain writing must be blank, turned away, out of focus or non-readable. Do not invent pseudo-text or gibberish.",
    "Avoid obvious AI artifacts, uncanny hands/faces, impossible architecture, oversaturated advertising gloss, generic stock-photo poses and empty decorative scenes.",
    sector,
    variantComposition(variantKey),
    "Composition must work as a website hero: strong focal point, premium depth/light/materiality, and a clean area for headline + CTA. It must also survive a 390px mobile crop without losing the main subject.",
    "Use natural European/Italian visual cues only when compatible with the verified city/context; do not invent a recognizable exact location.",
    "Direction intent: "+clean(direction?.hero_logic||direction?.core_idea,700),
    feedback?"REWORK FEEDBACK FROM PRIOR HERO QA: "+clean(feedback,1200):"",
    "Do not include any written business information in the image. Scene relevance is fully described above."
  ].join("\n");
}

export async function generatePremiumHeroVisual(env,{inputPayload,direction,variantKey,feedback=null}) {
  if(!env.AI) throw new Error("HERO_IMAGE_AI_BINDING_REQUIRED");
  const primary=env.V2_MODEL_HERO_IMAGE||"black-forest-labs/flux-2-pro-preview";
  const fallback=env.V2_MODEL_HERO_IMAGE_FALLBACK||"@cf/black-forest-labs/flux-2-klein-9b";
  const prompt=buildHeroPrompt({inputPayload,direction,variantKey,feedback});
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
        form.append("guidance","5.5");
        form.append("seed",String(Math.abs((variantKey.charCodeAt(0)*1009)+(feedback?7919:3571))));
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
          seed:Math.abs((variantKey.charCodeAt(0)*1009)+(feedback?7919:3571))
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
