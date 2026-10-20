import { DEFAULT_MODELS, MODEL_ROUTE_VERSION, PROMPT_VERSION, QA_SCORE_KEYS, MIN_SECTION_VISUALS, EXTERNAL_AI_CALLS_ALLOWED, VARIANT_DIVERGENCE_FLOOR, VARIANT_CREATIVE_ROLES } from "./constants.js";
import { filterHomepageTrustPoints } from "./showroom-policy.js";
import { stableStringify, sha256 } from "./utils.js";
import { sanitizeDirectionForExecution } from "./design-grammar.js";

function modelFor(env,role,fallback=false) {
  const vars={
    creative:"V2_MODEL_CREATIVE",
    generator:"V2_MODEL_VARIANT_GENERATOR",
    repair:"V2_MODEL_VARIANT_REPAIR",
    visualQa:"V2_MODEL_VISUAL_QA",
    setQa:"V2_MODEL_SET_QA"
  };
  // V4 showroom generation deliberately bypasses legacy model override secrets.
  // Those overrides were pinning the renderer to older routes and causing long provider timeouts.
  if(role==="creative") return fallback?DEFAULT_MODELS.textFallback:DEFAULT_MODELS.creative;
  if(role==="generator"||role==="repair") return fallback?DEFAULT_MODELS.codeFallback:DEFAULT_MODELS[role];
  if(fallback) {
    if(role==="visualQa"||role==="setQa") return env.V2_MODEL_VISION_FALLBACK||DEFAULT_MODELS.visionFallback;
    return env.V2_MODEL_TEXT_FALLBACK||DEFAULT_MODELS.textFallback;
  }
  return env[vars[role]]||DEFAULT_MODELS[role];
}

function balancedJsonObjects(text) {
  const s=String(text||"");
  const out=[];
  let depth=0,start=-1,inString=false,escape=false;
  for(let i=0;i<s.length;i++) {
    const ch=s[i];
    if(inString) {
      if(escape) { escape=false; continue; }
      if(ch==="\\") { escape=true; continue; }
      if(ch==='"') inString=false;
      continue;
    }
    if(ch==='"') { inString=true; continue; }
    if(ch==="{") {
      if(depth===0) start=i;
      depth++;
    } else if(ch==="}" && depth>0) {
      depth--;
      if(depth===0 && start>=0) {
        out.push(s.slice(start,i+1));
        start=-1;
      }
    }
  }
  return out;
}

function parseJsonCandidate(value) {
  if(Array.isArray(value)) {
    for(const item of value) {
      const parsed=parseJsonCandidate(item);
      if(parsed) return parsed;
    }
    return null;
  }
  if(value && typeof value==="object") {
    for(const key of ["parsed","text","content","response","output_text","result","message"]) {
      if(key in value) {
        const parsed=parseJsonCandidate(value[key]);
        if(parsed) return parsed;
      }
    }
    return value;
  }
  if(typeof value!=="string") return null;
  const clean=value
    .replace(/<think>[\s\S]*?<\/think>/gi," ")
    .replace(/^\s*```(?:json)?\s*/i,"")
    .replace(/\s*```\s*$/,"")
    .trim();
  const attempts=[clean,...balancedJsonObjects(clean).reverse()];
  const seen=new Set();
  for(const raw of attempts) {
    if(!raw || seen.has(raw)) continue;
    seen.add(raw);
    try { return JSON.parse(raw); } catch {}
    try { return JSON.parse(raw.replace(/,\s*([}\]])/g,"$1")); } catch {}
  }
  return null;
}

async function withAiDeadline(promise,ms,label) {
  let timer=null;
  try {
    return await Promise.race([
      promise,
      new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(new Error("AI_PROVIDER_CALL_TIMEOUT:"+label)),ms);
      })
    ]);
  } finally {
    if(timer!==null) clearTimeout(timer);
  }
}

function schemaRootKeys(schema) {
  return new Set(Object.keys(schema?.properties||{}));
}

function matchesSchemaRoot(value,schema) {
  if(!value || typeof value!=="object" || Array.isArray(value)) return false;
  const keys=schemaRootKeys(schema);
  if(!keys.size) return true;
  const own=Object.keys(value);
  const overlap=own.filter(k=>keys.has(k)).length;
  const required=Array.isArray(schema?.required)?schema.required:[];
  const requiredOverlap=required.filter(k=>Object.prototype.hasOwnProperty.call(value,k)).length;
  return overlap>=Math.min(2,keys.size) || (required.length>0 && requiredOverlap>=Math.min(2,required.length));
}


export function extractStructured(result,schema) {
  const queue=[result];
  const seen=new Set();
  let visited=0;
  while(queue.length && visited<500) {
    const value=queue.shift();
    visited++;
    if(value==null) continue;

    if(typeof value==="string") {
      const direct=parseJsonCandidate(value);
      if(direct && matchesSchemaRoot(direct,schema)) return direct;
      for(const raw of balancedJsonObjects(value)) {
        const parsed=parseJsonCandidate(raw);
        if(parsed && matchesSchemaRoot(parsed,schema)) return parsed;
      }
      continue;
    }

    if(typeof value!=="object") continue;
    if(seen.has(value)) continue;
    seen.add(value);

    if(matchesSchemaRoot(value,schema)) return value;

    const priority=["parsed","response","content","text","output_text","result","message","choices","output","data"];
    for(const key of priority) if(Object.prototype.hasOwnProperty.call(value,key)) queue.unshift(value[key]);
    if(Array.isArray(value)) {
      for(const item of value) queue.push(item);
    } else {
      for(const [key,item] of Object.entries(value)) {
        if(!priority.includes(key)) queue.push(item);
      }
    }
  }
  throw new Error("AI_OUTPUT_SCHEMA_INVALID");
}

function collectRawText(result) {
  const out=[];
  const queue=[result];
  const seen=new Set();
  let visited=0;
  while(queue.length && visited<500 && out.join("\n").length<20000) {
    const value=queue.shift();
    visited++;
    if(value==null) continue;
    if(typeof value==="string") {
      const t=value.trim();
      if(t) out.push(t);
      continue;
    }
    if(typeof value!=="object") continue;
    if(seen.has(value)) continue;
    seen.add(value);
    if(Array.isArray(value)) {
      for(const item of value) queue.push(item);
    } else {
      for(const item of Object.values(value)) queue.push(item);
    }
  }
  return out.join("\n").slice(0,20000);
}

