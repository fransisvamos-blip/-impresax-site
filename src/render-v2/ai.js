import { DEFAULT_MODELS, MODEL_ROUTE_VERSION, PROMPT_VERSION, QA_SCORE_KEYS } from "./constants.js";
import { stableStringify, sha256 } from "./utils.js";

function modelFor(env,role,fallback=false) {
  const vars={
    creative:"V2_MODEL_CREATIVE",
    generator:"V2_MODEL_VARIANT_GENERATOR",
    repair:"V2_MODEL_VARIANT_REPAIR",
    visualQa:"V2_MODEL_VISUAL_QA",
    setQa:"V2_MODEL_SET_QA"
  };
  if(fallback) return role==="visualQa"||role==="setQa"
    ? (env.V2_MODEL_VISION_FALLBACK||DEFAULT_MODELS.visionFallback)
    : (env.V2_MODEL_TEXT_FALLBACK||DEFAULT_MODELS.textFallback);
  return env[vars[role]]||DEFAULT_MODELS[role];
}

function extractStructured(result) {
  const candidates=[
    result?.response,
    result?.result?.response,
    result?.choices?.[0]?.message?.parsed,
    result?.choices?.[0]?.message?.content,
    result?.output_text
  ];
  for(const value of candidates) {
    if(value && typeof value==="object" && !Array.isArray(value)) return value;
    if(typeof value==="string") {
      try { return JSON.parse(value); } catch {}
      const a=value.indexOf("{"),b=value.lastIndexOf("}");
      if(a>=0&&b>a) { try{return JSON.parse(value.slice(a,b+1));}catch{} }
    }
  }
  throw new Error("AI_OUTPUT_SCHEMA_INVALID");
}

async function runStructured(env,role,{messages,schema,maxTokens=7000,temperature=0.2,vision=false,beforeAttempt=null}) {
  if(!env.AI) throw new Error("AI_PROVIDER_BINDING_MISSING");
  let lastError=null;
  for(let fallback=0;fallback<2;fallback++) {
    const model=modelFor(env,role,Boolean(fallback));
    if(beforeAttempt) await beforeAttempt({role,model,fallback:Boolean(fallback)});
    try {
      const inference={
        messages,
        response_format:{type:"json_schema",json_schema:schema},
        temperature
      };
      if(/llama-3\.3-70b-instruct-fp8-fast/i.test(model)) inference.max_tokens=maxTokens;
      else inference.max_completion_tokens=maxTokens;
      if(vision && /qwen\/qwen3\.8-27b/i.test(model)) inference.reasoning_effort="medium";
      const runOptions=env.AI_GATEWAY_ID
        ? {gateway:{id:env.AI_GATEWAY_ID,skipCache:true}}
        : undefined;
      const result=await env.AI.run(model,inference,runOptions);
      return {data:extractStructured(result),model,fallback:Boolean(fallback)};
    } catch(error) {
      lastError=error;
    }
  }
  throw lastError||new Error("AI_PROVIDER_FAILURE");
}

const directionSchema={
  type:"object",additionalProperties:false,
  properties:{
    name:{type:"string"},core_idea:{type:"string"},hero_logic:{type:"string"},
    grid:{type:"string"},typography_behavior:{type:"string"},material_language:{type:"string"},
    signature_device:{type:"string"},section_progression:{type:"array",items:{type:"string"}},
    cta_behavior:{type:"string"},mobile_reinterpretation:{type:"string"},
    asset_tokens:{type:"array",items:{type:"string"}},
    fingerprint:{
      type:"object",additionalProperties:false,
      properties:{
        hero_type:{type:"string"},grid_topology:{type:"string"},typography_mode:{type:"string"},
        material_system:{type:"string"},signature_device:{type:"string"},section_rhythm:{type:"string"},
        cta_pattern:{type:"string"},mobile_pattern:{type:"string"}
      },
      required:["hero_type","grid_topology","typography_mode","material_system","signature_device","section_rhythm","cta_pattern","mobile_pattern"]
    }
  },
  required:["name","core_idea","hero_logic","grid","typography_behavior","material_language","signature_device","section_progression","cta_behavior","mobile_reinterpretation","asset_tokens","fingerprint"]
};