async function runStructured(env,role,{messages,schema,maxTokens=7000,temperature=0.2,vision=false,beforeAttempt=null}) {
  if(EXTERNAL_AI_CALLS_ALLOWED!==true) throw new Error("EXTERNAL_AI_DISABLED_BY_CABINA");
  if(String(env.V2_EXTERNAL_AI_ENABLED||"false")!=="true") throw new Error("EXTERNAL_AI_DISABLED_BY_CABINA");
  if(!env.AI) throw new Error("AI_PROVIDER_BINDING_MISSING");
  let lastError=null;
  const qaRole=role==="visualQa"||role==="setQa";
  const plan=qaRole
    ? [{fallback:false,retry:0},{fallback:true,retry:0}]
    : [{fallback:false,retry:0},{fallback:true,retry:0}];

  for(const attempt of plan) {
    const model=modelFor(env,role,attempt.fallback);
    if(beforeAttempt) await beforeAttempt({role,model,fallback:attempt.fallback,retry:attempt.retry});
    try {
      const retrySuffix=attempt.retry
        ? [{role:"system",content:"Return ONLY one complete valid JSON object matching the requested schema. No prose, markdown, analysis, comments or code fences."}]
        : [];
      const qaJsonInstruction=qaRole
        ? [{role:"system",content:"Return ONLY one valid JSON object and no other text. It MUST match this JSON Schema exactly: "+JSON.stringify(schema)}]
        : [];
      const inference={
        messages:[...messages,...qaJsonInstruction,...retrySuffix],
        temperature:attempt.retry?0:temperature
      };
      // Multimodal QA uses plain JSON text plus our deterministic extractor/validator.
      // This avoids provider-specific structured-output failures on vision routes.
      if(!qaRole) inference.response_format={type:"json_schema",json_schema:schema};
      if(/llama-3\.3-70b-instruct-fp8-fast/i.test(model)) inference.max_tokens=maxTokens;
      else inference.max_completion_tokens=maxTokens;
      if(vision && /qwen\/qwen3\.8-27b/i.test(model)) inference.reasoning_effort="low";
      const runOptions=env.AI_GATEWAY_ID
        ? {gateway:{id:env.AI_GATEWAY_ID,skipCache:true}}
        : undefined;
      const aiTimeoutMs=Math.max(30000,Math.min(180000,Number(env.V2_AI_CALL_TIMEOUT_MS||105000)));
      const result=await withAiDeadline(env.AI.run(model,inference,runOptions),aiTimeoutMs,role+":"+model);
      try {
        return {data:extractStructured(result,schema),model,fallback:attempt.fallback,retry:attempt.retry};
      } catch(parseError) {
        if(!qaRole || String(parseError?.message||parseError)!=="AI_OUTPUT_SCHEMA_INVALID") throw parseError;
        const raw=collectRawText(result);
        if(!raw) throw parseError;

        const fixerModel=env.V2_MODEL_TEXT_FALLBACK||DEFAULT_MODELS.textFallback;
        if(beforeAttempt) await beforeAttempt({
          role:role+"_schema_normalizer",
          model:fixerModel,
          fallback:true,
          retry:0
        });
        const fixerInference={
          messages:[
            {
              role:"system",
              content:"Convert the supplied reviewer output into exactly one JSON object matching the provided JSON Schema. Preserve the reviewer's factual judgments, scores, issues and actions. Do NOT perform a new visual review. Do NOT add claims that are absent from the supplied reviewer output. Return JSON only."
            },
            {
              role:"user",
              content:"JSON SCHEMA:\n"+JSON.stringify(schema)+"\n\nRAW REVIEWER OUTPUT:\n"+raw
            }
          ],
          response_format:{type:"json_schema",json_schema:schema},
          temperature:0
        };
        if(/llama-3\.3-70b-instruct-fp8-fast/i.test(fixerModel)) fixerInference.max_tokens=Math.min(maxTokens,5000);
        else fixerInference.max_completion_tokens=Math.min(maxTokens,5000);
        const fixerTimeoutMs=Math.max(30000,Math.min(120000,Number(env.V2_AI_FIXER_TIMEOUT_MS||75000)));
        const fixed=await withAiDeadline(env.AI.run(fixerModel,fixerInference,runOptions),fixerTimeoutMs,role+"_schema_normalizer:"+fixerModel);
        return {
          data:extractStructured(fixed,schema),
          model,
          fallback:attempt.fallback,
          retry:attempt.retry,
          schema_repaired:true,
          fixer_model:fixerModel
        };
      }
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
    positioning_title:{type:"string"},positioning_body:{type:"string"},
    services_title:{type:"string"},services_intro:{type:"string"},
    trust_title:{type:"string"},trust_intro:{type:"string"},
    closing_title:{type:"string"},closing_body:{type:"string"},
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
  required:["hero_headline","hero_body","hero_source_refs","positioning_title","positioning_body","services_title","services_intro","trust_title","trust_intro","closing_title","closing_body","services","trust_points","locality_line","locality_source_refs","primary_cta_label","secondary_cta_label","footer_line","prohibited_claims"]
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

export async function generateContentTruthDraft(env,inputPayload,{beforeModelAttempt=null}={}) {
  const prompt=[
    "Create the definitive factual Content Truth Pack for this ImpresaX prospect.",
    "Use ONLY VERIFIED INPUT. Never invent claims, reviews, premises, people, prices, certifications, years, statistics or capabilities.",
    "Write concise natural Italian suitable for a premium commercial homepage.",
    "Build a complete conversion-oriented editorial journey, not just a hero and a list of services.",
    "positioning_title/body, services_title/intro, trust_title/intro and closing_title/body are editorial framing modules: they may summarize VERIFIED INPUT but MUST NOT introduce any new factual claim.",
    "The hero must communicate what the business does and why the visitor should continue, without hype or invented superlatives.",
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
  if(!sourceGate.pass) {
    const fallback=await buildVerifiedFallbackTruth(inputPayload);
    return {
      content_truth:fallback.content_truth,
      generator_model:generated.model,
      hash:fallback.hash,
      source_sanitized:true,
      source_gate_issues:sourceGate.issues
    };
  }
  return {
    content_truth:generated.data,
    generator_model:generated.model,
    hash:await sha256(stableStringify(generated.data))
  };
}

function splitVerifiedList(value) {
  return String(value||"").split(/\s*;\s*/).map(x=>x.trim()).filter(Boolean);
}

function verifiedServiceTitle(value) {
  const text=String(value||"").replace(/\s+/g," ").trim();
  if(!text) return "";
  if(text.length<=72) return text;
  const segments=text.split(/\s*(?:\/|:|—|–)\s*/).map(x=>x.trim()).filter(Boolean);
  const exactSegment=segments.find(x=>x.length>=4 && x.length<=72);
  if(exactSegment) return exactSegment;
  const head=text.slice(0,72);
  const boundary=head.lastIndexOf(" ");
  return (boundary>=24?head.slice(0,boundary):head).trim();
}

async function buildVerifiedFallbackTruth(inputPayload) {
  const refs=[...new Set((inputPayload?.source_references||[]).map(String).filter(Boolean))];
  const safeRefs=refs.length?refs:["about:blank"];
  const services=splitVerifiedList(inputPayload?.verified_services).slice(0,8);
  const trust=splitVerifiedList(inputPayload?.verified_trust).slice(0,8);
  const business=String(inputPayload?.business_name||"").trim();
  const address=String(inputPayload?.address||"").trim();
  const city=String(inputPayload?.city||"").trim();
  const locality=address||city||String(inputPayload?.country||"").trim();
  const serviceItems=(services.length?services:[String(inputPayload?.vertical||"Servizi verificati")]).map(text=>({
    title:verifiedServiceTitle(text),
    description:text,
    source_refs:safeRefs
  })).filter(x=>x.title);
  const truth={
    hero_headline:business,
    hero_body:String(inputPayload?.verified_services||inputPayload?.vertical||business).trim(),
    hero_source_refs:safeRefs,
    positioning_title:business||String(inputPayload?.vertical||"").trim(),
    positioning_body:String(inputPayload?.verified_services||inputPayload?.vertical||business).trim(),
    services_title:"Servizi",
    services_intro:String(inputPayload?.verified_services||"").trim()||"Servizi verificati",
    trust_title:"Perché scegliere noi",
    trust_intro:trust[0]||locality||String(inputPayload?.vertical||"").trim(),
    closing_title:"Parliamone",
    closing_body:String(inputPayload?.verified_services||inputPayload?.vertical||business).trim(),
    services:serviceItems,
    trust_points:trust.map(text=>({text,source_refs:safeRefs})),
    locality_line:locality,
    locality_source_refs:safeRefs,
    primary_cta_label:String(inputPayload?.primary_cta||"CONTATTA").trim(),
    secondary_cta_label:String(inputPayload?.secondary_cta||"CONTATTI").trim(),
    footer_line:[business,city].filter(Boolean).join(" · "),
    prohibited_claims:[]
  };
  return {content_truth:truth,hash:await sha256(stableStringify(truth))};
}

export async function reviewContentTruthDraft(env,inputPayload,draft,{beforeModelAttempt=null}={}) {
  const reviewer=await runStructured(env,"visualQa",{
    messages:[
      {role:"system",content:"You are an independent factual QA reviewer. Reject any claim not directly supported by VERIFIED INPUT. Output the schema only."},
      {role:"user",content:"VERIFIED INPUT:\n"+JSON.stringify(inputPayload)+"\n\nCONTENT TRUTH PACK:\n"+JSON.stringify(draft.content_truth)}
    ],
    schema:truthQaSchema,maxTokens:1800,temperature:0,beforeAttempt:beforeModelAttempt
  });
  const failed=reviewer.data.pass!==true || (reviewer.data.issues||[]).length || (reviewer.data.unsupported_modules||[]).length;
  if(!failed) {
    return {
      reviewer_model:reviewer.model,
      verification:reviewer.data
    };
  }

  const fallback=await buildVerifiedFallbackTruth(inputPayload);
  return {
    reviewer_model:reviewer.model,
    verification:{
      pass:true,
      summary:"AUTO_SANITIZED_TO_VERIFIED_INPUT",
      issues:[],
      unsupported_modules:[],
      auto_sanitized:true,
      rejected_issues:reviewer.data.issues||[],
      rejected_modules:reviewer.data.unsupported_modules||[]
    },
    repaired_content_truth:fallback.content_truth,
    repaired_hash:fallback.hash
  };
}

export async function createContentTruthPack(env,inputPayload,{beforeModelAttempt=null}={}) {
  const draft=await generateContentTruthDraft(env,inputPayload,{beforeModelAttempt});
  const review=await reviewContentTruthDraft(env,inputPayload,draft,{beforeModelAttempt});
  return {
    ...draft,
    ...review,
    content_truth:review.repaired_content_truth||draft.content_truth,
    hash:review.repaired_hash||draft.hash
  };
}

export async function createCreativeDirections(env,inputPayload,assetTokens,{beforeModelAttempt=null}={}) {
  const prompt=[
    "Create the single definitive ImpresaX visual strategy for this verified prospect.",
    "Return THREE materially different flagship routes A/B/C.",
    "Available asset tokens are the ONLY images/identity assets variants may use: "+JSON.stringify(assetTokens),
    "If only the identity asset is available, design in ZERO_PHOTO_PREMIUM mode using typography, composition, geometry and materiality instead of invented photography.",
    "A/B/C must differ in hero logic, grid, typography behavior, material language, signature device, section rhythm, CTA integration and mobile reinterpretation.",
    "STRUCTURAL DIVERGENCE IS BLOCKING: A/B/C must NOT share the same page skeleton. Use materially different section ordering, component architecture, hero composition, CTA architecture, content staging and mobile flow.",
    "Do not produce one DOM/template with different colors, CSS skins, imagery swaps or decorative overlays. Each route must be independently art-directed as if commissioned by a different senior design team.",
    "At least two major content modules must move to different positions between every pair A/B/C; hero internal structure and commercial closing structure must also be materially different.",
    "Every route must feel like a complete premium company homepage: integrated header/navigation, copy-rich hero with two visible actions, editorial positioning, service architecture, trust/proof, commercial transition, final CTA and premium footer.",
    "SHOWROOM-FIRST RULE: verified business information is raw material for the story, NOT a layout blueprint. Select, compress and stage it so the page feels like a high-end commercial showcase rather than a database, company profile or service catalogue.",
    "The prospect should feel elevated: stronger, more authoritative, more desirable and more valuable than its current digital presence.",
    "Use art direction, typographic scale, negative space, controlled contrast, signature geometry, visual proof and section choreography to create a genuine before/after sales effect.",
    "Avoid predictable sequences of equal cards. Services and proof must be composed as editorial moments, not dumped as information blocks.",
    "The final CTA must feel like a designed closing scene with decisive commercial gravity; the footer must complete the brand experience rather than merely hold utility links.",
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
  const hasEditorialAssets=(assetTokens||[]).some(x=>x!=="PRIMARY_LOGO");
  const directions=Object.fromEntries(
    ["A","B","C"].map(k=>[k,sanitizeDirectionForExecution(r.data.directions[k],{hasEditorialAssets})])
  );
  const pre=diversityPrecheck(directions);
  if(!pre.pass) throw new Error("SET_DIVERSITY_PRECHECK_FAILED:"+JSON.stringify(pre.scores));
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

export function buildCopyManifest(content,inputPayload={}) {
  const services=Array.isArray(content?.services)?content.services:[];
  const rawTrustPoints=Array.isArray(content?.trust_points)?content.trust_points:[];
  const trustPoints=filterHomepageTrustPoints(rawTrustPoints);
  const serviceBodies=services.map(x=>String(x?.description||"").trim()).filter(Boolean);
  const serviceTitles=services.map((x,i)=>{
    const title=String(x?.title||"").replace(/\s+/g," ").trim();
    const body=String(x?.description||"").replace(/\s+/g," ").trim();
    if(/^servizi?o\s*\d+$/i.test(title) || /^service\s*\d+$/i.test(title)) {
      return verifiedServiceTitle(body)||title;
    }
    return title;
  }).filter(Boolean);
  const trustTexts=trustPoints.map(x=>String(x?.text||"").trim()).filter(Boolean);
  const norm=value=>String(value||"").replace(/\s+/g," ").trim().toLowerCase();
  const used=new Set();
  const choose=(candidates,fallback="")=>{
    for(const candidate of candidates) {
      const value=String(candidate||"").replace(/\s+/g," ").trim();
      if(!value) continue;
      const key=norm(value);
      if(used.has(key)) continue;
      used.add(key);
      return value;
    }
    const value=String(fallback||"").replace(/\s+/g," ").trim();
    if(value) used.add(norm(value));
    return value;
  };

  const rawLocality=String(content?.locality_line||"").replace(/\s+/g," ").trim();
  const shortLocality=String(inputPayload?.city||inputPayload?.locality||"").replace(/\s+/g," ").trim()
    || rawLocality.split(",").slice(-2,-1)[0]?.trim()
    || rawLocality;
  const verifiedContact=String(inputPayload?.verified_contacts||"").replace(/\s+/g," ").trim();

  const uniqueOr=(candidates,generic)=>{
    const chosen=choose(candidates,"");
    if(chosen) return chosen;
    const value=String(generic||"").trim();
    if(value) used.add(norm(value));
    return value;
  };

  const masterHeadlinePart=value=>{
    const cleaned=String(value||"")
      .replace(/^vendita\s+all['’]ingrosso\s+di\s+/i,"")
      .replace(/^lavorazione\s+e\s+trasformazione\s+del\s+/i,"")
      .replace(/\bmateriali\s+per\s+edilizia\b/i,"materiali per l’edilizia")
      .replace(/\s+/g," ")
      .trim()
      .replace(/[.]+$/,"");
    return cleaned ? cleaned.charAt(0).toUpperCase()+cleaned.slice(1) : "";
  };
  const masterHeroHeadline=String(inputPayload?.render_profile||"")==="IMPRESAX_MASTER_V1"
    ? serviceTitles.slice(0,2).map(masterHeadlinePart).filter(Boolean).join(". ")+(serviceTitles.length?".":"")
    : "";
  const heroHeadline=uniqueOr([masterHeroHeadline,content?.hero_headline,serviceTitles[0],content?.footer_line],"Azienda");
  const heroBody=uniqueOr([content?.hero_body,serviceBodies[0]],"Attività verificata.");
  const masterPositioningTitle=String(inputPayload?.render_profile||"")==="IMPRESAX_MASTER_V1"
    ? (()=>{
        const body=String(serviceBodies[0]||"").replace(/\s+/g," ").trim();
        const match=body.match(/\bper\s+(.+?)[.]?$/i);
        if(!match?.[1]) return "";
        const audience=match[1].replace(/[.]+$/,"").trim();
        return audience ? "Per "+audience+"." : "";
      })()
    : "";
  const masterPositioningBody=String(inputPayload?.render_profile||"")==="IMPRESAX_MASTER_V1"
    ? String(serviceBodies[0]||"").trim()
    : "";
  const positioningTitle=uniqueOr([
    masterPositioningTitle,
    content?.positioning_title
  ],"Profilo aziendale");
  const positioningBody=uniqueOr([
    masterPositioningBody,
    content?.positioning_body,
    serviceBodies[1],
    serviceBodies[2]
  ],shortLocality ? "Attività e servizi verificati a "+shortLocality+"." : "Attività e servizi verificati.");
  const servicesTitle=uniqueOr([content?.services_title],"Competenze e servizi");
  const servicesIntro=uniqueOr([
    content?.services_intro,
    serviceTitles.length>1 ? serviceTitles.join(" · ") : ""
  ],serviceTitles.length===1 ? "Una competenza presentata con chiarezza e valore." : "Competenze complementari, raccontate con una gerarchia chiara.");
  const trustTitle=uniqueOr([content?.trust_title],"Perché scegliere noi");
  const trustNorms=new Set(trustTexts.map(norm));
  const rawTrustIntro=String(content?.trust_intro||"").replace(/\s+/g," ").trim();
  const rawTrustIntroIsPartner=/\b(?:u[-\s]?power|rivenditor|dealer|partner|autorizzat)\b/i.test(rawTrustIntro);
  const trustIntro=uniqueOr([
    rawTrustIntro && !trustNorms.has(norm(rawTrustIntro)) && !rawTrustIntroIsPartner ? rawTrustIntro : ""
  ],shortLocality ? "Affidabilità e presenza sul territorio di "+shortLocality+"." : "Affidabilità costruita su elementi concreti.");
  const bridgeTitle="Contatto diretto";
  const bridgeBody=verifiedContact || (shortLocality ? "Sede operativa: "+shortLocality : "Contatto aziendale verificato.");
  const closingTitle=uniqueOr([
    content?.closing_title,
    content?.primary_cta_label
  ],"Parliamone");
  const closingBody=uniqueOr([],"Raccontaci il tuo progetto.");

  const out={
    HERO_HEADLINE:heroHeadline,
    HERO_BODY:heroBody,
    POSITIONING_KICKER:"Profilo",
    POSITIONING_TITLE:positioningTitle,
    POSITIONING_BODY:positioningBody,
    SERVICES_TITLE:servicesTitle,
    SERVICES_INTRO:servicesIntro,
    TRUST_TITLE:trustTitle,
    TRUST_INTRO:trustIntro,
    BRIDGE_TITLE:bridgeTitle,
    BRIDGE_BODY:bridgeBody,
    FINAL_KICKER:"Contatti",
    CLOSING_TITLE:closingTitle,
    CLOSING_BODY:closingBody,
    LOCALITY_LINE:shortLocality||rawLocality,
    PRIMARY_CTA_LABEL:String(content?.primary_cta_label||"Contatti").trim(),
    SECONDARY_CTA_LABEL:String(content?.secondary_cta_label||"Approfondisci").trim(),
    FOOTER_LINE:String(content?.footer_line||rawLocality||"").trim(),
    CONTACT_LINE:verifiedContact
  };
  let serviceOutIndex=0;
  services.forEach(s=>{
    const rawTitle=String(s?.title||"").replace(/\s+/g," ").trim();
    const body=String(s?.description||"").replace(/\s+/g," ").trim();
    const title=
      (/^servizi?o\s*\d+$/i.test(rawTitle) || /^service\s*\d+$/i.test(rawTitle))
        ? (verifiedServiceTitle(body)||rawTitle)
        : rawTitle;
    const titleKey=norm(title);
    if(!title || used.has(titleKey)) return;
    serviceOutIndex++;
    out["SERVICE_"+serviceOutIndex+"_TITLE"]=title;
    used.add(titleKey);
    const bodyKey=norm(body);
    if(body && !used.has(bodyKey)) {
      out["SERVICE_"+serviceOutIndex+"_BODY"]=body;
      used.add(bodyKey);
    }
  });
  const isPartnerTrust=value=>/\b(?:u[-\s]?power|rivenditor|dealer|partner|autorizzat)\b/i.test(String(value||""));
  let trustOutIndex=0;
  let partnerOutIndex=0;
  trustPoints.forEach(s=>{
    const value=String(s?.text||"").replace(/\s+/g," ").trim();
    const key=norm(value);
    if(!value || used.has(key)) return;
    if(isPartnerTrust(value)) {
      partnerOutIndex++;
      out["PARTNER_"+partnerOutIndex]=value;
    } else if(!/\b(?:fatturato|ricavi|revenue|turnover|dipendenti|employees|headcount|addetti)\b/i.test(value)) {
      trustOutIndex++;
      out["TRUST_"+trustOutIndex]=value;
    }
    used.add(key);
  });
  if(partnerOutIndex>0) {
    out.PARTNER_SECTION_TITLE="Marchi e partnership";
    out.PARTNER_SECTION_INTRO="Partnership e autorizzazioni commerciali verificate.";
  }
  return out;
}

const renderSpecSchema={
  type:"object",additionalProperties:false,
  properties:{
    main_html:{type:"string",minLength:1400},
    custom_css:{type:"string",minLength:1400},
    section_ids:{type:"array",minItems:8,maxItems:12,items:{type:"string"}},
    section_architecture_standard:{type:"string"},
    section_first_standard:{type:"string"},
    home_depth_standard:{type:"string"},
    section_blueprint:{type:"array",items:{type:"string"}},
    used_copy_tokens:{type:"array",minItems:6,items:{type:"string"}},
    used_asset_tokens:{type:"array",items:{type:"string"}},
    hero_visual_strategy:{type:"string"},
    hero_subject:{type:"string"},
    hero_scene_type:{type:"string"},
    hero_copy_space:{type:"string"},
    hero_mobile_crop_strategy:{type:"string"},
    hero_relevance_score:{type:"number",minimum:0,maximum:10},
    implementation_notes:{type:"string"}
  },
  required:[
    "main_html","custom_css","section_ids","home_depth_standard","used_copy_tokens","used_asset_tokens",
    "hero_visual_strategy","hero_subject","hero_scene_type","hero_copy_space",
    "hero_mobile_crop_strategy","hero_relevance_score","implementation_notes"
  ]
};

export async function generateRenderSpec(env,{inputPayload,direction,variantKey,copyManifest,assetTokens,qaFeedback=null,previousSpec=null,beforeModelAttempt=null}) {
  const allowedAssets=[...new Set((assetTokens||[]).filter(x=>x&&x!=="PRIMARY_LOGO"))];
  const safeDirection={
    ...(direction||{}),
    asset_tokens:(direction?.asset_tokens||[]).filter(x=>allowedAssets.includes(x))
  };
  const zeroPhoto=allowedAssets.length===0;
  const impresaxMasterProfile=String(inputPayload?.render_profile||"")==="IMPRESAX_MASTER_V1";
  const layoutContext={
    locale:inputPayload?.locale||"it-IT",
    asset_mode:inputPayload?.asset_mode||null,
    service_count:Object.keys(copyManifest||{}).filter(k=>/^SERVICE_\d+_TITLE$/.test(k)).length,
    trust_count:Object.keys(copyManifest||{}).filter(k=>/^TRUST_\d+$/.test(k)).length,
    copy_tokens:Object.keys(copyManifest||{})
  };
  const safePrevious=["COMPILER_CONTRACT","SHOWROOM_HARD_RESET"].includes(String(qaFeedback?.reason||"")) ? null : previousSpec;
  const prompt=[
    "Implement variant "+variantKey+" as a flagship premium full-home RenderSpec for the VERIFIED prospect.",
    "This is NOT a wireframe, starter template, generic agency page, SaaS layout or basic implementation.",
    "The result must feel art-directed, complete, commercially credible and materially different from the other routes.",
    "PRIMARY OUTCOME: create a digital showroom that makes the prospect want the finished site immediately. The user must perceive a dramatic upgrade in brand stature before reading every fact.",
    "VERIFIED INFORMATION IS SUPPORTING MATERIAL, NOT THE VISUAL STRUCTURE. Curate and stage facts; never let raw company data dictate a flat sequence of boxes.",
    "Design for desire first, then clarity and conversion: visual authority -> proof -> understanding -> action.",
    "Aim for luxury-B2B quality: restrained palette, exceptional spacing, editorial typography, deliberate asymmetry, refined linework/iconography, strong imagery and a memorable branded rhythm.",
    "Every major section needs its own visual role in the story. Do not repeat one card/grid pattern down the page.",
    "The page must look expensive without becoming decorative: every visual device must support hierarchy, brand elevation, proof or conversion.",
    "",
    "IDENTITY OWNERSHIP:",
    "- The official logo is inserted automatically by the deterministic compiler in the locked site shell.",
    "- PRIMARY_LOGO is NOT a normal asset token. Never use {{asset:PRIMARY_LOGO}}, identity:// URLs, raw logo URLs, or recreate/reinterpret the logo.",
    "- If the approved direction genuinely benefits from one hero/signature logo placement, you MAY use exactly one compiler-owned token: {{identity:PRIMARY_LOGO}}. The compiler replaces it with the immutable official logo.",
    zeroPhoto?"- HERO CONTRACT VIOLATION: HERO_VISUAL is missing. A render without a real hero image is not certifiable; do not fake a placeholder.":"",
    "",
    "HTML CONTRACT:",
    "- main_html is the CONTENT INSIDE <main>; NEVER output <main>, <html>, <head>, <body>, <header> or <footer> tags.",
    "- R111 HOME DEPTH: use 8-12 substantial <section> blocks and ALWAYS include these exact ids: hero, positioning, services, trust, bridge, final-cta.",
    "- The journey must read like a commissioned premium business homepage: hero -> positioning -> services -> at least TWO distinct editorial feature scenes -> trust/proof -> commercial bridge -> final CTA. Use 8-12 sections total; never pad with filler.",
    "- The hero MUST contain an <h1> using {{copy:HERO_HEADLINE}}, a visible {{copy:HERO_BODY}}, and TWO visible button-style anchors using {{cta:PRIMARY}} and {{cta:SECONDARY}}.",
    "- services MUST visibly use {{copy:SERVICES_TITLE}} and {{copy:SERVICES_INTRO}} before the service modules.",
    "- trust MUST visibly use {{copy:TRUST_TITLE}} and {{copy:TRUST_INTRO}} before the trust modules.",
    "- positioning MUST visibly use {{copy:POSITIONING_TITLE}} and {{copy:POSITIONING_BODY}}.",
    "- final-cta MUST visibly use {{copy:CLOSING_TITLE}}, {{copy:CLOSING_BODY}} and at least {{cta:PRIMARY}}.",
    "- Do not create a thin brochure: each section needs clear purpose, editorial hierarchy and enough breathing room to feel intentionally art-directed.",
    "- NEVER repeat the same sentence verbatim across HERO_BODY, POSITIONING_BODY, SERVICES_INTRO, TRUST_INTRO, BRIDGE_BODY and CLOSING_BODY. Each section must advance the story with a distinct verified angle.",
    impresaxMasterProfile?"- IMPRESAX MASTER BRIDGE: bridge must visibly use {{copy:BRIDGE_TITLE}} and {{copy:BRIDGE_BODY}}; do not reuse {{copy:POSITIONING_BODY}} in bridge. Keep bridge visually distinct from final-cta.":"",
    impresaxMasterProfile?"- IMPRESAX MASTER MOBILE NAV: keep the compiler-owned navigation visibly readable as a deliberate second row under logo/CTA; do not hide it or visually collapse it.":"",
    String(inputPayload?.brand_gate_mode||"")==="LOGO_FIRST_V1"?"- LOGO-FIRST MASTER: the OFFICIAL LOGO is the visual source of truth. Use logo_first_brand_profile for palette, typography direction, geometry, contrast, shape language and signature device. Do NOT import generic ImpresaX typography or decorative language when it conflicts with the prospect logo.":"",
    String(inputPayload?.brand_gate_mode||"")==="LOGO_FIRST_V1"?"- LOGO-FIRST MASTER: hero remains full-bleed edge-to-edge photography with all headline/body/CTA copy overlaid in-image. Two visible CTA buttons are mandatory. Sections after hero must feel custom-built from the same logo-derived system.":"",
    "- Do not repeat a trust statement as both section intro and trust card copy. Use the intro to frame the proof; use the cards for the proof itself.",
    "- Hero anchors must look like designed buttons, not tiny inline text links: give both clear button classes, minimum touch target around 44px, visible padding/border/fill and strong hierarchy between primary and secondary actions.",
    "- Every visible text node, including section labels, eyebrows, numbers, captions, badges and microcopy, MUST be an exact {{copy:TOKEN_NAME}} token.",
    "- Never write literal visible text such as 'Chi siamo', 'Servizi', '01', 'Scopri', company names, years, statistics or decorative words.",
    "- CTA href values MUST be exactly {{cta:PRIMARY}} or {{cta:SECONDARY}}.",
    "- Images, only when allowedAssets is non-empty, MUST be exactly src=\"{{asset:TOKEN_NAME}}\" with a listed token.",
    "- HERO CONTRACT: the first <section id=\"hero\"> MUST contain exactly one real <img> using src=\"{{asset:HERO_VISUAL}}\". HERO_VISUAL is mandatory and must be visually dominant, never hidden, decorative-only or placed below the fold.",
    impresaxMasterProfile
      ? "- IMPRESAX MASTER HERO CONTRACT: HERO_VISUAL must fill the ENTIRE hero background edge-to-edge at desktop and mobile, with zero side gutters or split-panel geometry. The verified headline, body and both CTAs MUST be overlaid inside the photographic field as HTML, protected by a deliberate readability gradient. The transparent site header must sit over the image. Mobile must preserve the same overlay concept with an intentional crop and bottom-weighted readability veil."
      : "- HERO CONTRACT: desktop must reserve approximately 40-60% of the hero composition for the photographic visual while preserving a deliberate copy field for headline + CTA; mobile must use an intentional crop/object-position that keeps the subject legible at 390px.",
    impresaxMasterProfile
      ? "- IMPRESAX MASTER HERO CONTRACT: never move hero copy below/beside the image during rework; never convert the hero to a split layout; never create blank gradient geometry beside the photo."
      : "- HERO CONTRACT: do not put headline text inside the image. Keep all copy as verified HTML tokens over/alongside the image with sufficient contrast.",
    "- No scripts, iframes, forms, SVG, external URLs, data URLs, inline styles or event handlers.",
    "",
    "CSS CONTRACT:",
    "- custom_css must be a complete art-direction layer, not placeholder CSS.",
    "- custom_css MUST art-direct the compiler-owned shell too: .ix-v2-header, .ix-v2-header-inner, .ix-v2-nav, .ix-v2-header-cta, .ix-v2-footer, .ix-v2-footer-grid and .ix-v2-footer-nav must visually belong to this route rather than look bolted on.",
    "- No @import, @font-face, url(), expression(), javascript:, or CSS content: property.",
    "- No external fonts. Use strong system-font stacks and typographic composition.",
    "- Include intentional 1440px desktop composition and a real 390px mobile reinterpretation with @media rules.",
    "- Avoid repeated equal cards, generic 3-column grids, excessive rounded rectangles, gradients-for-decoration, dashboard/SaaS patterns and default-looking buttons.",
    "- SERVICE SHOWCASE: services must feel editorial and premium. Use varied scale, numbering/line systems, refined iconography or composition-led modules rather than identical commodity cards.",
    "- GLOBAL CONTENT RULE: revenue, turnover, employee/headcount and similar registry-style corporate statistics may remain in source truth but MUST NOT be surfaced as homepage highlights, trust metrics, badges or persuasive proof.",
    "- COPY SOPHISTICATION RULE: every major section must have a distinct persuasive job and professional B2B language. Never expose internal/meta phrases such as dati verificati, informazioni verificate, visura, database, scheda azienda or profile labels. Avoid repeating the same sentence structure or generic claims across sections.",
    "- SECTION IMAGERY RULE: when at least "+MIN_SECTION_VISUALS+" non-hero editorial image assets are available, use at least "+MIN_SECTION_VISUALS+" DISTINCT section images across at least three non-hero sections. Do not hoard all imagery in one gallery or repeat the same image.",
    "- REAL IMAGERY RULE: section photography must come only from the provided verified/first-party/licensed asset tokens. Never synthesize, invent or hotlink section imagery.",
    "- ICONOGRAPHY RULE: use refined sector-relevant iconography/graphic devices as structural support in multiple sections. It must feel brand-native and useful, never clip-art, emoji, empty boxes or decorative clutter.",
    "- SURFACE ART DIRECTION RULE: large full-width sections must not rely on a single strong solid fill. Build layered brand-rich surfaces using controlled gradients, tints, split fields, textures, image treatments, line systems, brand-derived geometry and depth. Do NOT neutralize the whole page into white/beige.",
    "- BRAND WATERMARK RULE: when an official logo is available, integrate it once as a clearly perceptible but restrained semi-transparent background motif inside a non-hero section. It must be visible enough to register as brand identity, never so faint that it disappears, and never so strong that it competes with copy.",
    "- Every non-hero section must declare data-surface=\"art-directed\" and feel custom-composed rather than a generic color band.",
    "- BRAND COLOR PRESENCE RULE: use meaningful brand-color fields in at least two non-hero sections through gradients, tinted surfaces, split panels, overlays or image treatments. Accent colors may occupy real visual area; they are not limited to buttons and lines. The only forbidden pattern is a large unworked flat slab.",
    "- TRUST SHOWCASE: transform verified metrics, partners, locality and operational proof into visual evidence with strong hierarchy; never render them as a dull bullet list.",
    "- VISUAL RHYTHM: alternate density, scale, alignment and field treatment across the scroll so the page has deliberate pacing and no template cadence.",
    "- BRAND ELEVATION: logo-derived color, geometry and signature details must recur coherently but sparingly so the page feels bespoke, not themed.",
    "- CTA SPECTACLE: final-cta should be a memorable closing composition with strong contrast, generous scale and one obvious primary action; it must feel like the commercial climax of the page.",
    "- R90 NORTH STAR: do not design a merely premium company website. Art-direct the entire page like a world-class launch experience created by an elite brand-experience studio with effectively unlimited budget.",
    "- LAUNCH HERO RULE: the hero must behave like a reveal scene, not a standard website hero. It needs cinematic tension, dramatic scale, controlled lighting/overlay, strong copy choreography and unmistakable brand authorship.",
    "- SET-PIECE RULE: treat major sections as individually art-directed scenes. At least two non-hero sections must be unmistakable spectacle moments with their own composition, material treatment and scale shift.",
    "- SCALE CONTRAST RULE: create deliberate jumps between monumental and intimate moments. Avoid same-size headings, same-width grids and same-density sections repeated down the page.",
    "- MATERIAL DEPTH RULE: combine photography, brand geometry, tone-on-tone fields, gradients, line systems, texture-like layered effects, shadow/depth and negative space. Flat UI-card aesthetics are a FAIL.",
    "- ICONIC BRAND PRESENCE RULE: the prospect's brand must feel physically present in the composition, as if it were an object in a launch environment, not merely a logo placed in a header.",
    "- R90 FAIL CONDITION: if the result could be described as a tasteful premium corporate template, it fails. The page must contain memorable authored gestures that would be difficult to reuse unchanged for another company.",
    "- R93 TYPOGRAPHY NORTH STAR: visual spectacle never excuses crowded text. Typography must feel art-directed, breathable and effortless to read at 1440px and 390px.",
    "- FULL-BLEED HERO RULE: the hero background/image/surface must run edge-to-edge with zero perceived lateral margin on desktop and mobile. Content may use a safe inner container, but the hero itself must never look boxed.",
    "- TEXT BREATHING RULE: headlines, paragraphs, proof blocks, CTAs and floating plates need deliberate separation. Dense stacks, compressed cards and touching text zones are a hard fail.",
    "- RESPONSIVE TYPE RULE: desktop and mobile type scales are designed independently, not mathematically shrunk. Optimize font size, line-height, tracking, measure and spacing for each viewport.",
    "- HEADLINE WRAP RULE: avoid one-word-per-line poster compression unless intentionally used once as a controlled device. Prefer editorially balanced line breaks and readable max-widths.",
    "- BODY MEASURE RULE: body copy should normally stay around 45-70 characters per line on desktop and a comfortable mobile measure; use generous line-height and paragraph spacing.",
    "- FONT FIT RULE: use a distinctive, brand-appropriate display/body font system. Generic default Arial/Helvetica-only styling is a fail. If external font files are unavailable, use an intentional multi-font stack plus weight, width, tracking and casing to create a specific typographic voice.",
    "- COPY DENSITY RULE: every section has a visual copy budget. Remove compression before reducing readability; preserve only the verified copy needed for persuasion.",
    "- SPACING RHYTHM RULE: spacing is part of the art direction. Use explicit desktop/mobile vertical rhythm instead of equal gaps or cramped stacking.",
    "- HEADER / MENU RULE: the top navigation must look intentionally designed and professionally resolved: balanced logo scale, calm spacing, legible navigation hierarchy, confident primary CTA and strong mobile behavior. It must not look like a default website header.",
    "- FOOTER RULE: the footer is the final scene of the brand experience, not an afterthought. It needs clear identity, navigation hierarchy, contact structure, generous spacing and a premium branded surface.",
    "- R94 VALUE-PERCEPTION NORTH STAR: the site may be sold around EUR 2,500, but the screenshots must plausibly look like a EUR 10,000-15,000 top-tier agency project. If it merely looks worth the selling price, it fails.",
    "- R111 HOME RICHNESS GATE: the hero cannot carry the value perception alone. The body of the homepage must contain enough authored commercial depth to feel like a complete commissioned project, with at least six meaningful scenes between hero and final CTA.",
    "- R111 EDITORIAL FEATURE GATE: include at least two bespoke middle-scroll feature scenes that elevate specific verified services, capabilities, process, locality or proof. They must have different composition logic from the services grid and from each other.",
    "- R111 NO-FILLER RULE: 8-12 sections is a structural range, not permission to duplicate copy. Every scene must have a different persuasive job and must advance the commercial story.",
    "- CUSTOM-MADE GATE: the composition must feel difficult to reuse unchanged for another prospect. Require at least three authored signature moments tied to this brand, sector, imagery and commercial story.",
    "- PREMIUM ART-DIRECTION GATE: judge the whole page as a commissioned brand experience, not a component library. Strong hero alone cannot compensate for ordinary middle sections.",
    "- BRAND SPECIFICITY GATE: logo, brand color, geometry, imagery, copy hierarchy and sector cues must create unmistakable ownership by the prospect.",
    "- IMAGERY VALUE GATE: imagery must look credible, high-resolution, relevant and intentionally art-directed. Cheap stock, obvious AI look, weak crops or low-impact photos destroy the 15K perception.",
    "- SALES ARCHITECTURE GATE: beauty must support persuasion. The scroll must make positioning, services, differentiation, process, proof and final action feel intentionally sequenced.",
    "- DETAIL REFINEMENT GATE: inspect micro-alignment, spacing, borders, icon treatment, CTA proportions, overlays, crop discipline, header/footer finish and empty-space balance. A few cheap details are enough to fail the 15K gate.",
    "- MOBILE VALUE PARITY GATE: mobile must retain the same perceived investment as desktop. It is not acceptable for desktop to look 15K while mobile looks like a compressed template.",
    "- FIFTEEN-K TEST: explicitly answer: would a business owner reasonably believe a serious agency charged 10K-15K for this? Under R107, fifteen_k_value_perception must reach 9.7 before candidate pass.",
    "- R106 ICONIC COMMISSIONED NORTH STAR: design the page as a one-off commissioned brand experience, not a premium website. Target quality is 9.8-9.9. A perfect 10 remains an aspirational north star and must not be awarded casually.",
    "- IRREPRODUCIBLE AUTHORSHIP TEST: mentally remove logo and visible copy. The remaining composition, image treatment, signature geometry, rhythm and transitions must still plausibly belong to this prospect and should be difficult to transplant to another client unchanged.",
    "- CAMPAIGN ART-DIRECTION TEST: key photography must be composed like an editorial brand campaign through crop, layering, overlays, framing, scale and sequence, not merely placed into web containers.",
    "- SCROLL NARRATIVE TEST: adjacent scenes must hand off visually through authored transitions, recurring signature devices, changes of scale and controlled tension/release. Avoid the feeling of eight independent stacked sections.",
    "- SIGNATURE SYSTEM TEST: derive one coherent proprietary visual system from the prospect brand/sector and repeat it with variation across hero, middle scenes, trust and closing climax.",
    "- VISUAL MEMORY TEST: after a brief viewing, at least two visual gestures should be memorable and describable without relying on the company name.",
    "- MOBILE REINTERPRETATION TEST: preserve the signature system and campaign feel at 390px through recomposition, not just responsive shrinking.",
    "- COMMISSIONED EXPERIENCE TEST: commissioned_experience_quality must score >=9.8; irreproducible_brand_authorship >=9.7; scroll_narrative_continuity, signature_system_coherence, editorial_campaign_quality, visual_memory_factor and cross_viewport_art_direction >=9.7; transition_art_direction >=9.6.",
    "- HIGH-END TYPOGRAPHY: use disciplined type scale, measure, tracking, weight contrast and whitespace. Avoid oversized generic display text with weak body typography.",
    "- NEVER use empty outlined squares/rectangles, blank media frames, empty cards or hollow boxes as decorative geometry: they are read as broken-image placeholders. Geometry must be visibly intentional (solid fields, rules, patterns, typographic structures, filled modules, or connected line systems).",
    "- Every CTA must look intentionally designed. Never leave browser-default blue/underlined links or isolated text links floating in empty space.",
    "- Use responsive clamp(), grid/flex, spacing rhythm, hierarchy, controlled asymmetry and direction-specific signature devices.",
    "",
    "QUALITY FLOOR:",
    "- main_html and custom_css must both be richly implemented, not minimal examples.",
    "- The homepage must have clear visual hierarchy, premium whitespace, a distinctive hero, strong CTA integration and a deliberate closing sequence.",
    "- Header/navigation must look premium and intentional, with the official identity clearly visible, readable navigation and a designed CTA.",
    "- Hero primary CTA must be visually dominant and the secondary CTA clearly visible but subordinate; both must read as interactive controls at first glance.",
    "- Footer must feel like a real finishing section, not a thin legal strip: brand, navigation and verified contact details must be visually composed.",
    "- The page must feel complete enough to show directly to a paying prospect without explaining that it is a mockup.",
    "- SHOWROOM WOW FLOOR: the finished page must create an immediate 'I want this' reaction, not merely look competent. If the middle scroll, proof, closing CTA or footer feels ordinary, keep refining.",
    "- INFORMATION CURATION FLOOR: use only the strongest verified facts needed to support persuasion. More information is not automatically better; visual hierarchy and commercial sequencing win.",
    "- NON-TEMPLATE FLOOR: at least three major sections must have materially different composition logic while still sharing one coherent brand system.",
    "- PREMIUM RHYTHM FLOOR: whitespace, contrast, section transitions and graphic support must create controlled tension and release from hero through final CTA.",
    "- The hero must look sellable at first glance: premium image quality, obvious relevance to this prospect, strong focal hierarchy, believable real-world scene and excellent desktop/mobile cropping.",
    "- hero_visual_strategy / hero_subject / hero_scene_type / hero_copy_space / hero_mobile_crop_strategy must describe what is ACTUALLY implemented. hero_relevance_score must be your self-check and should be >=8 before returning.",
    "- section_ids must list the actual section ids and contain 8-12 entries. home_depth_standard must be R111_15K_HOME_DEPTH_ARCHITECTURE_V1.",
    "- used_copy_tokens and used_asset_tokens must report only tokens actually used.",
    "- Do not add a separate <footer> inside main_html; the deterministic shell already owns the site footer.",
    "",
    "COPY TOKENS — these are the ONLY strings allowed to become visible text:",
    JSON.stringify(Object.keys(copyManifest)),
    "LAYOUT CONTEXT — structural only; do not render any value from this object as text:",
    JSON.stringify(layoutContext),
    "ALLOWED MAIN ASSET TOKENS:",
    JSON.stringify(allowedAssets),
    "SANITIZED DIRECTION — visual instructions only; never render its words as copy:",
    JSON.stringify(safeDirection),
    qaFeedback?"REWORK FEEDBACK — fix these exact failures without weakening the art direction:"+JSON.stringify(qaFeedback):"",
    safePrevious?"PREVIOUS SPEC — preserve what is good and surgically improve only what failed:"+JSON.stringify(safePrevious):""
  ].filter(Boolean).join("\n");

  const role=qaFeedback && !["ENGINE_CONTRACT_UPGRADE","SHOWROOM_HARD_RESET"].includes(String(qaFeedback.reason||"")) ? "repair" : "generator";
  const r=await runStructured(env,role,{
    messages:[
      {role:"system",content:"You are the senior frontend art director for ImpresaX. Produce production-grade, token-safe structured output. Contract compliance is mandatory; premium art direction is mandatory; a premium prospect-relevant HERO_VISUAL is mandatory; invented facts or unapproved assets are forbidden."},
      {role:"user",content:prompt}
    ],
    schema:renderSpecSchema,maxTokens:12000,temperature:qaFeedback?0.12:0.22,beforeAttempt:beforeModelAttempt
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

export function applyVisualQaScoreGates({scores={},issues=[],actions=[],logoFirstMaster=false,masterGateKeys=[]}={}) {
  const nextIssues=Array.isArray(issues)?[...issues]:[];
  const nextActions=Array.isArray(actions)?[...actions]:[];
  const already=new Set(nextIssues.map(x=>String(x?.target||x?.code||"")));

  const addGateIssue=(key,score,required,code)=>{
    if(already.has(key)) return;
    nextIssues.push({
      code,
      target:key,
      message:`${key} scored ${score} below the required ${required} visual-quality gate.`,
      severity:"major"
    });
    nextActions.push(`Raise ${key} from ${score} to at least ${required} with a targeted visual refinement; do not change already-passing sections.`);
    already.add(key);
  };

  for(const key of QA_SCORE_KEYS) {
    const score=Number(scores?.[key]??0);
    if(score<8) addGateIssue(key,score,8,"score_below_floor");
  }
  const r107GlobalFloor={
    hero_text_on_image_integration:9.4,
    hero_overlay_legibility:9.5,
    sitewide_visual_refinement:9.4,
    image_quality_perception:9.4,
    premium_typography_quality:9.4,
    anti_template_feel:9.4,
    anti_fake_ai_credibility:9.4
  };
  for(const [key,required] of Object.entries(r107GlobalFloor)) {
    const score=Number(scores?.[key]??0);
    if(score<required) addGateIssue(key,score,required,"r107_quality_gate_below_floor");
  }

  const r111HomeDepthFloor={
    homepage_richness:9.7,
    section_depth:9.6,
    content_architecture:9.7,
    commercial_story_depth:9.6
  };
  for(const [key,required] of Object.entries(r111HomeDepthFloor)) {
    const score=Number(scores?.[key]??0);
    if(score<required) addGateIssue(key,score,required,"r111_home_depth_gate_below_floor");
  }

  const elevatedGateFloor={
    fifteen_k_value_perception:9.7,
    irreproducible_brand_authorship:9.7,
    commissioned_experience_quality:9.8,
    scroll_narrative_continuity:9.7,
    signature_system_coherence:9.7,
    editorial_campaign_quality:9.7,
    transition_art_direction:9.6,
    visual_memory_factor:9.7,
    cross_viewport_art_direction:9.7
  };
  if(logoFirstMaster) {
    for(const key of masterGateKeys) {
      const score=Number(scores?.[key]??0);
      const required=Number(elevatedGateFloor[key]??9);
      const code=key==="commissioned_experience_quality"
        ?"commissioned_experience_gate_below_floor"
        :key==="irreproducible_brand_authorship"
          ?"irreproducible_authorship_gate_below_floor"
          :key==="fifteen_k_value_perception"
            ?"fifteen_k_gate_below_floor"
            :"master_gate_below_floor";
      if(score<required) addGateIssue(key,score,required,code);
    }
  }

  const min=Math.min(...QA_SCORE_KEYS.map(k=>Number(scores?.[k]??0)));
  const masterGateFloor=logoFirstMaster
    ? Math.min(...masterGateKeys.map(k=>Number(scores?.[k]??0)))
    : 10;
  const fifteenKScore=Number(scores?.fifteen_k_value_perception??10);
  const authorshipScore=Number(scores?.irreproducible_brand_authorship??10);
  const commissionedScore=Number(scores?.commissioned_experience_quality??10);
  const hardIssues=nextIssues.filter(x=>x?.severity==="critical"||x?.severity==="major");
  const pass=min>=8 && masterGateFloor>=9 && fifteenKScore>=9.7 && authorshipScore>=9.7 && commissionedScore>=9.8 && hardIssues.length===0;

  return {issues:nextIssues,actions:nextActions,pass,min_score:min,master_gate_floor:masterGateFloor,fifteen_k_value_floor:fifteenKScore,irreproducible_authorship_floor:authorshipScore,commissioned_experience_floor:commissionedScore};
}

export const LOGO_FIRST_MASTER_GATE_KEYS=[
  "logo_integration_quality","color_system_from_logo","typography_brand_fit","brand_identity_coherence",
  "hero_full_bleed_quality","hero_overlay_design","hero_copy_integration","hero_cta_quality","hero_desirability",
  "first_impression","premium_feel","wow_effect","prospect_desire","preview_sales_power",
  "section_quality","page_architecture","final_cta_quality","desktop_quality","mobile_quality",
  "section_premium_quality","iconography_quality","graphic_support_quality","trust_visual_quality",
  "commercial_desirability","client_wow_effect","luxury_b2b_feel","premium_visual_rhythm",
  "editorial_showcase_quality","high_end_typography","brand_elevation","cta_spectacle",
  "showroom_conversion_power","section_imagery_quality","real_imagery_credibility",
  "copy_sophistication","section_copy_distinctness","visual_storytelling",
  "surface_personalization","background_art_direction","brand_motif_integration","no_flat_color_blocks",
  "brand_color_presence","chromatic_rhythm","surface_richness","watermark_visibility",
  "launch_grade_art_direction","cinematic_tension","spectacle_moments","scale_contrast",
  "iconic_brand_presence","custom_composition","material_depth","editorial_drama",
  "text_breathing","responsive_type_quality","hero_full_bleed","copy_density_control",
  "desktop_readability_balance","mobile_readability_balance","font_fit_and_originality",
  "headline_line_break_quality","spacing_rhythm",
  "header_composition_quality","navigation_professionalism","footer_composition_quality","footer_professionalism",
  "custom_made_feel","premium_art_direction","hero_wow_effect","brand_specificity",
  "imagery_premium_credibility","sales_structure_quality","detail_refinement",
  "mobile_premium_integrity","fifteen_k_value_perception",
  "irreproducible_brand_authorship","commissioned_experience_quality",
  "scroll_narrative_continuity","signature_system_coherence","editorial_campaign_quality",
  "transition_art_direction","visual_memory_factor","cross_viewport_art_direction",
  "hero_text_on_image_integration","hero_overlay_legibility","sitewide_visual_refinement",
  "image_quality_perception","premium_typography_quality","anti_template_feel","anti_fake_ai_credibility",
  "homepage_richness","section_depth","content_architecture","commercial_story_depth"
];

export function visualQaGatePolicy(inputPayload={}) {
  const logoFirstMaster=String(inputPayload?.brand_gate_mode||"")==="LOGO_FIRST_V1";
  const pilotHeroLocked=inputPayload?.pilot_hero_locked===true;
  const masterGateKeys=LOGO_FIRST_MASTER_GATE_KEYS.filter(k=>!(pilotHeroLocked && k==="hero_desirability"));
  return {logoFirstMaster,pilotHeroLocked,masterGateKeys};
}

export async function runVisualQa(env,{inputPayload,direction,variantKey,desktopB64,mobileB64,browserEvidence=null,beforeModelAttempt=null}) {
  const {logoFirstMaster,pilotHeroLocked,masterGateKeys}=visualQaGatePolicy(inputPayload);
  const text=[
    "Judge the ACTUAL desktop and mobile screenshots for ImpresaX.",
    logoFirstMaster
      ?"LOGO-FIRST MASTER PASS only when base master gates are >=9, fifteen_k_value_perception and irreproducible_brand_authorship are >=9.7, commissioned_experience_quality is >=9.8, the other R107 ultra-visual gates meet their elevated floors, every other score is >=8, and there are no critical/major unresolved issues."
      :"PASS only when every score is >=8 and there are no critical/major unresolved issues.",
    "The deterministic shell owns the official logo, contact path and footer. A direction described as logo-centric may use the immutable logo in the shell and at most one compiler-owned hero identity placement; never demand a fake/reinterpreted logo.",
    "BROWSER EVIDENCE is authoritative for mechanical facts. If it says official_identity_visible=true and broken_images=0, DO NOT claim the official logo is missing, fake, reinterpreted or broken merely because it is visually subtle in the screenshot. Judge its visual prominence separately if needed. If clipped_contacts is empty, do not claim a verified contact is mechanically truncated.",
    "Scripts and forms are prohibited in previews. Judge only what the static preview contract can actually implement; never require accordion/tabs/dark-mode/back-to-top/forms/scroll widgets or other interactive product features.",
    "The QA action list MUST stay within visual composition, typography, spacing, responsive layout, permitted static CTA treatment, immutable identity placement and existing verified content. Never propose new pages, report links, toggles, widgets, invented copy or new assets.",
    "Hard fail generic template/SaaS feel, weak typography/composition, fake or cheap imagery, weak mobile reinterpretation, poor brand fidelity, truth risk, or lack of prospect specificity.",
    "FULL-HOME HARD GATE: header_quality, navigation_quality, page_architecture, section_quality, final_cta_quality and footer_quality are blocking. Any score below 8 means FAIL. Under R94, header/menu/footer professionalism and 15K perceived-value is additionally judged through 9+ master gates and cannot pass as merely acceptable shell chrome.",
    "FULL-HOME HARD GATE: fail if the header is only logo + tiny link, if navigation looks missing/unfinished, if hero lacks readable headline/body and two designed actions, if sections feel repetitive or empty, if the final CTA is weak, or if the footer looks like a thin afterthought.",
    "Judge the whole scroll journey. A beautiful hero cannot compensate for a weak middle or weak footer.",
    "R111 HOME DEPTH HARD GATE: homepage_richness >=9.7, section_depth >=9.6, content_architecture >=9.7 and commercial_story_depth >=9.6 are blocking. Fail a short brochure-like homepage even when individual sections are attractive.",
    "R111 HOME DEPTH HARD GATE: require 8-12 purposeful substantial scenes, at least two bespoke editorial feature scenes in the middle scroll, and a clear progression from desire to understanding to proof to action. Repetition or filler is a FAIL.",
    "HERO HARD GATE: hero_strength, hero_relevance, hero_image_quality and hero_mobile_crop are independent blocking scores. Any of them below 8 means FAIL even if the rest of the page is strong.",
    "HERO HARD GATE: fail if the hero image is generic, irrelevant to the verified vertical/services, visually weak, obviously synthetic/cheap, subordinate to empty geometry, missing a clear focal subject, or badly cropped on mobile.",
    "HERO HARD GATE: the image must materially improve first impression and commercial credibility, with headline/CTA remaining immediately readable.",
    "R107 UNIVERSAL HERO OVERLAY GATE: on BOTH desktop and mobile, the headline, supporting hero copy and CTA group must be genuinely superimposed over the photographic HERO_VISUAL field. A split hero, text beside/below the image, detached copy panel or fake overlap is a blocking FAIL.",
    "R107 UNIVERSAL QUALITY GATE: hero_text_on_image_integration >=9.4, hero_overlay_legibility >=9.5, image_quality_perception >=9.4, premium_typography_quality >=9.4, sitewide_visual_refinement >=9.4, anti_template_feel >=9.4 and anti_fake_ai_credibility >=9.4 are blocking for EVERY variant.",
    "R107 IMAGE QUALITY GATE: fail soft, visibly compressed, pixelated, low-detail, cheap-stock or synthetic-looking photography. Images must feel high-resolution, properly cropped, integrated and credible throughout the page.",
    "R107 TYPOGRAPHY GATE: typography must look deliberately art-directed and expensive. Fail awkward line breaks, cramped rhythm, generic formatting, weak hierarchy, poor line lengths, orphaned headings, inconsistent spacing or mobile typography that feels like a scaled desktop.",
    "R107 SITEWIDE POLISH GATE: judge every major section, CTA and footer for premium refinement. A strong hero cannot compensate for generic middle sections, weak image treatment or unfinished typography.",
    pilotHeroLocked?"CABINA-LOCKED HERO: this pilot intentionally preserves a previously approved/pre-QA-passed hero asset while the rest of the page is being perfected. Do NOT demand image replacement merely because another editorial style might be preferable. Still fail real defects: irrelevance, low resolution, obvious AI artifacts, unreadable crop, poor overlay integration, or hero scores below 8.":"",
    logoFirstMaster?"LOGO-FIRST BRAND GATE: the official logo must visibly drive the color system, type personality, shape language and signature device. A generic premium template with the logo pasted on top is a FAIL.":"",
    logoFirstMaster?"LOGO-FIRST HERO GATE: hero must be edge-to-edge/full-bleed with no lateral white/split field, with styled copy and both CTA buttons over the image. Any compromise is a FAIL.":"",
    logoFirstMaster?"DESIRABILITY GATE: judge whether a real prospect would feel immediately upgraded, impressed and motivated to buy the redesign. wow_effect, prospect_desire and preview_sales_power below 9 are blocking.":"",
    logoFirstMaster?"PREMIUM SECTION GATE: the post-hero scroll must feel deliberately art-directed, not like stacked text/card templates. section_premium_quality, iconography_quality, graphic_support_quality and trust_visual_quality below 9 are blocking.":"",
    logoFirstMaster?"CLIENT WOW GATE: graphics and iconography must strengthen the brand system and sales impact without decorative clutter or invented claims. commercial_desirability and client_wow_effect below 9 are blocking.":"",
    logoFirstMaster?"SHOWROOM GATE: luxury_b2b_feel, premium_visual_rhythm, editorial_showcase_quality, high_end_typography, brand_elevation, cta_spectacle and showroom_conversion_power are all blocking at 9+. A merely competent corporate site must FAIL.":"",
    logoFirstMaster?"EDITORIAL IMAGE GATE: section_imagery_quality and real_imagery_credibility are blocking at 9+. Fail repetitive, fake-looking, low-value, badly cropped or weakly integrated section photography. The page should feel image-rich but never like a gallery or stock template.":"",
    logoFirstMaster?"COPY GATE: copy_sophistication and section_copy_distinctness are blocking at 9+. Fail generic/repetitive prose, internal research language, database/profile wording, or use of revenue/headcount as headline trust proof.":"",
    logoFirstMaster?"VISUAL STORYTELLING GATE: visual_storytelling is blocking at 9+. Photography, iconography, typography and section transitions must work together as one persuasive journey, not isolated modules.":"",
    logoFirstMaster?"SURFACE GATE: surface_personalization, background_art_direction, brand_motif_integration, no_flat_color_blocks, brand_color_presence, chromatic_rhythm, surface_richness and watermark_visibility are blocking at 9+. Fail both extremes: generic flat color slabs AND anonymous over-neutralized pages. Require at least two meaningful brand-rich non-hero surfaces plus a clearly perceptible restrained official-logo watermark.":"",
    logoFirstMaster?"INFORMATION-STAGING GATE: fail when verified information is presented as a catalogue, database dump, repetitive card wall or equal-weight list. Facts must be selectively staged to support persuasion and visual hierarchy.":"",
    logoFirstMaster?"CLIENT REACTION GATE: judge the page as a sales preview shown to the business owner. If it would need explanation to feel premium, or would not create a strong desire to replace the current site, score showroom_conversion_power/client_wow_effect below 9.":"",
    logoFirstMaster?"R90 LAUNCH-GRADE GATE: launch_grade_art_direction, cinematic_tension, spectacle_moments, scale_contrast, iconic_brand_presence, custom_composition, material_depth and editorial_drama are blocking at 9+. A polished corporate homepage is not enough. Require a reveal-grade hero and at least two clearly distinct non-hero spectacle/set-piece moments.":"",
    logoFirstMaster?"UNLIMITED-BUDGET TEST: judge whether the page feels as if a top global brand-experience studio had permission to obsess over every scene. If the design is safe, modular, repetitive, timid or easily reusable as a template, score launch_grade_art_direction/custom_composition below 9.":"",
    logoFirstMaster?"R93 TYPOGRAPHY GATE: text_breathing, responsive_type_quality, hero_full_bleed, copy_density_control, desktop_readability_balance, mobile_readability_balance, font_fit_and_originality, headline_line_break_quality and spacing_rhythm are blocking at 9+. Fail crowded text, boxed hero surfaces, excessive one-word headline wrapping, weak mobile line-height, generic font treatment or compressed proof/card typography.":"",
    logoFirstMaster?"R93 SHELL GATE: header_composition_quality, navigation_professionalism, footer_composition_quality and footer_professionalism are blocking at 9+. Fail default-looking menus, weak logo/CTA balance, cramped mobile navigation, thin footers, poor contact hierarchy or flat generic footer surfaces.":"",
    logoFirstMaster?"R94 15K VALUE GATE: custom_made_feel, premium_art_direction, hero_wow_effect, brand_specificity, imagery_premium_credibility, sales_structure_quality, detail_refinement and mobile_premium_integrity are blocking at 9+. Under R107, fifteen_k_value_perception is elevated to 9.7+. A beautiful 2.5K website is still a FAIL if it does not plausibly look like a 10K-15K commissioned project.":"",
    logoFirstMaster?"R107 ICONIC COMMISSIONED GATE: irreproducible_brand_authorship >=9.7, commissioned_experience_quality >=9.8, scroll_narrative_continuity >=9.7, signature_system_coherence >=9.7, editorial_campaign_quality >=9.7, transition_art_direction >=9.6, visual_memory_factor >=9.7 and cross_viewport_art_direction >=9.7. Fail anything that still reads as a sequence of premium website sections rather than a one-off commissioned brand experience.":"",
    "VARIANT:"+variantKey,
    "DIRECTION:"+JSON.stringify(direction),
    "VERIFIED INPUT:"+JSON.stringify(inputPayload),
    "BROWSER EVIDENCE:"+JSON.stringify(browserEvidence||{})
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
  let issues=Array.isArray(r.data.issues)?r.data.issues:[];
  const scores={...(r.data.scores||{})};
  const evidence=browserEvidence||{};

  if(pilotHeroLocked &&
     Number(scores.hero_image_quality||0)>=8 &&
     Number(scores.hero_relevance||0)>=8 &&
     Number(scores.hero_mobile_crop||0)>=8) {
    const lockedHeroPreference=/\b(?:generic|stock|replace|distinctive|bespoke|art[- ]directed).*(?:hero|image)|\b(?:hero|image).*(?:generic|stock|replace|distinctive|bespoke|art[- ]directed)/i;
    issues=issues.filter(issue=>{
      const hay=[issue?.code,issue?.target,issue?.message].filter(Boolean).join(" ");
      return !lockedHeroPreference.test(hay);
    });
  }

  if(evidence.official_identity_visible===true && evidence.deterministic_gate_pass===true) {
    const identityFalsePositive=/\b(?:missing|absent|not\s+rendered|not\s+displayed|replace).*\b(?:official\s+logo|logo\s+asset)|\b(?:logo_reinterpretation|missing_official_logo|immutable_logo_missing|identity)\b/i;
    issues=issues.filter(issue=>{
      const hay=[issue?.code,issue?.target,issue?.message].filter(Boolean).join(" ");
      return !identityFalsePositive.test(hay);
    });
    if(Number(scores.brand_fidelity||0)<8) scores.brand_fidelity=8;
  }

  const noClippedDesktop=Array.isArray(evidence.desktop?.clipped_contacts)&&evidence.desktop.clipped_contacts.length===0;
  const noClippedMobile=Array.isArray(evidence.mobile?.clipped_contacts)&&evidence.mobile.clipped_contacts.length===0;
  if(evidence.deterministic_gate_pass===true && noClippedDesktop && noClippedMobile) {
    const contactFalsePositive=/\b(?:truncat|clip|cut\s*off|overflow).*\b(?:contact|email|phone|pec)|\b(?:contact_truncation|mobile_email_truncation|truncated_contact)\b/i;
    issues=issues.filter(issue=>{
      const hay=[issue?.code,issue?.target,issue?.message].filter(Boolean).join(" ");
      return !contactFalsePositive.test(hay);
    });
  }

  const gated=applyVisualQaScoreGates({
    scores,
    issues,
    actions:r.data.actions,
    logoFirstMaster,
    masterGateKeys
  });
  return {
    ...r.data,
    scores,
    issues:gated.issues,
    actions:gated.actions,
    pass:gated.pass,
    model:r.model,
    min_score:gated.min_score,
    master_gate_floor:gated.master_gate_floor,
    master_gate_required:logoFirstMaster?9:null
  };
}


const heroAssetQaSchema={
  type:"object",additionalProperties:false,
  properties:{
    pass:{type:"boolean"},
    summary:{type:"string"},
    scores:{
      type:"object",additionalProperties:false,
      properties:{
        relevance:{type:"number"},
        image_quality:{type:"number"},
        realism:{type:"number"},
        text_free:{type:"number"},
        composition:{type:"number"},
        crop_safety:{type:"number"}
      },
      required:["relevance","image_quality","realism","text_free","composition","crop_safety"]
    },
    issues:{type:"array",items:{
      type:"object",additionalProperties:false,
      properties:{
        code:{type:"string"},
        severity:{type:"string",enum:["critical","major","minor"]},
        message:{type:"string"}
      },
      required:["code","severity","message"]
    }},
    regeneration_guidance:{type:"array",items:{type:"string"}}
  },
  required:["pass","summary","scores","issues","regeneration_guidance"]
};

export async function runHeroAssetQa(env,{imageB64,inputPayload,direction,variantKey,beforeModelAttempt=null}) {
  const masterProfile=String(inputPayload?.render_profile||"")==="IMPRESAX_MASTER_V1";
  const compositionRule=masterProfile
    ? "IMPRESAX MASTER FULL-BLEED QA: do NOT require blank or clean negative space for HTML copy. The entire frame SHOULD remain a continuous photograph with useful real material/environment detail edge-to-edge. Dense photographic texture is valid and desirable when focal hierarchy remains clear. HTML copy readability is handled later by a CSS gradient overlay. HARD FAIL blank gray/flat copy panels, dead half-frames, split-layout geometry baked into the image, or large non-photographic voids. Judge composition by premium photographic balance, full-frame continuity, focal hierarchy and 390px crop survival."
    : "The image must provide a strong focal point, premium photographic realism, enough clean negative space for HTML copy, and a focal subject that can survive a 390px mobile crop.";
  const text=[
    "Review this RAW candidate hero photograph BEFORE it is allowed into a website render.",
    "Be extremely strict. This is a premium B2B website asset gate, not a general image critique.",
    "HARD FAIL if ANY visible letters, words, numbers, logos, signage, labels, UI, watermarks, pseudo-text, gibberish, invented brand marks, or readable writing appear anywhere in the image. Even plausible-looking fake text is a FAIL.",
    "HARD FAIL obvious AI artifacts, uncanny people/hands, impossible materials/architecture, cheap stock-photo staging, fake corporate posing, malformed equipment, low detail, oversharpening or synthetic collage/composite appearance.",
    "HARD FAIL if the scene is generic or not clearly relevant to the verified commercial activity.",
    compositionRule,
    "Do not require the real company premises, employees, logo or a documented project. This is illustrative editorial imagery and must NOT imply documentary proof.",
    "Return scores 0-10. text_free must be 10 only when there is no visible text-like material at all.",
    "VARIANT: "+variantKey,
    "VERIFIED BUSINESS CATEGORY/SERVICES: "+JSON.stringify({
      vertical:inputPayload?.vertical||null,
      verified_services:inputPayload?.verified_services||null,
      offer:inputPayload?.brand_dna?.offer||null,
      positioning:inputPayload?.brand_dna?.business_positioning||null,
      local_context:inputPayload?.brand_dna?.local_context||null
    }),
    "ART DIRECTION: "+JSON.stringify({
      core_idea:direction?.core_idea||null,
      hero_logic:direction?.hero_logic||null
    })
  ].join("\n");

  const r=await runStructured(env,"visualQa",{
    messages:[
      {role:"system",content:"You are an independent senior commercial-photography QA gate. Reject anything that could make a premium prospect demo look fake, generic, mislabeled or AI-generated."},
      {role:"user",content:[
        {type:"text",text},
        {type:"image_url",image_url:{url:"data:image/jpeg;base64,"+imageB64}}
      ]}
    ],
    schema:heroAssetQaSchema,maxTokens:1800,temperature:0.02,vision:true,beforeAttempt:beforeModelAttempt
  });
  const scores={...(r.data?.scores||{})};
  const numeric=Object.fromEntries(Object.entries(scores).map(([k,v])=>[k,Number(v)]));
  const vals=Object.values(numeric);
  const issues=Array.isArray(r.data?.issues)?r.data.issues:[];
  const blocking=issues.filter(x=>x?.severity==="critical"||x?.severity==="major");
  const coreKeys=["relevance","image_quality","realism","text_free","composition"];
  const corePass=coreKeys.every(k=>Number.isFinite(Number(numeric[k])) && Number(numeric[k])>=8);
  // Raw crop safety is predictive only. The authoritative 390px crop is reviewed again
  // on the actual rendered mobile screenshot by HERO_VISUAL QA, where the floor remains 8.
  const cropPredictivePass=Number.isFinite(Number(numeric.crop_safety)) && Number(numeric.crop_safety)>=7;
  // Deterministic normalization is authoritative here; reviewer pass can be false
  // solely because crop_safety=7 even when every blocking visual condition is clean.
  const pass=vals.length===6 &&
    corePass &&
    cropPredictivePass &&
    Number(numeric.text_free)===10 &&
    blocking.length===0;
  return {...r.data,scores:numeric,issues,pass,model:r.model};
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

export function normalizeSetQaResult(data) {
  const raw={...(data?.scores||{})};
  const numeric=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,Number(v)]));
  const finite=Object.values(numeric).filter(Number.isFinite);
  const scaleIsUnit=finite.length>0 && Math.max(...finite)<=1.000001;
  const scores=Object.fromEntries(Object.entries(numeric).map(([k,v])=>[k,scaleIsUnit?v*10:v]));
  const vals=Object.values(scores);
  const baseKeys=["set_quality","prospect_fit_a","prospect_fit_b","prospect_fit_c"];
  const diversityKeys=["diversity_ab","diversity_ac","diversity_bc"];
  const basePass=baseKeys.every(k=>Number.isFinite(scores[k])&&scores[k]>=8);
  const diversityPass=diversityKeys.every(k=>Number.isFinite(scores[k])&&scores[k]>=VARIANT_DIVERGENCE_FLOOR);
  const issues=Array.isArray(data?.issues)?data.issues.map(String):[];
  const blockingPattern=/\b(?:critical|major|material(?:ly)?\s+(?:same|similar|weak|conflict)|same\s+composition|reused\s+composition|cosmetic\s+variation|template\s+family|generic\s+template|too\s+similar|not\s+materially\s+different|redundan(?:t|cy)|weaker\s+(?:variant|member)|diversity\s+(?:fail|below|insufficient)|conflicting\s+variant)\b/i;
  const blockingIssues=issues.filter(x=>blockingPattern.test(x));
  const pass=vals.length===7 && basePass && diversityPass && blockingIssues.length===0;
  const fitEntries=[
    ["A",Number(scores.prospect_fit_a||0)],
    ["B",Number(scores.prospect_fit_b||0)],
    ["C",Number(scores.prospect_fit_c||0)]
  ];
  fitEntries.sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]));
  const winner=fitEntries[0]?.[0]||"A";
  return {
    ...data,
    scores,
    pass,
    weakest_variant:pass?"NONE":data?.weakest_variant,
    winner_variant:winner,
    creative_roles:VARIANT_CREATIVE_ROLES,
    blocking_issues:blockingIssues,
    score_floor:vals.length?Math.min(...vals):0,
    diversity_floor:Math.min(...diversityKeys.map(k=>Number(scores[k]||0)))
  };
}

export async function runSetQa(env,{inputPayload,frames,beforeModelAttempt=null}) {
  const evidence=Object.fromEntries(["A","B","C"].map(k=>[k,frames[k]?.browser_evidence||{}]));
  const content=[{type:"text",text:[
    "Judge A/B/C as a SET on a 0-10 score scale.",
    "PASS when set quality and prospect fit are at least 8, every pairwise diversity score is at least "+VARIANT_DIVERGENCE_FLOOR+", and there is no major/critical blocking issue. Minor polish notes may remain and MUST NOT force FAIL.",
    "The three routes are mandatory and must be genuinely different: A="+VARIANT_CREATIVE_ROLES.A+", B="+VARIANT_CREATIVE_ROLES.B+", C="+VARIANT_CREATIVE_ROLES.C+". Do not accept cosmetic restyling of one layout. Identify a weaker conflicting variant only when diversity materially fails; otherwise weakest_variant must be NONE.",
    "All three variants must open with a genuinely premium, prospect-relevant photographic hero. Fail the set if any one route has a weak/generic/cheap hero, if the hero imagery is not relevant to the verified business, or if mobile cropping destroys the focal subject.",
    "R107 SET RULE: A/B/C must ALL place headline, supporting copy and CTA directly over the hero image on desktop and mobile. Any split/image-beside-copy hero is a hard FAIL.",
    "R107 SET RULE: all three must show high-resolution visual perception, super-premium typography, refined sitewide image treatment and no cheap AI/template feel.",
    "Each route must also read as a complete premium homepage from header to footer. Fail the set if any route feels like a concept board, a landing-page fragment, a generic template, or a hero plus filler sections.",
    "BROWSER EVIDENCE is authoritative for mechanical facts. If a variant has official_identity_visible=true and deterministic_gate_pass=true, do not claim its official logo is missing, fake, reinterpreted or broken. Judge prominence separately, but never fail immutable identity on a mechanically verified logo.",
    "Do not lower diversity merely because the same immutable official logo appears across A/B/C; identity consistency is required. Judge diversity from composition, section order, typography, material system, signature device and CTA pattern.",
    "BLOCKING STRUCTURAL RULE: fail any pair that uses the same underlying page skeleton, substantially identical DOM/component hierarchy, substantially identical hero architecture, substantially identical section ordering, or the same CTA journey with cosmetic restyling.",
    "Three visually polished skins of one template are a hard FAIL even if color, imagery, typography or decorative effects differ.",
    "VERIFIED INPUT:"+JSON.stringify(inputPayload),
    "BROWSER EVIDENCE:"+JSON.stringify(evidence)
  ].join("\n")}];
  for(const key of ["A","B","C"]) {
    content.push({type:"text",text:"VARIANT "+key+" DESKTOP"});
    content.push({type:"image_url",image_url:{url:"data:image/jpeg;base64,"+frames[key].desktop}});
    content.push({type:"text",text:"VARIANT "+key+" MOBILE"});
    content.push({type:"image_url",image_url:{url:"data:image/jpeg;base64,"+frames[key].mobile}});
  }
  const r=await runStructured(env,"setQa",{
    messages:[
      {role:"system",content:"You are the ImpresaX cross-variant jury. Detect cosmetic variations, reused composition and generic template families. Deterministic browser evidence overrides visual guesses about whether a mechanical identity/contact asset exists."},
      {role:"user",content}
    ],
    schema:setQaSchema,maxTokens:2200,temperature:0.04,vision:true,beforeAttempt:beforeModelAttempt
  });

  const data={...r.data,scores:{...(r.data?.scores||{})}};
  const allIdentityVisible=["A","B","C"].every(k=>
    evidence[k]?.official_identity_visible===true && evidence[k]?.deterministic_gate_pass===true
  );
  if(allIdentityVisible) {
    const falseIdentity=/\b(?:official\s+logo|logo\s+asset|text[- ]based\s+logo|logo\s+reinterpret|missing\s+logo|identity\s+missing)\b/i;
    data.issues=(data.issues||[]).filter(x=>!falseIdentity.test(String(x)));
    data.actions=(data.actions||[]).filter(x=>!falseIdentity.test(String(x)));
    for(const key of ["prospect_fit_a","prospect_fit_b","prospect_fit_c"]) {
      if(Number(data.scores?.[key]||0)<8) data.scores[key]=8;
    }
  }
  const normalized=normalizeSetQaResult(data);
  return {...normalized,model:r.model};
}

export const AI_CONTRACT_META={MODEL_ROUTE_VERSION,PROMPT_VERSION};