const contentTruthSchema={
  type:"object",additionalProperties:false,
  properties:{
    hero_headline:{type:"string"},hero_body:{type:"string"},
    hero_source_refs:{type:"array",minItems:1,items:{type:"string"}},
    services:{type:"array",minItems:1,maxItems:8,items:{
      type:"object",additionalProperties:false,
      properties:{
        title:{type:"string"},description:{type:"string"},
        source_refs:{type:"array",minItems:1,items:{type:"string"}}
      },
      required:["title","description","source_refs"]
    }},
    trust_points:{type:"array",maxItems:8,items:{
      type:"object",additionalProperties:false,
      properties:{text:{type:"string"},source_refs:{type:"array",minItems:1,items:{type:"string"}}},
      required:["text","source_refs"]
    }},
    locality_line:{type:"string"},
    locality_source_refs:{type:"array",minItems:1,items:{type:"string"}},
    primary_cta_label:{type:"string"},secondary_cta_label:{type:"string"},
    footer_line:{type:"string"},prohibited_claims:{type:"array",items:{type:"string"}}
  },
  required:["hero_headline","hero_body","hero_source_refs","services","trust_points","locality_line","locality_source_refs","primary_cta_label","secondary_cta_label","footer_line","prohibited_claims"]
};

const creativeDirectionsSchema={
  type:"object",additionalProperties:false,
  properties:{
    creative_strategy:{type:"string"},
    directions:{
      type:"object",additionalProperties:false,
      properties:{A:directionSchema,B:directionSchema,C:directionSchema},
      required:["A","B","C"]
    }
  },
  required:["creative_strategy","directions"]
};

const truthQaSchema={
  type:"object",additionalProperties:false,
  properties:{
    pass:{type:"boolean"},
    summary:{type:"string"},
    issues:{type:"array",items:{type:"string"}},
    unsupported_modules:{type:"array",items:{type:"string"}}
  },
  required:["pass","summary","issues","unsupported_modules"]
};

function fingerprintSimilarity(a,b) {
  const keys=["hero_type","grid_topology","typography_mode","material_system","signature_device","section_rhythm","cta_pattern","mobile_pattern"];
  const normalize=v=>String(v||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  let same=0;
  for(const k of keys) {
    const A=normalize(a?.[k]),B=normalize(b?.[k]);
    if(A===B) { same++; continue; }
    const as=new Set(A.split(/\s+/).filter(x=>x.length>3));
    const bs=new Set(B.split(/\s+/).filter(x=>x.length>3));
    if(as.size&&bs.size) {
      let inter=0;
      for(const x of as) if(bs.has(x)) inter++;
      const union=as.size+bs.size-inter;
      if(union>0 && inter/union>=0.72) same++;
    }
  }
  return same/keys.length;
}

export function diversityPrecheck(directions) {
  const fp=Object.fromEntries(["A","B","C"].map(k=>[k,directions[k]?.fingerprint||{}]));
  const scores={
    AB:1-fingerprintSimilarity(fp.A,fp.B),
    AC:1-fingerprintSimilarity(fp.A,fp.C),
    BC:1-fingerprintSimilarity(fp.B,fp.C)
  };
  const pass=Object.values(scores).every(v=>v>=0.5);
  return {pass,scores,threshold:0.5};
}

export function validateContentTruthSources(contentTruth,inputPayload) {
  const allowed=new Set((inputPayload?.source_references||[]).map(String));
  const issues=[];
  const check=(label,refs)=>{
    const list=Array.isArray(refs)?refs:[];
    if(!list.length) issues.push("SOURCE_REFS_REQUIRED:"+label);
    for(const ref of list) if(!allowed.has(String(ref))) issues.push("UNVERIFIED_SOURCE_REF:"+label+":"+String(ref));
  };
  check("HERO",contentTruth?.hero_source_refs);
  check("LOCALITY",contentTruth?.locality_source_refs);
  (contentTruth?.services||[]).forEach((s,i)=>check("SERVICE_"+(i+1),s?.source_refs));
  (contentTruth?.trust_points||[]).forEach((s,i)=>check("TRUST_"+(i+1),s?.source_refs));
  return {pass:issues.length===0,issues};
}

export async function createContentTruthPack(env,inputPayload,{beforeModelAttempt=null}={}) {
  const prompt=[
    "Create the definitive factual Content Truth Pack for this ImpresaX prospect.",
    "Use ONLY VERIFIED INPUT. Never invent claims, reviews, premises, people, prices, certifications, years, statistics or capabilities.",
    "Write concise natural Italian suitable for a premium commercial homepage.",
    "Every hero/service/trust/locality factual module MUST cite one or more exact URLs from VERIFIED INPUT source_references.",
    "Never invent, normalize or alter a source URL.",
    "VERIFIED INPUT:",
    JSON.stringify(inputPayload)
  ].join("\n");
  const generated=await runStructured(env,"creative",{
    messages:[
      {role:"system",content:"You are the factual editorial layer of ImpresaX. Truth and exact source grounding are mandatory."},
      {role:"user",content:prompt}
    ],
    schema:contentTruthSchema,maxTokens:4500,temperature:0.12,beforeAttempt:beforeModelAttempt
  });
  const sourceGate=validateContentTruthSources(generated.data,inputPayload);
  if(!sourceGate.pass) throw new Error("CONTENT_TRUTH_SOURCE_INVALID:"+sourceGate.issues.join("|"));

  const reviewer=await runStructured(env,"visualQa",{
    messages:[
      {role:"system",content:"You are an independent factual QA reviewer. Reject any claim not directly supported by VERIFIED INPUT. Output the schema only."},
      {role:"user",content:"VERIFIED INPUT:\n"+JSON.stringify(inputPayload)+"\n\nCONTENT TRUTH PACK:\n"+JSON.stringify(generated.data)}
    ],
    schema:truthQaSchema,maxTokens:1800,temperature:0,beforeAttempt:beforeModelAttempt
  });
  if(reviewer.data.pass!==true || (reviewer.data.issues||[]).length || (reviewer.data.unsupported_modules||[]).length) {
    throw new Error("CONTENT_TRUTH_VERIFICATION_FAILED:"+JSON.stringify({issues:reviewer.data.issues||[],unsupported_modules:reviewer.data.unsupported_modules||[]}));
  }
  return {
    content_truth:generated.data,
    generator_model:generated.model,
    reviewer_model:reviewer.model,
    verification:reviewer.data,
    hash:await sha256(stableStringify(generated.data))
  };
}

export async function createCreativeDirections(env,inputPayload,assetTokens,{beforeModelAttempt=null}={}) {
  const prompt=[
    "Create the single definitive ImpresaX visual strategy for this verified prospect.",
    "Return THREE materially different flagship routes A/B/C.",
    "Available asset tokens are the ONLY images/identity assets variants may use: "+JSON.stringify(assetTokens),
    "If only the identity asset is available, design in ZERO_PHOTO_PREMIUM mode using typography, composition, geometry and materiality instead of invented photography.",
    "A/B/C must differ in hero logic, grid, typography behavior, material language, signature device, section rhythm, CTA integration and mobile reinterpretation.",
    "Do not invent facts. Creative direction is visual/structural; factual copy is supplied separately by the Content Truth Pack.",
    "VERIFIED INPUT:",
    JSON.stringify(inputPayload)
  ].join("\n");
  const r=await runStructured(env,"creative",{
    messages:[
      {role:"system",content:"You are the senior creative director of ImpresaX. Originality, premium art direction, prospect specificity and implementation feasibility are mandatory."},
      {role:"user",content:prompt}
    ],
    schema:creativeDirectionsSchema,maxTokens:6500,temperature:0.32,beforeAttempt:beforeModelAttempt
  });
  const pre=diversityPrecheck(r.data.directions);
  if(!pre.pass) throw new Error("SET_DIVERSITY_PRECHECK_FAILED:"+JSON.stringify(pre.scores));
  const directions=r.data.directions;
  return {
    creative_strategy:r.data.creative_strategy,
    directions,
    fingerprints:Object.fromEntries(["A","B","C"].map(k=>[k,directions[k].fingerprint])),
    diversity_precheck:pre,
    model:r.model,
    hash:await sha256(stableStringify(r.data))
  };
}

export async function combineCreativePlan(contentTruth,directions) {
  const plan={
    content_truth:contentTruth.content_truth,
    creative_strategy:directions.creative_strategy,
    directions:directions.directions,
    fingerprints:directions.fingerprints,
    diversity_precheck:directions.diversity_precheck,
    content_truth_hash:contentTruth.hash,
    creative_directions_hash:directions.hash
  };
  return {plan,hash:await sha256(stableStringify(plan))};
}

export function buildCopyManifest(content) {
  const out={
    HERO_HEADLINE:content.hero_headline,
    HERO_BODY:content.hero_body,
    LOCALITY_LINE:content.locality_line,
    PRIMARY_CTA_LABEL:content.primary_cta_label,
    SECONDARY_CTA_LABEL:content.secondary_cta_label,
    FOOTER_LINE:content.footer_line
  };
  (content.services||[]).forEach((s,i)=>{
    out["SERVICE_"+(i+1)+"_TITLE"]=s.title;
    out["SERVICE_"+(i+1)+"_BODY"]=s.description;
  });
  (content.trust_points||[]).forEach((s,i)=>{ out["TRUST_"+(i+1)]=s.text; });
  return out;
}

const renderSpecSchema={
  type:"object",additionalProperties:false,
  properties:{
    main_html:{type:"string"},
    custom_css:{type:"string"},
    section_ids:{type:"array",items:{type:"string"}},
    used_copy_tokens:{type:"array",items:{type:"string"}},
    used_asset_tokens:{type:"array",items:{type:"string"}},
    implementation_notes:{type:"string"}
  },
  required:["main_html","custom_css","section_ids","used_copy_tokens","used_asset_tokens","implementation_notes"]
};

export async function generateRenderSpec(env,{inputPayload,direction,variantKey,copyManifest,assetTokens,qaFeedback=null,previousSpec=null,beforeModelAttempt=null}) {
  const prompt=[
    "Implement variant "+variantKey+" as a premium full-home visual RenderSpec.",
    "OUTPUT CONTRACT:",
    "- main_html contains ONLY markup for <main>; no html/head/body/header/footer.",
    "- Every visible text node MUST be a token exactly like {{copy:TOKEN_NAME}}. Do not write literal visible copy.",
    "- Images MUST use src={{asset:TOKEN_NAME}} with an available token. Never write URLs.",
    "- CTA hrefs MUST use {{cta:PRIMARY}} or {{cta:SECONDARY}}.",
    "- No scripts, iframes, forms, SVG, external fonts, @import, CSS url(), inline remote URLs.",
    "- custom_css must contain intentional desktop and mobile art direction with @media rules.",
    "- Produce a complete homepage with hero, offering/services, trust/context when available, commercial action and closing contact journey.",
    "- Avoid repeated generic card grids and SaaS template patterns.",
    "COPY TOKENS:",JSON.stringify(Object.keys(copyManifest)),
    "ASSET TOKENS:",JSON.stringify(assetTokens),
    "VERIFIED INPUT:",JSON.stringify(inputPayload),
    "DIRECTION:",JSON.stringify(direction),
    qaFeedback?"REWORK FEEDBACK:"+JSON.stringify(qaFeedback):"",
    previousSpec?"PREVIOUS SPEC TO SURGICALLY IMPROVE:"+JSON.stringify(previousSpec):""
  ].join("\n");
  const role=qaFeedback?"repair":"generator";
  const r=await runStructured(env,role,{
    messages:[
      {role:"system",content:"You are a world-class frontend art director. Follow the tokenized RenderSpec contract exactly; never invent facts or external assets."},
      {role:"user",content:prompt}
    ],
    schema:renderSpecSchema,maxTokens:12000,temperature:qaFeedback?0.16:0.28,beforeAttempt:beforeModelAttempt
  });
  return {spec:r.data,model:r.model};
}

const qaScores=Object.fromEntries(QA_SCORE_KEYS.map(k=>[k,{type:"number",minimum:0,maximum:10}]));
const visualQaSchema={
  type:"object",additionalProperties:false,
  properties:{
    pass:{type:"boolean"},summary:{type:"string"},
    issues:{type:"array",items:{
      type:"object",additionalProperties:false,
      properties:{code:{type:"string"},severity:{type:"string",enum:["critical","major","minor"]},target:{type:"string"},message:{type:"string"}},
      required:["code","severity","target","message"]
    }},
    actions:{type:"array",items:{type:"string"}},
    scores:{type:"object",additionalProperties:false,properties:qaScores,required:QA_SCORE_KEYS}
  },
  required:["pass","summary","issues","actions","scores"]
};

export async function runVisualQa(env,{inputPayload,direction,variantKey,desktopB64,mobileB64,beforeModelAttempt=null}) {
  const text=[
    "Judge the ACTUAL desktop and mobile screenshots for ImpresaX.",
    "PASS only when every score is >=8 and there are no critical/major unresolved issues.",
    "Hard fail generic template/SaaS feel, weak typography/composition, fake or cheap imagery, weak mobile reinterpretation, poor brand fidelity, truth risk, or lack of prospect specificity.",
    "VARIANT:"+variantKey,
    "DIRECTION:"+JSON.stringify(direction),
    "VERIFIED INPUT:"+JSON.stringify(inputPayload)
  ].join("\n");
  const r=await runStructured(env,"visualQa",{
    messages:[
      {role:"system",content:"You are an independent, strict senior visual-design review board. Do not pass mediocre work."},
      {role:"user",content:[
        {type:"text",text},
        {type:"image_url",image_url:{url:"data:image/jpeg;base64,"+desktopB64}},
        {type:"image_url",image_url:{url:"data:image/jpeg;base64,"+mobileB64}}
      ]}
    ],
    schema:visualQaSchema,maxTokens:2600,temperature:0.05,vision:true,beforeAttempt:beforeModelAttempt
  });
  const min=Math.min(...QA_SCORE_KEYS.map(k=>Number(r.data.scores?.[k]??0)));
  const hardIssues=(r.data.issues||[]).filter(x=>x.severity==="critical"||x.severity==="major");
  const pass=r.data.pass===true && min>=8 && hardIssues.length===0;
  return {...r.data,pass,model:r.model,min_score:min};
}

const setQaSchema={
  type:"object",additionalProperties:false,
  properties:{
    pass:{type:"boolean"},summary:{type:"string"},
    weakest_variant:{type:"string",enum:["A","B","C","NONE"]},
    issues:{type:"array",items:{type:"string"}},
    actions:{type:"array",items:{type:"string"}},
    scores:{
      type:"object",additionalProperties:false,
      properties:{
        set_quality:{type:"number"},diversity_ab:{type:"number"},diversity_ac:{type:"number"},diversity_bc:{type:"number"},
        prospect_fit_a:{type:"number"},prospect_fit_b:{type:"number"},prospect_fit_c:{type:"number"}
      },
      required:["set_quality","diversity_ab","diversity_ac","diversity_bc","prospect_fit_a","prospect_fit_b","prospect_fit_c"]
    }
  },
  required:["pass","summary","weakest_variant","issues","actions","scores"]
};

export async function runSetQa(env,{inputPayload,frames,beforeModelAttempt=null}) {
  const content=[{type:"text",text:"Judge A/B/C as a SET. PASS only if all are premium, prospect-specific and materially different. Identify the weaker conflicting variant if diversity fails. VERIFIED INPUT:"+JSON.stringify(inputPayload)}];
  for(const key of ["A","B","C"]) {
    content.push({type:"text",text:"VARIANT "+key+" DESKTOP"});
    content.push({type:"image_url",image_url:{url:"data:image/jpeg;base64,"+frames[key].desktop}});
    content.push({type:"text",text:"VARIANT "+key+" MOBILE"});
    content.push({type:"image_url",image_url:{url:"data:image/jpeg;base64,"+frames[key].mobile}});
  }
  const r=await runStructured(env,"setQa",{
    messages:[
      {role:"system",content:"You are the ImpresaX cross-variant jury. Detect cosmetic variations, reused composition and generic template families."},
      {role:"user",content}
    ],
    schema:setQaSchema,maxTokens:2200,temperature:0.04,vision:true,beforeAttempt:beforeModelAttempt
  });
  const vals=Object.values(r.data.scores||{}).map(Number);
  const pass=r.data.pass===true && vals.length===7 && vals.every(v=>Number.isFinite(v)&&v>=8) && (r.data.issues||[]).length===0;
  return {...r.data,pass,model:r.model};
}

export const AI_CONTRACT_META={MODEL_ROUTE_VERSION,PROMPT_VERSION};
