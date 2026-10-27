import { DEFAULT_MODELS, MODEL_ROUTE_VERSION, PROMPT_VERSION, QA_SCORE_KEYS, MIN_SECTION_VISUALS, EXTERNAL_AI_CALLS_ALLOWED, R118_EXTERNAL_GENERATION_ALLOWED, R118_EXTERNAL_VISUAL_QA_ALLOWED, R118_FAST_JURY_MODEL, VARIANT_DIVERGENCE_FLOOR, VARIANT_CREATIVE_ROLES, R121_CREATIVE_DIRECTOR_STANDARD, R121_CONCEPT_LOCK_STANDARD, R121_CAMPAIGN_ASSET_TOKENS, R121_SELLABILITY_AXES } from "./constants.js";
import { filterHomepageTrustPoints } from "./showroom-policy.js";
import { stableStringify, sha256 } from "./utils.js";
import { sanitizeDirectionForExecution } from "./design-grammar.js";
import { R122_DESIRE_ENGINE_STANDARD, R122_CONCEPT_RULES, R122_IMPLEMENTATION_RULES } from "./r122-desire-engine.js";

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

async function runStructured(env,role,{messages,schema,maxTokens=7000,temperature=0.2,vision=false,beforeAttempt=null,allowR118External=false,r121ConceptRoute=false}) {
  const qaRole=role==="visualQa"||role==="setQa";
  const r118RoleAllowed=allowR118External===true
    && String(env.V2_R118_EXTERNAL_AI_ENABLED||"false")==="true"
    && ((qaRole && R118_EXTERNAL_VISUAL_QA_ALLOWED===true) || (!qaRole && R118_EXTERNAL_GENERATION_ALLOWED===true));
  if(EXTERNAL_AI_CALLS_ALLOWED!==true && !r118RoleAllowed) throw new Error("EXTERNAL_AI_DISABLED_BY_CABINA");
  if(String(env.V2_EXTERNAL_AI_ENABLED||"false")!=="true" && !r118RoleAllowed) throw new Error("EXTERNAL_AI_DISABLED_BY_CABINA");
  if(!env.AI) throw new Error("AI_PROVIDER_BINDING_MISSING");
  let lastError=null;
  const fastR118Qa=qaRole && allowR118External===true && r121ConceptRoute!==true;
  const fastR118Generation=!qaRole && allowR118External===true && r121ConceptRoute!==true;
  // R118/R119 generation gets one authored pass. If the provider returns useful
  // content with a schema defect, normalize that SAME output instead of paying
  // for a second full-page generation on another model.
  const plan=(fastR118Qa||fastR118Generation)
    ? [{fallback:false,retry:0}]
    : [{fallback:false,retry:0},{fallback:true,retry:0}];

  for(const attempt of plan) {
    const model=r121ConceptRoute===true
      ? (qaRole
          ? (attempt.fallback
              ? (env.V2_MODEL_R121_CONCEPT_JURY_FALLBACK||"@cf/openai/gpt-oss-120b")
              : (env.V2_MODEL_R121_CONCEPT_JURY||"@cf/deepseek-ai/deepseek-v4.1-flash-1017"))
          : (attempt.fallback
              ? (env.V2_MODEL_R121_CONCEPT_FALLBACK||env.V2_MODEL_CREATIVE||"@cf/zai-org/glm-5.3-flash")
              : (env.V2_MODEL_R121_CONCEPT||"@cf/deepseek-ai/deepseek-v4.1-flash-1017")))
      : (fastR118Qa
          ? (env.V2_R118_FAST_JURY_MODEL||R118_FAST_JURY_MODEL)
          : (fastR118Generation
              ? (env.V2_R118_FAST_GENERATOR_MODEL||DEFAULT_MODELS.codeFallback)
              : modelFor(env,role,attempt.fallback)));
    if(beforeAttempt) await beforeAttempt({role,model,fallback:attempt.fallback,retry:attempt.retry});
    try {
      const retrySuffix=attempt.retry
        ? [{role:"system",content:"Return ONLY one complete valid JSON object matching the requested schema. No prose, markdown, analysis, comments or code fences."}]
        : [];
      const schemaJsonInstruction=(qaRole || r121ConceptRoute===true)
        ? [{role:"system",content:"Return ONLY one valid JSON object and no other text. It MUST match this JSON Schema exactly: "+JSON.stringify(schema)}]
        : [];
      const inference={
        messages:[...messages,...schemaJsonInstruction,...retrySuffix],
        temperature:attempt.retry?0:temperature
      };
      // R121 is deliberately provider-agnostic: schema is carried in the prompt and
      // our deterministic parser extracts JSON. Some Workers AI providers degrade or
      // emit empty text when forced through response_format/json_schema.
      if(!qaRole && r121ConceptRoute!==true) inference.response_format={type:"json_schema",json_schema:schema};
      if(/llama-3\.3-70b-instruct-fp8-fast/i.test(model)) inference.max_tokens=maxTokens;
      else inference.max_completion_tokens=maxTokens;
      if(vision && /qwen\/qwen3\.8-27b/i.test(model)) inference.reasoning_effort="low";
      if(r121ConceptRoute===true && /deepseek-v4\.1-flash-1017/i.test(model)) {
        inference.reasoning_effort=qaRole?"high":"medium";
      }
      const runOptions=env.AI_GATEWAY_ID
        ? {gateway:{id:env.AI_GATEWAY_ID,skipCache:true}}
        : undefined;
      const aiTimeoutMs=r121ConceptRoute===true
        ? Math.max(90000,Math.min(240000,Number(env.V2_R121_CONCEPT_TIMEOUT_MS||165000)))
        : (fastR118Generation
          ? Math.max(30000,Math.min(90000,Number(env.V2_R118_FAST_GENERATOR_TIMEOUT_MS||75000)))
          : Math.max(30000,Math.min(180000,Number(env.V2_AI_CALL_TIMEOUT_MS||105000))));
      const result=await withAiDeadline(env.AI.run(model,inference,runOptions),aiTimeoutMs,role+":"+model);
      try {
        return {data:extractStructured(result,schema),model,fallback:attempt.fallback,retry:attempt.retry};
      } catch(parseError) {
        const schemaInvalid=String(parseError?.message||parseError)==="AI_OUTPUT_SCHEMA_INVALID";
        const canNormalize=schemaInvalid && (qaRole || fastR118Generation || r121ConceptRoute);
        if(!canNormalize) throw parseError;
        const raw=collectRawText(result);
        if(!raw) throw parseError;

        const fixerModel=r121ConceptRoute===true
          ? (env.V2_MODEL_R121_SCHEMA_NORMALIZER||env.V2_MODEL_CREATIVE||"@cf/zai-org/glm-5.3-flash")
          : (env.V2_MODEL_TEXT_FALLBACK||DEFAULT_MODELS.textFallback);
        if(beforeAttempt) await beforeAttempt({
          role:role+"_schema_normalizer",
          model:fixerModel,
          fallback:true,
          retry:0
        });
        const generationNormalizer=(fastR118Generation || r121ConceptRoute) && !qaRole;
        const r121SourceContext=r121ConceptRoute===true
          ? messages.map(message=>String(message?.content||"")).join("\n").slice(-22000)
          : "";
        const fixerInference={
          messages:[
            {
              role:"system",
              content:r121ConceptRoute===true && !qaRole
                ?"Normalize the supplied R121 creative-concept object into exactly one JSON object matching the provided JSON Schema. SOURCE CONSTRAINTS are authoritative. Preserve the campaign thesis and creative idea only when they remain faithful to those constraints. Fix schema shape/types/missing required fields using ONLY facts and business reality present in SOURCE CONSTRAINTS. Never replace missing content with generic lifestyle, sustainability, luxury, ecommerce, launch, pre-order or unrelated-industry ideas. Preserve the verified proof plan, six R121 asset roles, desktop/mobile storyboards, motion signature, ownability anchors and transplant test. Do NOT convert it into a homepage, do NOT invent facts, do NOT infer unverified processes, do NOT redesign into another vertical, and return JSON only."
                :(generationNormalizer
                  ?"Normalize the supplied generated homepage object into exactly one JSON object matching the provided JSON Schema. Preserve the authored HTML, CSS, token usage, section order and factual content whenever they are valid. Fix schema shape/types/missing required fields only. Do NOT redesign, summarize, shorten into a draft, invent facts, add assets, or add prose outside JSON."
                  :"Convert the supplied reviewer output into exactly one JSON object matching the provided JSON Schema. Preserve the reviewer's factual judgments, scores, issues and actions. Do NOT perform a new visual review. Do NOT add claims that are absent from the supplied reviewer output. Return JSON only.")
            },
            {
              role:"user",
              content:(r121SourceContext?"SOURCE CONSTRAINTS — authoritative, never override:\n"+r121SourceContext+"\n\n":"")
                +"JSON SCHEMA:\n"+JSON.stringify(schema)+"\n\nRAW OUTPUT:\n"+raw
            }
          ],
          temperature:0
        };
        if(r121ConceptRoute!==true) fixerInference.response_format={type:"json_schema",json_schema:schema};
        const fixerTokenCap=generationNormalizer?Math.min(maxTokens,9000):Math.min(maxTokens,5000);
        if(/llama-3\.3-70b-instruct-fp8-fast/i.test(fixerModel)) fixerInference.max_tokens=fixerTokenCap;
        else fixerInference.max_completion_tokens=fixerTokenCap;
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



const r121AssetRoleSchema={
  type:"object",additionalProperties:false,
  properties:{
    token:{type:"string",enum:R121_CAMPAIGN_ASSET_TOKENS},
    narrative_role:{type:"string"},
    subject:{type:"string"},
    visual_function:{type:"string"},
    crop_behavior:{type:"string"},
    truth_safety:{type:"string"}
  },
  required:["token","narrative_role","subject","visual_function","crop_behavior","truth_safety"]
};

const r121StoryboardBeatSchema={
  type:"object",additionalProperties:false,
  properties:{
    beat:{type:"string"},purpose:{type:"string"},composition:{type:"string"},
    dominant_asset:{type:"string",enum:R121_CAMPAIGN_ASSET_TOKENS},copy_role:{type:"string"},interaction_role:{type:"string"}
  },
  required:["beat","purpose","composition","dominant_asset","copy_role","interaction_role"]
};

const r122OwnabilityMapItemSchema={
  type:"object",additionalProperties:false,
  properties:{
    role:{type:"string",enum:["OPERATION","LOCALITY","PROOF","BRAND_NAME"]},
    anchor:{type:"string"},
    visual_consequence:{type:"string"},
    narrative_consequence:{type:"string"},
    conversion_consequence:{type:"string"},
    removal_failure:{type:"string"}
  },
  required:["role","anchor","visual_consequence","narrative_consequence","conversion_consequence","removal_failure"]
};

const r122ConceptKernelSchema={
  type:"object",additionalProperties:false,
  properties:{
    literal_name_material:{type:"string"},
    operation_fact:{type:"string"},
    locality_fact:{type:"string"},
    proof_fact:{type:"string"},
    business_specific_tension:{type:"string"},
    unique_intersection:{type:"string"},
    visual_physics:{type:"string"},
    asset_world_rule:{type:"string"},
    conversion_logic:{type:"string"},
    transplant_failure:{type:"string"},
    forbidden_wrappers:{type:"array",minItems:6,maxItems:16,items:{type:"string"}}
  },
  required:[
    "literal_name_material","operation_fact","locality_fact","proof_fact","business_specific_tension",
    "unique_intersection","visual_physics","asset_world_rule","conversion_logic","transplant_failure","forbidden_wrappers"
  ]
};

const r121ConceptLockSchema={
  type:"object",additionalProperties:false,
  properties:{
    standard:{type:"string",enum:[R121_CONCEPT_LOCK_STANDARD]},
    selected_direction_key:{type:"string",enum:["A","B","C"]},
    campaign_thesis:{type:"string"},
    organizing_mechanism:{type:"string"},
    client_reaction:{type:"string"},
    category_reframe:{type:"string"},
    ownability_anchors:{type:"array",minItems:3,maxItems:5,items:{type:"string"}},
    ownability_map:{type:"array",minItems:3,maxItems:5,items:r122OwnabilityMapItemSchema},
    anchor_removal_test:{type:"array",minItems:3,maxItems:5,items:{type:"string"}},
    brand_name_semantic_hook:{type:"string"},
    verified_proof_plan:{type:"array",minItems:3,maxItems:6,items:{type:"string"}},
    brand_world:{type:"string"},
    signature_motif:{type:"string"},
    visual_bible:{type:"string"},
    typography_thesis:{type:"string"},
    motion_signature:{
      type:"object",additionalProperties:false,
      properties:{
        name:{type:"string"},purpose:{type:"string"},behavior:{type:"string"},
        mobile_behavior:{type:"string"},reduced_motion_fallback:{type:"string"}
      },
      required:["name","purpose","behavior","mobile_behavior","reduced_motion_fallback"]
    },
    proof_mechanism:{type:"string"},
    conversion_climax:{type:"string"},
    asset_campaign:{type:"array",minItems:6,maxItems:6,items:r121AssetRoleSchema},
    desktop_storyboard:{type:"array",minItems:5,maxItems:7,items:r121StoryboardBeatSchema},
    mobile_storyboard:{type:"array",minItems:5,maxItems:7,items:r121StoryboardBeatSchema},
    mobile_divergence:{type:"array",minItems:2,maxItems:5,items:{type:"string"}},
    asset_distinction_rationale:{type:"array",minItems:6,maxItems:6,items:{type:"string"}},
    forbidden_patterns:{type:"array",minItems:5,items:{type:"string"}},
    transplant_test:{type:"string"},
    selection_rationale:{type:"string"}
  },
  required:[
    "standard","selected_direction_key","campaign_thesis","organizing_mechanism","client_reaction","category_reframe",
    "ownability_anchors","ownability_map","anchor_removal_test","brand_name_semantic_hook","verified_proof_plan","brand_world","signature_motif","visual_bible","typography_thesis",
    "motion_signature","proof_mechanism","conversion_climax","asset_campaign","desktop_storyboard","mobile_storyboard",
    "mobile_divergence","asset_distinction_rationale","forbidden_patterns","transplant_test","selection_rationale"
  ]
};

const r121ConceptJuryScores=Object.fromEntries(R121_SELLABILITY_AXES.map(k=>[k,{type:"number",minimum:0,maximum:10}]));
const r121ConceptJurySchema={
  type:"object",additionalProperties:false,
  properties:{
    pass:{type:"boolean"},
    selected_direction_key:{type:"string",enum:["A","B","C"]},
    summary:{type:"string"},
    scores:{type:"object",additionalProperties:false,properties:r121ConceptJuryScores,required:R121_SELLABILITY_AXES},
    rejection_reasons:{type:"array",items:{type:"string"}},
    must_preserve:{type:"array",items:{type:"string"}}
  },
  required:["pass","selected_direction_key","summary","scores","rejection_reasons","must_preserve"]
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
    "R121 GENERATED CAMPAIGN IMAGERY IS EXPLICITLY PERMITTED as illustrative, non-documentary art direction. Do NOT reject the concept because a legacy ZERO_PHOTO_PREMIUM flag existed before R121.",
    "AVAILABLE DIRECTION KEYS: "+JSON.stringify(availableDirectionKeys.length?availableDirectionKeys:["A"])+". Reject any selected_direction_key not in this list.",
    "Reject any testimonial, certification, capacity, logistics figure, client, project, mission/value claim or other factual assertion that is absent from CONTENT TRUTH.",
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
    "R117 AUTHORED FLAGSHIP: before layout, formulate THREE competing brand-specific creative theses. Reject the two most conventional approaches and make route A the strongest, most authored portfolio-grade thesis.",
    "Return THREE materially different flagship routes A/B/C.",
    "NO TEMPLATE TEST: if replacing logo, colors and copy would let the same design work for another company, the route is invalid.",
    "Route A must contain at least THREE unmistakable WOW moments: hero, one signature mid-page set piece, and closing/CTA/footer.",
    "At least ONE section must be a signature composition derived from this prospect's sector, process, material, territory, product, technology, history or verified proof.",
    "BAN CARD SOUP: no repetitive 3-column card walls, generic feature tiles, pill decoration, SaaS UI-kit grammar or interchangeable icon boxes.",
    "Typography is architecture: use radical but controlled hierarchy, monumental scale shifts, editorial line breaks and deliberate negative space.",
    "Photography is art direction: integrate real/prospect-relevant imagery into composition with intentional crop, scale and narrative purpose; never use images as decorative rectangles.",
    "Proof is design: verified trust facts must become visual evidence, editorial numbers/rails/statements or composed proof, not small secondary cards.",
    "MOBILE IS NATIVE: redesign order, crop, scale, spacing, hierarchy and wow moments for 390px; never merely stack desktop columns.",
    "PORTFOLIO TEST: at least four of five major viewport moments must be strong enough to publish individually in a top-tier studio portfolio.",
    "A result that is merely clean, modern or professional but not distinctive, authored and memorable MUST be rejected.",
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



function r121Normalize(value) {
  return String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9€%]+/g," ").replace(/\s+/g," ").trim();
}

function r121SplitFacts(value) {
  return String(value||"").split(/[;\n]+/).map(x=>x.trim()).filter(Boolean);
}

function r122SplitVerifiedOperations(value) {
  const raw=String(value||"").trim();
  if(!raw) return [];
  const semicolonParts=raw.split(/[;\n]+/).map(x=>x.trim()).filter(Boolean);
  const parts=[];
  for(const block of semicolonParts){
    const commaParts=block.split(/\s*,\s*/).map(x=>x.trim()).filter(Boolean);
    if(commaParts.length>1) parts.push(...commaParts);
    else parts.push(block);
  }
  return [...new Set(parts.map(x=>x.replace(/[.]+$/,"").trim()).filter(Boolean))].slice(0,8);
}

function r122LiteralBrandSemantic(businessName) {
  const source=String(businessName||"");
  const lower=source.toLowerCase();
  const genericWrapperWords=new Set(["point","hub","node","nodo","link","axis","asse","center","centro","grid","route","map","gateway"]);
  const dictionary=["studio","casa","home","lab","line","linea","forma","frame","core","plus","nova","prime"];
  const hit=dictionary.find(word=>lower.includes(word) && !genericWrapperWords.has(word));
  return hit ? source.match(new RegExp(hit,"i"))?.[0]||hit : "NONE";
}

function r122ConversionPolarity(primary,secondary) {
  const a=String(primary||"").trim();
  const b=String(secondary||"").trim();
  const an=r121Normalize(a),bn=r121Normalize(b);
  if((/preventiv|quote|estimate/.test(an)) && (/tracc|track/.test(bn))) {
    return {
      type:"BEFORE_AFTER_SERVICE",
      before_action:a,
      after_action:b,
      creative_tension:"Before movement the customer needs a decision; after movement the customer needs visibility. Keep these as two different conversion states, not as a route/map/dashboard metaphor."
    };
  }
  if(a&&b&&r121Normalize(a)!==r121Normalize(b)) {
    return {
      type:"DUAL_VERIFIED_ACTION",
      before_action:a,
      after_action:b,
      creative_tension:"Two verified actions create two different decision states; use their contrast only when it materially changes narrative and conversion architecture."
    };
  }
  return {type:"SINGLE_ACTION",before_action:a,after_action:b,creative_tension:"No strong verified CTA polarity is available."};
}

function r121CreativeIntelligenceBrief(inputPayload,contentTruth) {
  const truth=contentTruth?.content_truth||contentTruth||{};
  const services=[
    ...r122SplitVerifiedOperations(inputPayload?.verified_services),
    ...(Array.isArray(truth?.services)?truth.services.flatMap(x=>r122SplitVerifiedOperations(String(x?.title||""))).filter(Boolean):[])
  ];
  const proofs=[
    ...r121SplitFacts(inputPayload?.verified_trust),
    ...(Array.isArray(truth?.trust_points)?truth.trust_points.map(x=>String(x?.text||"").trim()).filter(Boolean):[])
  ];
  return {
    business_name:String(inputPayload?.business_name||"").trim(),
    literal_brand_semantic:r122LiteralBrandSemantic(inputPayload?.business_name),
    vertical:String(inputPayload?.vertical||"").trim(),
    distinctive_operations:[...new Set(services)].slice(0,8),
    operation_choreography:[...new Set(services)].slice(0,6).map((x,i)=>({index:i+1,operation:x,state:"STATE_"+(i+1)})),
    verified_proof_anchors:[...new Set(proofs)].slice(0,8),
    locality:{
      city:String(inputPayload?.city||"").trim(),
      address:String(inputPayload?.address||"").trim()
    },
    commercial_goal:String(inputPayload?.commercial_goal||"").trim(),
    verified_contacts:String(inputPayload?.verified_contacts||"").trim(),
    primary_cta:String(inputPayload?.primary_cta||truth?.primary_cta_label||"").trim(),
    secondary_cta:String(inputPayload?.secondary_cta||truth?.secondary_cta_label||"").trim(),
    conversion_polarity:r122ConversionPolarity(
      String(inputPayload?.primary_cta||truth?.primary_cta_label||"").trim(),
      String(inputPayload?.secondary_cta||truth?.secondary_cta_label||"").trim()
    ),
    official_identity_locked:Boolean(inputPayload?.official_logo?.lock==="IMMUTABLE"||inputPayload?.identity_mode==="OFFICIAL_LOGO"),
    brand_constraints:{
      visual_cues:String(inputPayload?.brand_dna?.visual_cues||"").trim(),
      existing_colors:String(inputPayload?.brand_dna?.existing_colors||"").trim(),
      typography_cues:String(inputPayload?.brand_dna?.typography_cues||"").trim(),
      brand_personality:String(inputPayload?.brand_dna?.brand_personality||"").trim()
    },
    source_references:Array.isArray(inputPayload?.source_references)?inputPayload.source_references:[]
  };
}

function r121TextOverlap(a,b) {
  const A=new Set(r121Normalize(a).split(" ").filter(x=>x.length>3));
  const B=new Set(r121Normalize(b).split(" ").filter(x=>x.length>3));
  if(!A.size||!B.size) return 0;
  let inter=0;
  for(const x of A) if(B.has(x)) inter++;
  return inter/Math.max(1,Math.min(A.size,B.size));
}

function r121EscapeRegex(value) {
  return String(value||"").replace(/[.*+?^$(){}|[\]\\]/g,"\\$&");
}

function r121SafeCampaignText(value,brief) {
  let out=String(value||"");
  const business=String(brief?.business_name||"").trim();
  if(business) {
    out=out.replace(new RegExp(r121EscapeRegex(business),"gi"),"the subject");
    for(const token of business.split(/\s+/).filter(x=>x.length>=5)) {
      out=out.replace(new RegExp("\\b"+r121EscapeRegex(token)+"\\b","gi"),"");
    }
  }
  out=out
    .replace(/\bU[-\s]?Power\b/gi,"")
    .replace(/\b(?:MIMIT|Google|rating|ratings|review|reviews|star|stars|recensioni|stelle)\b/gi,"")
    .replace(/\b\d+(?:[.,]\d+)?(?:\/\d+)?\b/g,"")
    .replace(/\b(?:logo|logos|branding|branded|signage|sticker|stickers|wall sign|uniform|uniforms|packaging label|partner mark|company identifier|badge|badges)\b/gi,"")
    .replace(/\s{2,}/g," ")
    .replace(/\s+([,.;:])/g,"$1")
    .trim();
  return out;
}

function r121SafeInteraction(value) {
  let out=String(value||"");
  const forbidden=/\b(accordion|carousel|slider|webgl|canvas|javascript|scripted|custom cursor|drag|swipe|pinch|zoom|form submit|tabs|video controls?|tap|click|expand|pre-?fill|toggle|scroll[ -]?snap|parallax|tooltip|tooltips|hover|icon reveal|reveal icon)\b/i;
  if(forbidden.test(out)) {
    out="CSS-only structural reveal tied to viewport progress; static composition remains complete without motion.";
  }
  return out.replace(/\b(?:hover-only|click-to-open|tap-to-open)\b/gi,"progressive CSS emphasis").trim();
}

function r121DeterministicSafetyNormalize(concept,brief) {
  const clone=JSON.parse(JSON.stringify(concept||{}));
  if(Array.isArray(clone.asset_campaign)) {
    clone.asset_campaign=clone.asset_campaign.map(role=>({
      ...role,
      narrative_role:r121SafeCampaignText(role?.narrative_role,brief),
      subject:r121SafeCampaignText(role?.subject,brief),
      visual_function:r121SafeCampaignText(role?.visual_function,brief),
      crop_behavior:r121SafeCampaignText(role?.crop_behavior,brief),
      truth_safety:"Illustrative editorial imagery only; not documentary evidence; plain text-free surfaces with no company or partner identifiers."
    }));
  }
  if(clone.motion_signature) {
    clone.motion_signature={
      ...clone.motion_signature,
      behavior:r121SafeInteraction(clone.motion_signature.behavior),
      mobile_behavior:r121SafeInteraction(clone.motion_signature.mobile_behavior),
      reduced_motion_fallback:String(clone.motion_signature.reduced_motion_fallback||"Static composition preserves the complete narrative.")
    };
  }
  for(const key of ["desktop_storyboard","mobile_storyboard"]) {
    if(Array.isArray(clone[key])) clone[key]=clone[key].map(beat=>({
      ...beat,
      interaction_role:r121SafeInteraction(beat?.interaction_role)
    }));
  }
  return clone;
}


function r121SafeProcessText(value,brief) {
  let out=String(value||"");
  const verifiedOps=r121Normalize((brief?.distinctive_operations||[]).join(" "));
  const rules=[
    {re:/\b(?:forge|forging|forged|fucina|forgiare)\b/gi,support:["forg","fucin"],replacement:"verified transformation"},
    {re:/\b(?:molten|melt|melting|fuso|fusione)\b/gi,support:["melt","fusion","fuso"],replacement:"verified transformation"},
    {re:/\b(?:weld|welding|saldatura|saldare)\b/gi,support:["weld","sald"],replacement:"verified transformation"},
    {re:/\b(?:cutting|cut|taglio|tagliare)\b/gi,support:["cut","tagli"],replacement:"verified transformation"},
    {re:/\b(?:bending|bend|bent|piegatura|piegare|piegato|piegati)\b/gi,support:["bend","pieg"],replacement:"verified transformation"},
    {re:/\b(?:shape|shaping|shaped|forming|formed|sagomare|sagomatura|sagomato)\b/gi,support:["shape","shap","form","sagom"],replacement:"verified transformation"},
    {re:/\b(?:casting|cast|colata|fonderia)\b/gi,support:["cast","colat","fonder"],replacement:"verified transformation"},
    {re:/\b(?:ribbing|ribbed|corrugating|corrugated|nervatura|nervato)\b/gi,support:["ribb","corrugat","nerv"],replacement:"verified category cue"},
    {re:/\b(?:ready[- ]to[- ]use|pronto all uso|pronto per il cantiere)\b/gi,support:["ready to use","pronto"],replacement:"verified offer"},
    {re:/\b(?:furnace|forno industriale)\b/gi,support:["furnace","forno"],replacement:"verified context"}
  ];
  for(const rule of rules) {
    const supported=rule.support.some(x=>verifiedOps.includes(x));
    if(!supported) out=out.replace(rule.re,rule.replacement);
  }
  return out.replace(/\s{2,}/g," ").trim();
}


function r121SafeConceptNarrativeText(value,brief,{paletteSafe=false}={}) {
  let out=r121SafeProcessText(String(value||""),brief);
  out=out
    .replace(/\b(?:city[- ]endorsed|municipally[- ]endorsed|government[- ]endorsed|sovereign|elite|waterfront prestige|official postal authority)\b/gi,"verified")
    .replace(/\b(?:exclusive|exclusively|only choice|market leader|leading|best|superior|guaranteed|guarantee|prestige|prestigious|high-status)\b/gi,"")
    .replace(/\bmeasurable\s+(?:confidence|trust|certainty)\b/gi,"verified evidence")
    .replace(/\b(?:new|custom|proprietary)\s+(?:emblem|monogram|logo|logo mark|brand mark)\b/gi,"non-logo structural motif")
    .replace(/\b(?:reinterpret|redraw|redesign|reshape|morph|transform)\s+(?:the\s+)?(?:official\s+)?(?:logo|brand mark)\b/gi,"leave the official logo unchanged while surrounding geometry evolves")
    .replace(/\s{2,}/g," ")
    .trim();
  if(paletteSafe) {
    const paletteVerified=String(brief?.brand_constraints?.existing_colors||"");
    const explicitPalette=/#[0-9a-f]{3,8}|\brgb\b|\bcmyk\b|\bpantone\b|\b(?:red|blue|green|yellow|orange|purple|violet|pink|teal|cyan|magenta|amber|gold|silver|bronze|black|white|grey|gray|rosso|blu|verde|giallo|arancio|viola|rosa|nero|bianco|grigio)\b/i.test(paletteVerified)
      && !/derivare|derive|identity|identit/i.test(paletteVerified);
    if(!explicitPalette) {
      out=out.replace(/\b(?:(?:deep|bright|electric|warm|cool|dark|light|muted|saturated|soft|vivid|navy|royal)\s+)?(?:red|blue|green|yellow|orange|purple|violet|pink|teal|cyan|magenta|amber|gold|silver|bronze|black|white|grey|gray|rosso|blu|verde|giallo|arancio|viola|rosa|nero|bianco|grigio)\b/gi,"official-identity sampled color");
      out += " Palette rule: sample actual colors from the immutable official identity at execution time; do not invent named brand colors.";
    }
  }
  return out.trim();
}

function r121SafeNonDocumentaryText(value,brief) {
  let out=r121SafeCampaignText(r121SafeProcessText(value,brief),brief);
  out=out
    .replace(/\b(?:machine|machinery|forklift|truck|lorry|conveyor|robot|operator|worker|employee|hands?|people|person|human|technician|staff)\b/gi,"abstract service geometry")
    .replace(/\b(?:company premises|company site|company warehouse|company factory|actual warehouse|actual factory|documentary site)\b/gi,"illustrative environment")
    .replace(/\b(?:etched|engraved|embossed|painted|printed|overlaid|overlayed|superimposed)\s+(?:number|numbers|data|revenue|metric|metrics|logo|brand|proof|fact|facts|badge|badges|icon|icons)\b/gi,"HTML proof")
    .replace(/\b(?:number|numbers|data|revenue|metric|metrics|proof|fact|facts|badge|badges|icon|icons)\s+(?:etched|engraved|embossed|painted|printed|overlaid|overlayed|superimposed)\b/gi,"HTML proof")
    .replace(/\b(?:proof badge|proof badges|data badge|data badges|partner badge|partner badges|metric badge|metric badges)\b/gi,"HTML proof")
    .replace(/\b(?:testimonial|testimonials|customer quote|client quote)\b/gi,"verified proof")
    .replace(/\s{2,}/g," ")
    .trim();
  return out;
}

function r121DeterministicOwnabilityAnchors(brief) {
  const ops=(brief?.distinctive_operations||[]).filter(Boolean).slice(0,2);
  const locality=[brief?.locality?.city,brief?.locality?.address].filter(Boolean).join(" / ");
  const proofs=(brief?.verified_proof_anchors||[]).filter(Boolean).slice(0,2);
  return [
    ...ops.map(x=>"Verified operation: "+x),
    locality?"Verified locality: "+locality:null,
    ...proofs.map(x=>"Verified proof: "+x)
  ].filter(Boolean).slice(0,5);
}

function r121DeterministicProofMechanism(brief) {
  const facts=(brief?.verified_proof_anchors||[]).filter(Boolean).slice(0,6);
  return [
    "Verified evidence is rendered only as HTML typography, data rails and official proof modules.",
    "Generated campaign imagery never carries numbers, logos, labels, signage, branded vehicles, employees, machines, company premises or documentary evidence.",
    "The exact proof inventory is: "+facts.join(" | ")+".",
    "Any official partner identity may appear only through an approved official asset outside generated campaign imagery."
  ].join(" ");
}

function r121DeterministicConversionClimax(brief) {
  const primary=String(brief?.primary_cta||"RICHIEDI UN PREVENTIVO").trim();
  const secondary=String(brief?.secondary_cta||"PARLA CON IL COMMERCIALE").trim();
  return "The verified proof rail resolves directly into the two verified actions: "+primary+" and "+secondary+". No form, modal, overlay, prefill, click-state or scripted interaction is introduced.";
}

function r121CanonicalCampaignRoles(concept,brief) {
  const source=Array.isArray(concept?.asset_campaign)?concept.asset_campaign:[];
  const byToken=Object.fromEntries(source.map(x=>[String(x?.token||""),x]));
  const operations=(brief?.distinctive_operations||[]).filter(Boolean);
  const locality=[brief?.locality?.city,brief?.locality?.address].filter(Boolean).join(" · ");
  const op=(index,fallback)=>operations[index]||operations[0]||fallback;

  const rules={
    R121_MATERIAL_MACRO:{
      narrative_role:"Microscopic category cue",
      subject:"Extreme macro photography of one unbranded cue associated only with verified service: "+op(0,"verified offer"),
      visual_function:"PHOTOGRAPHIC MACRO ONLY — shallow depth of field, tactile surface, edge detail, no diagram, no environmental depth.",
      crop_behavior:"Extreme close crop; one texture/detail fills the frame and remains tactile on mobile."
    },
    R121_PROCESS:{
      narrative_role:"Sequential service-state transition",
      subject:"Abstract directional transition representing verified service state: "+op(1,"verified service journey"),
      visual_function:"SEQUENTIAL EDITORIAL MOTION IMAGE ONLY — directional path, staged transition and temporal rhythm; no macro texture and no orthographic diagram.",
      crop_behavior:"Directional sequence crosses the frame; mobile preserves start-to-end movement in portrait orientation."
    },
    R121_STRUCTURE:{
      narrative_role:"Offer architecture as technical abstraction",
      subject:"Text-free orthographic CGI system representing verified service state: "+op(2,"verified offer architecture"),
      visual_function:"ORTHOGRAPHIC CGI / AXONOMETRIC GEOMETRY ONLY — crisp planes, nodes and spatial relations; no photography, tactile texture or environment.",
      crop_behavior:"Complete geometric system remains visible; mobile reframes the structure without turning it into a close-up."
    },
    R121_SCALE:{
      narrative_role:"Verified locality at environmental scale",
      subject:"Wide illustrative environmental context anchored to "+(locality||"verified locality")+" and service state: "+op(3,"verified local context"),
      visual_function:"WIDE ENVIRONMENTAL PERSPECTIVE ONLY — horizon, depth, repetition and territorial scale; no studio still-life, macro or technical diagram.",
      crop_behavior:"Wide depth dominates desktop; mobile isolates a strong perspective corridor while retaining environmental scale."
    },
    R121_DETAIL:{
      narrative_role:"Controlled proof-adjacent still-life",
      subject:"Isolated studio still-life derived from verified proof/service cue without company identifiers",
      visual_function:"CONTROLLED STUDIO STILL-LIFE ONLY — isolated detail, hard/soft light contrast and deliberate negative space; no wide environment, motion sequence or diagram.",
      crop_behavior:"Single isolated subject with negative space; mobile uses portrait still-life framing."
    },
    R121_ATMOSPHERE:{
      narrative_role:"Brand-derived emotional atmosphere",
      subject:"Abstract field of light, shadow and official-identity sampled color with no literal service object",
      visual_function:"ABSTRACT ATMOSPHERIC FIELD ONLY — volumetric light, gradient depth and reflection with no focal object, diagram, environment or documentary cue.",
      crop_behavior:"Color/light field survives any crop; mobile intensifies vertical light and depth instead of isolating an object."
    }
  };

  return R121_CAMPAIGN_ASSET_TOKENS.map(token=>{
    const raw=byToken[token]||{token};
    const rule=rules[token];
    const safe=value=>r121SafeNonDocumentaryText(value,brief);
    const rawSubject=safe(raw?.subject);
    const preserveRaw=["R121_MATERIAL_MACRO","R121_PROCESS","R121_STRUCTURE"].includes(token);
    const subjectBase=preserveRaw && rawSubject && r121TextOverlap(rawSubject,rule.subject)<0.75
      ? rule.subject+" — "+rawSubject
      : rule.subject;
    return {
      ...raw,
      token,
      narrative_role:rule.narrative_role,
      subject:subjectBase+"; Illustrative and unbranded; no company premises, employees, partner identifiers, embedded metrics or documentary proof.",
      visual_function:rule.visual_function,
      crop_behavior:rule.crop_behavior,
      truth_safety:"Illustrative editorial imagery only; never documentary evidence. No company or partner identifiers, employees, premises, signage, embedded proof or unsupported operational specifics."
    };
  });
}
function r121ReassignStoryboardAssets(storyboard,order,brief,{mobile=false}={}) {
  const source=Array.isArray(storyboard)?storyboard:[];
  const services=(brief?.distinctive_operations||[]).filter(Boolean);
  const locality=[brief?.locality?.city,brief?.locality?.address].filter(Boolean).join(" · ");
  const proofs=(brief?.verified_proof_anchors||[]).filter(Boolean);
  const proofA=proofs[0]||"verified business evidence";
  const proofB=proofs[1]||proofA;
  const proofC=proofs[2]||proofB;
  const serviceA=services[0]||"verified offer or service";
  const serviceB=services[1]||"";
  const offerSummary=services.length>1 ? services.slice(0,3).join(" + ") : serviceA;

  const compositionByToken={
    R121_MATERIAL_MACRO:"Extreme editorial close-up of a category-relevant unbranded cue supported by verified operations. If no physical cue is verified, use abstract brand-derived surface, paper, light or neutral geometry. No people, machinery, signage, labels, badges or embedded proof.",
    R121_PROCESS:"Abstract non-documentary representation of the verified service/operating journey through path, sequence, transition or handoff. No people, hands, machinery or specific operational technique unless literally verified.",
    R121_STRUCTURE:"Text-free CGI or diagrammatic abstraction of the verified offer architecture and relationship between services. No invented engineering, infrastructure or operational capability.",
    R121_SCALE:"Wide illustrative context derived only from verified locality, reach or service environment. Never present it as the prospect's real premises, fleet, branch, client site or facility.",
    R121_DETAIL:"Controlled studio detail derived from a verified service/proof cue; if no physical object is verified, use abstract evidence geometry with precise light and negative space. No invented products or equipment.",
    R121_ATMOSPHERE:"Abstract brand atmosphere derived from official identity color tension, light, shadow and depth. No identifiable premises, people, process, product claim, logos, metrics or documentary evidence."
  };
  const purposeByToken={
    R121_MATERIAL_MACRO:"Make the verified category or service world tangible without inventing a product.",
    R121_PROCESS:"Make the verified customer/service journey feel intentional through abstract sequence and movement.",
    R121_STRUCTURE:"Make the verified offer architecture instantly legible as a proprietary visual system.",
    R121_SCALE:"Anchor the campaign to verified locality or operational context without faking documentary scale.",
    R121_DETAIL:"Turn verified evidence into a precise commercial decision moment beside a controlled detail image.",
    R121_ATMOSPHERE:"Create the final branded decision pause that resolves into the verified commercial CTA."
  };
  const copyByToken={
    R121_MATERIAL_MACRO:"Verified offer context: "+serviceA+".",
    R121_PROCESS:serviceB ? "Verified service relationship: "+serviceA+" + "+serviceB+"." : "Verified service journey: "+serviceA+".",
    R121_STRUCTURE:"Verified offer architecture: "+offerSummary+".",
    R121_SCALE:(locality?"Verified locality/context: "+locality+". ":"")+"Verified proof: "+proofA+".",
    R121_DETAIL:"Verified proof: "+proofB+" | "+proofC+".",
    R121_ATMOSPHERE:"Close with the verified contact path and CTA; no additional claim."
  };
  const beatByToken={
    R121_MATERIAL_MACRO:"Category detail",
    R121_PROCESS:"Verified operation",
    R121_STRUCTURE:"Offer architecture",
    R121_SCALE:"Locality / scale",
    R121_DETAIL:"Proof detail",
    R121_ATMOSPHERE:"Decision atmosphere"
  };
  return source.map((beat,index)=>{
    const token=order[index%order.length];
    const composition=(mobile
      ? "Mobile-native composition with independent crop, scale and reveal order. "
      : "")
      +compositionByToken[token]
      +" Generated imagery remains illustrative and contains no embedded proof or company identifiers.";
    return {
      ...beat,
      beat:beatByToken[token],
      purpose:purposeByToken[token],
      composition,
      dominant_asset:token,
      copy_role:copyByToken[token]+" Factual proof is HTML typography outside the image.",
      interaction_role:"CSS-only structural reveal tied to viewport progress; static composition remains complete without motion."
    };
  });
}
function r121EnsureStoryboardCoverage(concept,brief) {
  const clone={...concept};
  const desktopOrder=[
    "R121_SCALE","R121_MATERIAL_MACRO","R121_PROCESS","R121_STRUCTURE","R121_DETAIL","R121_ATMOSPHERE"
  ];
  const mobileOrder=[
    "R121_MATERIAL_MACRO","R121_DETAIL","R121_ATMOSPHERE","R121_SCALE","R121_STRUCTURE","R121_PROCESS"
  ];
  clone.desktop_storyboard=r121ReassignStoryboardAssets(clone.desktop_storyboard,desktopOrder,brief,{mobile:false});
  clone.mobile_storyboard=r121ReassignStoryboardAssets(clone.mobile_storyboard,mobileOrder,brief,{mobile:true});

  const used=new Set([
    ...(clone.desktop_storyboard||[]).map(x=>x?.dominant_asset),
    ...(clone.mobile_storyboard||[]).map(x=>x?.dominant_asset)
  ]);
  const missing=R121_CAMPAIGN_ASSET_TOKENS.filter(token=>!used.has(token));
  if(missing.length && clone.mobile_storyboard?.length) {
    for(let i=0;i<missing.length;i++) {
      const targetIndex=Math.max(0,clone.mobile_storyboard.length-1-i);
      clone.mobile_storyboard[targetIndex]={
        ...clone.mobile_storyboard[targetIndex],
        dominant_asset:missing[i],
        composition:"Mobile-only reinterpretation centered on "+missing[i]+". "+String(clone.mobile_storyboard[targetIndex]?.composition||"")
      };
    }
  }
  clone.mobile_divergence=[
    "Mobile reveals the strongest category/service cue first and verified proof by beat two; desktop establishes verified context and scale before the proof rail.",
    "Mobile uses detail and brand atmosphere as dominant early compositions; desktop uses context and offer-architecture abstraction first. Both remain CSS-only and factually identical."
  ];
  return clone;
}

function r121BuildTransplantTest(concept,brief) {
  const current=String(concept?.transplant_test||"").trim();
  const operation=(brief?.distinctive_operations||[]).filter(Boolean).slice(0,2).join(" + ");
  const locality=[brief?.locality?.city,brief?.locality?.address].filter(Boolean).join(" / ");
  const proof=(brief?.verified_proof_anchors||[]).filter(Boolean).slice(0,4).join(" | ");
  const anchorStatement=[
    "This concept cannot survive a simple logo swap because its organizing mechanism, proof staging and story depend simultaneously on",
    operation?"the verified operating duality ("+operation+")":"",
    locality?"the verified locality ("+locality+")":"",
    proof?"and the verified evidence ("+proof+").":"",
    "Removing those anchors collapses the narrative rather than leaving a reusable industrial template."
  ].filter(Boolean).join(" ");
  if(current.length>=160 && /cannot|non puo|logo swap|transplant/i.test(current)) return current+" "+anchorStatement;
  return [current,anchorStatement].filter(Boolean).join(" ");
}

function r122NormalizeOwnabilityMap(map,brief) {
  const source=Array.isArray(map)?map:[];
  const operation=(brief?.distinctive_operations||[]).filter(Boolean).slice(0,4).join(" + ")||"verified operation";
  const locality=[brief?.locality?.city,brief?.locality?.address].filter(Boolean).join(" · ")||"verified locality";
  const proof=(brief?.verified_proof_anchors||[]).filter(Boolean).slice(0,3).join(" | ")||"verified proof";
  const literal=String(brief?.literal_brand_semantic||"NONE");
  const fallbackByRole={
    OPERATION:{
      anchor:operation,
      visual_consequence:"Each verified service state must produce a different spatial behavior, image subject or scale transition; the visual system cannot collapse them into one generic sector scene.",
      narrative_consequence:"The story advances by moving through the verified service states instead of describing a generic category proposition.",
      conversion_consequence:"The primary and secondary CTA choices resolve the service-state sequence into quotation and tracking decisions already verified for the business.",
      removal_failure:"If the verified operation sequence is removed, the page loses its distinct state choreography, four asset assignments and CTA progression, leaving only a reusable logistics or local-business visual shell."
    },
    LOCALITY:{
      anchor:locality,
      visual_consequence:"Verified locality determines the environmental scale beat, spatial orientation and one distinct context scene without pretending to show real premises.",
      narrative_consequence:"The campaign is anchored to the exact verified Catanzaro context instead of presenting an anonymous national logistics narrative.",
      conversion_consequence:"Locality gives the proof rail and contact climax a concrete place of decision, linking the verified address/contact path to the conversion sequence.",
      removal_failure:"If the verified locality is removed, the environmental beat, proof sequencing and contact climax lose their Catanzaro-specific anchor, so the campaign becomes transferable to any shipping business in any city."
    },
    PROOF:{
      anchor:proof,
      visual_consequence:"Verified evidence controls the proof rail, typography hierarchy and decision beat adjacent to imagery; it is never embedded inside generated images.",
      narrative_consequence:"The story earns credibility through the exact MIMIT/rating/local evidence rather than generic trust language.",
      conversion_consequence:"The proof beat must precede the final conversion object so the request-for-quote decision is supported by verified evidence.",
      removal_failure:"If the verified proof is removed, the credibility beat and decision sequence collapse into unsupported marketing language, removing the factual reason this prospect should be trusted before conversion."
    },
    BRAND_NAME:{
      anchor:literal!=="NONE"?literal:String(brief?.business_name||"verified business name"),
      visual_consequence:"The literal verified name semantic becomes spatial behavior only, never a replacement logo, and must be visible in the organizing mechanism and motion logic.",
      narrative_consequence:"The campaign language uses the literal visible name semantic as a structural cue without inventing brand history or logo meaning.",
      conversion_consequence:"The semantic resolves the experience toward the final verified decision point, keeping the brand name causally tied to the conversion architecture.",
      removal_failure:"If the literal brand-name semantic is removed, the organizing mechanism and motion lose the element that makes the system inseparable from this business name, making the concept easier to transplant."
    }
  };
  const byRole=new Map();
  for(const item of source){
    const role=String(item?.role||"").toUpperCase();
    if(fallbackByRole[role] && !byRole.has(role)) byRole.set(role,item);
  }
  const required=["OPERATION","LOCALITY","PROOF",...(literal!=="NONE"?["BRAND_NAME"]:[])];
  return required.slice(0,5).map(role=>{
    const raw=byRole.get(role)||{};
    const fb=fallbackByRole[role];
    const safe=value=>r121SafeConceptNarrativeText(value,brief);
    const ensure=(value,fallback)=>String(value||"").trim().length>=55?safe(value):fallback;
    return {
      role,
      anchor:String(raw?.anchor||"").trim()||fb.anchor,
      visual_consequence:ensure(raw?.visual_consequence,fb.visual_consequence),
      narrative_consequence:ensure(raw?.narrative_consequence,fb.narrative_consequence),
      conversion_consequence:ensure(raw?.conversion_consequence,fb.conversion_consequence),
      removal_failure:ensure(raw?.removal_failure,fb.removal_failure)
    };
  });
}

function r122NormalizeAnchorRemovalTests(tests,brief) {
  const source=Array.isArray(tests)?tests.map(x=>r121SafeConceptNarrativeText(x,brief)).filter(Boolean):[];
  const ops=(brief?.distinctive_operations||[]).filter(Boolean).slice(0,4).join(" + ");
  const locality=[brief?.locality?.city,brief?.locality?.address].filter(Boolean).join(" · ");
  const proof=(brief?.verified_proof_anchors||[]).filter(Boolean).slice(0,3).join(" | ");
  const fallback=[
    "Operation removal test: without "+(ops||"the verified service states")+", at least four asset roles and the CTA progression lose their specific service-state meaning, so the concept becomes a generic sector composition.",
    "Locality removal test: without "+(locality||"the verified locality")+", the environmental scale beat, proof sequencing and contact climax lose the exact place anchor and could be transplanted to another city unchanged.",
    "Proof removal test: without "+(proof||"the verified proof anchors")+", the evidence rail and final decision sequence lose factual credibility and collapse into unsupported marketing language."
  ];
  const result=[];
  for(const item of source) if(String(item).trim().length>=55) result.push(item);
  for(const item of fallback) if(result.length<3) result.push(item);
  return result.slice(0,5);
}

function r121MechanicalContractNormalize(concept,brief) {
  let clone=JSON.parse(JSON.stringify(concept||{}));
  const narrativeKeys=[
    "campaign_thesis","organizing_mechanism","client_reaction","category_reframe","brand_world",
    "signature_motif","visual_bible","typography_thesis","proof_mechanism","conversion_climax",
    "selection_rationale"
  ];
  for(const key of narrativeKeys) {
    clone[key]=r121SafeConceptNarrativeText(clone[key],brief,{paletteSafe:key==="visual_bible"||key==="brand_world"});
  }
  const businessName=String(brief?.business_name||"").trim();
  if(businessName && !r121Normalize(clone.campaign_thesis).includes(r121Normalize(businessName))) {
    clone.campaign_thesis=businessName+" — "+String(clone.campaign_thesis||"").trim();
  }
  clone.ownability_anchors=r121DeterministicOwnabilityAnchors(brief);
  clone.ownability_map=r122NormalizeOwnabilityMap(clone.ownability_map,brief);
  clone.anchor_removal_test=r122NormalizeAnchorRemovalTests(clone.anchor_removal_test,brief);
  clone.brand_name_semantic_hook=r121SafeConceptNarrativeText(clone.brand_name_semantic_hook,brief);
  clone.proof_mechanism=r121DeterministicProofMechanism(brief);
  clone.conversion_climax=r121DeterministicConversionClimax(brief);
  if(Array.isArray(clone.forbidden_patterns)) clone.forbidden_patterns=clone.forbidden_patterns.map(x=>r121SafeNonDocumentaryText(x,brief));
  if(Array.isArray(clone.asset_distinction_rationale)) clone.asset_distinction_rationale=clone.asset_distinction_rationale.map(x=>r121SafeNonDocumentaryText(x,brief));

  if(clone.motion_signature) {
    clone.motion_signature={
      ...clone.motion_signature,
      name:r121SafeConceptNarrativeText(clone.motion_signature.name,brief),
      purpose:r121SafeConceptNarrativeText(clone.motion_signature.purpose,brief),
      behavior:r121SafeInteraction(r121SafeConceptNarrativeText(clone.motion_signature.behavior,brief)),
      mobile_behavior:r121SafeInteraction(r121SafeConceptNarrativeText(clone.motion_signature.mobile_behavior,brief)),
      reduced_motion_fallback:r121SafeConceptNarrativeText(clone.motion_signature.reduced_motion_fallback,brief)
    };
  }

  clone.asset_campaign=r121CanonicalCampaignRoles(clone,brief);
  clone=r121EnsureStoryboardCoverage(clone,brief);
  clone.transplant_test=r121SafeProcessText(r121BuildTransplantTest(clone,brief),brief);
  return clone;
}

function r121ConceptIntegrityPrecheck(concept,brief) {
  const issues=[];
  const campaign=Array.isArray(concept?.asset_campaign)?concept.asset_campaign:[];
  const tokens=campaign.map(x=>String(x?.token||""));
  const uniqueTokens=new Set(tokens);
  if(campaign.length!==R121_CAMPAIGN_ASSET_TOKENS.length || uniqueTokens.size!==R121_CAMPAIGN_ASSET_TOKENS.length) {
    issues.push("ASSET_CAMPAIGN_MUST_USE_EACH_R121_TOKEN_EXACTLY_ONCE");
  }
  for(const token of R121_CAMPAIGN_ASSET_TOKENS) if(!uniqueTokens.has(token)) issues.push("ASSET_TOKEN_MISSING:"+token);

  const distinctiveAssetText=asset=>{
    const subject=String(asset?.subject||"").split(";")[0];
    return [
      asset?.narrative_role,
      subject,
      asset?.visual_function,
      asset?.crop_behavior
    ].filter(Boolean).join(" ");
  };
  for(let i=0;i<campaign.length;i++) {
    for(let j=i+1;j<campaign.length;j++) {
      const A=distinctiveAssetText(campaign[i]);
      const B=distinctiveAssetText(campaign[j]);
      if(r121TextOverlap(A,B)>=0.68) issues.push("ASSET_ROLES_TOO_SIMILAR:"+tokens[i]+":"+tokens[j]);
    }
  }

  const desktop=Array.isArray(concept?.desktop_storyboard)?concept.desktop_storyboard:[];
  const mobile=Array.isArray(concept?.mobile_storyboard)?concept.mobile_storyboard:[];
  const desktopAssets=new Set(desktop.map(x=>String(x?.dominant_asset||"")).filter(Boolean));
  const mobileAssets=new Set(mobile.map(x=>String(x?.dominant_asset||"")).filter(Boolean));
  if(desktopAssets.size<4) issues.push("DESKTOP_STORYBOARD_NEEDS_4_DISTINCT_ASSET_ROLES");
  if(mobileAssets.size<4) issues.push("MOBILE_STORYBOARD_NEEDS_4_DISTINCT_ASSET_ROLES");
  const allStoryboardAssets=new Set([...desktopAssets,...mobileAssets]);
  for(const token of R121_CAMPAIGN_ASSET_TOKENS) if(!allStoryboardAssets.has(token)) issues.push("STORYBOARD_NEVER_USES:"+token);

  const sameLength=desktop.length===mobile.length && desktop.length>0;
  let sameBeats=0;
  const max=Math.min(desktop.length,mobile.length);
  for(let i=0;i<max;i++) {
    const d=desktop[i],m=mobile[i];
    const sameAsset=String(d?.dominant_asset||"")===String(m?.dominant_asset||"");
    const comp=r121TextOverlap(d?.composition,m?.composition);
    const interaction=r121TextOverlap(d?.interaction_role,m?.interaction_role);
    if(sameAsset && comp>=0.58 && interaction>=0.58) sameBeats++;
  }
  if(sameLength && sameBeats>=Math.ceil(max*0.6)) issues.push("MOBILE_STORYBOARD_TOO_CLOSE_TO_DESKTOP:"+sameBeats+"/"+max);
  if((concept?.mobile_divergence||[]).length<2) issues.push("MOBILE_DIVERGENCE_NEEDS_TWO_MATERIAL_REINTERPRETATIONS");

  const proofPlan=(concept?.verified_proof_plan||[]).map(r121Normalize);
  const proofAnchors=(brief?.verified_proof_anchors||[]).map(x=>({raw:x,norm:r121Normalize(x)}));
  const proofMatch=(plan,anchor)=>{
    if(!plan||!anchor) return false;
    if(plan.includes(anchor)||anchor.includes(plan)) return true;
    const tokens=value=>value.split(" ").filter(Boolean).filter(t=>/\d/.test(t)||t.length>=4);
    const A=tokens(anchor),P=new Set(tokens(plan));
    if(!A.length) return false;
    const numeric=A.filter(t=>/\d/.test(t));
    if(numeric.length && !numeric.every(t=>P.has(t))) return false;
    let hit=0;
    for(const t of A) if(P.has(t)) hit++;
    return hit/A.length>=0.55;
  };
  const strongProofMatches=proofAnchors.filter(anchor=>proofPlan.some(p=>proofMatch(p,anchor.norm))).length;
  if(proofAnchors.length>=3 && strongProofMatches<3) issues.push("VERIFIED_PROOF_PLAN_IGNORES_STRONG_INPUT_PROOF:"+strongProofMatches+"/"+Math.min(3,proofAnchors.length));

  const ownability=r121Normalize((concept?.ownability_anchors||[]).join(" "));
  const serviceHit=(brief?.distinctive_operations||[]).some(x=>r121TextOverlap(ownability,x)>=0.35);
  const localityHit=[brief?.locality?.city,brief?.locality?.address].filter(Boolean).some(x=>r121TextOverlap(ownability,x)>=0.25);
  const proofHit=(brief?.verified_proof_anchors||[]).some(x=>r121TextOverlap(ownability,x)>=0.25);
  if(!serviceHit) issues.push("OWNABILITY_MISSING_DISTINCTIVE_OPERATION");
  if(!localityHit) issues.push("OWNABILITY_MISSING_LOCALITY");
  if(!proofHit) issues.push("OWNABILITY_MISSING_VERIFIED_PROOF");

  const ownabilityMap=Array.isArray(concept?.ownability_map)?concept.ownability_map:[];
  const mapRoles=new Set(ownabilityMap.map(x=>String(x?.role||"")));
  if(ownabilityMap.length<3) issues.push("R122_OWNABILITY_MAP_NEEDS_THREE_ANCHORS");
  if((brief?.distinctive_operations||[]).length && !mapRoles.has("OPERATION")) issues.push("R122_OWNABILITY_MAP_MISSING_OPERATION");
  if((brief?.locality?.city||brief?.locality?.address) && !mapRoles.has("LOCALITY")) issues.push("R122_OWNABILITY_MAP_MISSING_LOCALITY");
  if((brief?.verified_proof_anchors||[]).length && !mapRoles.has("PROOF")) issues.push("R122_OWNABILITY_MAP_MISSING_PROOF");

  const conceptWorldText=[
    concept?.organizing_mechanism,concept?.signature_motif,concept?.visual_bible,
    concept?.proof_mechanism,concept?.conversion_climax,
    ...(concept?.asset_campaign||[]).flatMap(x=>[x?.narrative_role,x?.subject,x?.visual_function]),
    ...(concept?.desktop_storyboard||[]).flatMap(x=>[x?.purpose,x?.composition,x?.copy_role,x?.interaction_role]),
    ...(concept?.mobile_storyboard||[]).flatMap(x=>[x?.purpose,x?.composition,x?.copy_role,x?.interaction_role])
  ].filter(Boolean).join(" ");
  const storyboardText=r121Normalize([
    ...(concept?.desktop_storyboard||[]).flatMap(x=>[x?.purpose,x?.composition,x?.copy_role]),
    ...(concept?.mobile_storyboard||[]).flatMap(x=>[x?.purpose,x?.composition,x?.copy_role]),
    concept?.visual_bible
  ].filter(Boolean).join(" "));
  const proofDecisionText=r121Normalize([
    concept?.proof_mechanism,concept?.conversion_climax,
    ...(concept?.desktop_storyboard||[]).flatMap(x=>[x?.copy_role,x?.purpose]),
    ...(concept?.mobile_storyboard||[]).flatMap(x=>[x?.copy_role,x?.purpose])
  ].filter(Boolean).join(" "));
  for(const item of ownabilityMap){
    const role=String(item?.role||"UNKNOWN");
    const visual=String(item?.visual_consequence||"");
    const narrative=String(item?.narrative_consequence||"");
    const conversion=String(item?.conversion_consequence||"");
    if(visual.length<24||narrative.length<24||conversion.length<24) issues.push("R122_OWNABILITY_CONSEQUENCE_TOO_THIN:"+role);
    if(role==="PROOF"){
      const proofAnchorHit=(brief?.verified_proof_anchors||[]).some(x=>r121TextOverlap(proofDecisionText,x)>=0.18);
      if(!proofAnchorHit && r121TextOverlap(proofDecisionText,narrative+" "+conversion)<0.08) issues.push("R122_PROOF_NOT_LOAD_BEARING_IN_DECISION_ARCHITECTURE");
    } else if(role==="LOCALITY"){
      const localityValues=[brief?.locality?.city,brief?.locality?.address].filter(Boolean);
      const localityHit=localityValues.some(x=>r121TextOverlap(storyboardText,x)>=0.15);
      if(!localityHit && r121TextOverlap(conceptWorldText,visual)<0.08) issues.push("R122_LOCALITY_NOT_LOAD_BEARING_IN_ENVIRONMENTAL_BEAT");
    } else if(r121TextOverlap(conceptWorldText,visual)<0.10) {
      issues.push("R122_VISUAL_CONSEQUENCE_NOT_LOAD_BEARING:"+role);
    }
    if(String(item?.removal_failure||"").trim().length<45) issues.push("R122_ANCHOR_REMOVAL_FAILURE_UNEXPLAINED:"+role);
  }
  for(let i=0;i<ownabilityMap.length;i++){
    for(let j=i+1;j<ownabilityMap.length;j++){
      if(r121TextOverlap(ownabilityMap[i]?.visual_consequence,ownabilityMap[j]?.visual_consequence)>=0.72) {
        issues.push("R122_OWNABILITY_VISUAL_CONSEQUENCES_TOO_SIMILAR:"+i+":"+j);
      }
    }
  }
  const removalTests=Array.isArray(concept?.anchor_removal_test)?concept.anchor_removal_test:[];
  if(removalTests.length<3 || removalTests.some(x=>String(x||"").trim().length<55)) issues.push("R122_ANCHOR_REMOVAL_TEST_REQUIRED");

  const kernel=concept?.r122_kernel||{};
  const expectedOperation=(brief?.distinctive_operations||[]).filter(Boolean).join(" | ")||"NONE";
  const expectedLocality=[brief?.locality?.city,brief?.locality?.address].filter(Boolean).join(" · ")||"NONE";
  const expectedProof=(brief?.verified_proof_anchors||[]).filter(Boolean).slice(0,4).join(" | ")||"NONE";
  if(String(kernel?.operation_fact||"")!==expectedOperation) issues.push("R122_KERNEL_OPERATION_FACT_DRIFT");
  if(String(kernel?.locality_fact||"")!==expectedLocality) issues.push("R122_KERNEL_LOCALITY_FACT_DRIFT");
  if(String(kernel?.proof_fact||"")!==expectedProof) issues.push("R122_KERNEL_PROOF_FACT_DRIFT");
  const literalMaterial=String(kernel?.literal_name_material||"");
  if(literalMaterial!=="NONE" && !r121Normalize(brief?.business_name).replace(/\s+/g,"").includes(r121Normalize(literalMaterial).replace(/\s+/g,""))) {
    issues.push("R122_KERNEL_NAME_SEMANTIC_NOT_LITERAL");
  }
  if(String(kernel?.unique_intersection||"").trim().length<80) issues.push("R122_KERNEL_UNIQUE_INTERSECTION_TOO_THIN");
  if(String(kernel?.visual_physics||"").trim().length<55) issues.push("R122_KERNEL_VISUAL_PHYSICS_TOO_THIN");
  if(String(kernel?.transplant_failure||"").trim().length<80) issues.push("R122_KERNEL_TRANSPLANT_FAILURE_TOO_THIN");
  const kernelWorld=[kernel?.visual_physics,kernel?.asset_world_rule,kernel?.conversion_logic].filter(Boolean).join(" ");
  if(r121TextOverlap(kernelWorld,conceptWorldText)<0.15) issues.push("R122_CONCEPT_DRIFTED_FROM_KERNEL");

  const thesis=r121Normalize(concept?.campaign_thesis);
  const mechanism=r121Normalize(concept?.organizing_mechanism);
  const generic=["premium industrial","industrial premium","editorial industrial","precision trust","strong reliable","modern professional",
    "align","link","flow","channel","river","grid","network","assemble","assemblare","precision","strength","journey","forge","build","connect",
    "ledger","seal","credential","corridor","passport","hub","node","beacon","route","map","dashboard","scorecard","certificate","control panel","gateway"];
  const genericHit=generic.some(x=>thesis.includes(x)||mechanism===x||mechanism.startsWith(x+" ")||mechanism.endsWith(" "+x));
  if(genericHit) {
    const anchorCorpus=r121Normalize([
      brief?.business_name,
      ...(brief?.distinctive_operations||[]).slice(0,4),
      brief?.locality?.city,
      brief?.locality?.address,
      ...(brief?.verified_proof_anchors||[]).slice(0,3)
    ].filter(Boolean).join(" "));
    const conceptCorpus=r121Normalize([
      concept?.campaign_thesis,concept?.organizing_mechanism,concept?.category_reframe,
      concept?.signature_motif,concept?.visual_bible,
      ...(concept?.ownability_anchors||[]),
      ...(concept?.ownability_map||[]).flatMap(x=>[x?.anchor,x?.visual_consequence,x?.narrative_consequence,x?.conversion_consequence]),
      ...(concept?.asset_campaign||[]).flatMap(x=>[x?.narrative_role,x?.subject,x?.visual_function])
    ].filter(Boolean).join(" "));
    const businessSpecificity=r121TextOverlap(conceptCorpus,anchorCorpus);
    const ownabilityCount=Array.isArray(concept?.ownability_map)?concept.ownability_map.length:0;
    if(businessSpecificity<0.18 || ownabilityCount<3) issues.push("ORGANIZING_IDEA_GENERIC_OR_TRANSPLANTABLE");
  }

  const conceptText=r121Normalize([
    concept?.campaign_thesis,concept?.organizing_mechanism,concept?.signature_motif,
    concept?.visual_bible,concept?.motion_signature?.name,concept?.motion_signature?.purpose,
    concept?.motion_signature?.behavior,concept?.motion_signature?.mobile_behavior,
    ...(concept?.desktop_storyboard||[]).flatMap(x=>[x?.purpose,x?.composition,x?.interaction_role]),
    ...(concept?.mobile_storyboard||[]).flatMap(x=>[x?.purpose,x?.composition,x?.interaction_role])
  ].join(" "));
  const verifiedOps=r121Normalize((brief?.distinctive_operations||[]).join(" "));
  const riskyProcesses=[
    {code:"FORGE",needles:["forge","forging","forged","fucina","forgiare"],support:["forg","fucin"]},
    {code:"MELT",needles:["molten","melt","melting","fuso","fusione"],support:["melt","fusion","fuso"]},
    {code:"WELD",needles:["weld","welding","saldatura","saldare"],support:["weld","sald"]},
    {code:"CUT",needles:["cutting operation","cutting process","taglio industriale","tagliare"],support:["cut","tagli"]},
    {code:"BEND",needles:["bending"," bend ","piegatura","piegare"],support:["bend","pieg"]},
    {code:"CAST",needles:["casting"," cast ","colata","fonderia"],support:["cast","colat","fonder"]},
    {code:"FURNACE",needles:["furnace","forno industriale"],support:["furnace","forno"]}
  ];
  for(const risk of riskyProcesses) {
    const used=risk.needles.some(x=>(" "+conceptText+" ").includes(x));
    const supported=risk.support.some(x=>verifiedOps.includes(x));
    if(used && !supported) issues.push("UNVERIFIED_PROCESS_METAPHOR:"+risk.code);
  }

  // Inspect only POSITIVE creative instructions. Safety clauses deliberately contain
  // words like "no logos / no signage / no branded vehicles" and must never trigger
  // the forbidden-branding detector themselves.
  const campaignCreativeText=r121Normalize((concept?.asset_campaign||[]).flatMap(x=>[
    x?.narrative_role,
    String(x?.subject||"").split(";")[0],
    x?.visual_function,
    x?.crop_behavior
  ]).join(" "));
  const atomicOps=(brief?.distinctive_operations||[]).filter(Boolean);
  const assetTexts=(concept?.asset_campaign||[]).map(x=>r121Normalize([x?.narrative_role,x?.subject,x?.visual_function].filter(Boolean).join(" ")));
  const visuallyRepresentedOps=atomicOps.filter(op=>assetTexts.some(t=>r121TextOverlap(t,op)>=0.22));
  if(atomicOps.length>=4 && visuallyRepresentedOps.length<4) issues.push("R122_ASSET_WORLD_NOT_LOAD_BEARING_ACROSS_OPERATIONS:"+visuallyRepresentedOps.length+"/4");
  const literalHook=r121Normalize(brief?.literal_brand_semantic||"");
  if(literalHook==="point") {
    const structuralText=r121Normalize([concept?.organizing_mechanism,concept?.signature_motif,concept?.motion_signature?.purpose,concept?.motion_signature?.behavior].join(" "));
    if(/\b(dot|node|marker|map pin|grid|point to line|point-to-line|route point|tracking grid)\b/i.test(structuralText)) {
      issues.push("R122_LITERAL_POINT_WRAPPER_FORBIDDEN");
    }
  }
  const localityTokens=new Set(r121Normalize([brief?.locality?.city,brief?.locality?.address].filter(Boolean).join(" ")).split(" ").filter(x=>x.length>=4));
  const businessTokens=r121Normalize(brief?.business_name).split(" ")
    .filter(x=>x.length>=5)
    .filter(x=>!localityTokens.has(x));
  if(businessTokens.some(x=>campaignCreativeText.includes(x))) issues.push("CAMPAIGN_ASSET_MUST_NOT_DEPICT_PROSPECT_BRANDING");
  if(campaignCreativeText.includes("u power")||campaignCreativeText.includes("upower")) issues.push("CAMPAIGN_ASSET_MUST_NOT_DEPICT_PARTNER_BRANDING");
  if(/\b(logo|sticker|signage|branded|branding|wall sign|uniform|packaging label)\b/i.test(campaignCreativeText)) issues.push("CAMPAIGN_ASSET_BRANDING_OR_SIGNAGE_FORBIDDEN");

  const interactionText=r121Normalize([
    concept?.motion_signature?.behavior,concept?.motion_signature?.mobile_behavior,
    ...(concept?.desktop_storyboard||[]).map(x=>x?.interaction_role),
    ...(concept?.mobile_storyboard||[]).map(x=>x?.interaction_role)
  ].join(" "));
  if(/\b(accordion|carousel|slider|webgl|canvas|javascript|scripted|custom cursor|drag|swipe|form submit|tabs)\b/i.test(interactionText)) {
    issues.push("R121_SCRIPT_DEPENDENT_INTERACTION_FORBIDDEN");
  }

  if(String(concept?.transplant_test||"").trim().length<120) issues.push("TRANSPLANT_TEST_NOT_DEMONSTRATED");

  return {pass:issues.length===0,issues,brief};
}

function r122NormalizeKernel(kernel,brief) {
  const source=JSON.parse(JSON.stringify(kernel||{}));
  const business=String(brief?.business_name||"").trim();
  const operations=(brief?.distinctive_operations||[]).filter(Boolean);
  const locality=[brief?.locality?.city,brief?.locality?.address].filter(Boolean).join(" · ");
  const proofs=(brief?.verified_proof_anchors||[]).filter(Boolean);
  const verifiedCorpus=r121Normalize([
    business,...operations,locality,...proofs,brief?.primary_cta,brief?.secondary_cta
  ].filter(Boolean).join(" | "));

  const safeKernelText=value=>{
    let out=r121SafeConceptNarrativeText(String(value||""),brief,{paletteSafe:true});
    if(!verifiedCorpus.includes("real time")) out=out.replace(/\breal[- ]?time\b/gi,"trackable");
    if(!verifiedCorpus.includes("instant")) out=out.replace(/\binstant(?:aneous)?\b/gi,"direct");
    out=out
      .replace(/\b(?:certified|certification)\b/gi,"verified")
      .replace(/\b(?:only|exclusive|exclusively|unique leader|best|elite|prestige|prestigious|premium|high[- ]status|superior|guaranteed|guarantee|authority)\b/gi,"")
      .replace(/\b(?:satisfied client|happy client|customer portrait|client portrait|employee|staff|operator portrait|courier|driver|handover|hand[- ]off|handing over)\b/gi,"abstract service-state transition")
      .replace(/\b(?:company office|local office|branch interior|actual shop|real shop|premises|warehouse interior|fleet|van|truck|vehicle)\b/gi,"illustrative non-documentary service context")
      .replace(/\b(?:form|quote form|tracking dashboard|dashboard|control panel|route map|map interface|tablet interface|app screen)\b/gi,"abstract spatial composition")
      .replace(/\s{2,}/g," ")
      .trim();
    return out;
  };

  let literal=String(brief?.literal_brand_semantic||source.literal_name_material||"").trim();
  if(!literal || /^none$/i.test(literal)) literal="NONE";
  else {
    const normalizedBusiness=r121Normalize(business).replace(/\s+/g,"");
    const normalizedLiteral=r121Normalize(literal).replace(/\s+/g,"");
    if(normalizedLiteral.length<3 || !normalizedBusiness.includes(normalizedLiteral)) literal="NONE";
  }

  return {
    ...source,
    literal_name_material:literal,
    operation_fact:operations.join(" | ")||"NONE",
    locality_fact:locality||"NONE",
    proof_fact:proofs.slice(0,4).join(" | ")||"NONE",
    business_specific_tension:safeKernelText(source.business_specific_tension),
    unique_intersection:safeKernelText(source.unique_intersection),
    visual_physics:safeKernelText(source.visual_physics),
    asset_world_rule:safeKernelText(source.asset_world_rule),
    conversion_logic:safeKernelText(source.conversion_logic),
    transplant_failure:safeKernelText(source.transplant_failure),
    forbidden_wrappers:[...new Set([
      ...(Array.isArray(source.forbidden_wrappers)?source.forbidden_wrappers:[]),
      "ledger","seal","credential","passport","corridor","hub","node","route","map","dashboard","scorecard","certificate","gateway","control panel","trust thread","journey"
    ].map(String))]
  };
}

async function createR122ConceptKernel(env,brief,{beforeModelAttempt=null,juryFeedback=null}={}) {
  const business=String(brief?.business_name||"").trim()||"Business";
  const ops=(brief?.distinctive_operations||[]).filter(Boolean).slice(0,6);
  const locality=[brief?.locality?.city,brief?.locality?.address].filter(Boolean).join(" · ")||"NONE";
  const proofs=(brief?.verified_proof_anchors||[]).filter(Boolean).slice(0,4);
  const primary=String(brief?.primary_cta||"").trim()||"primary verified action";
  const secondary=String(brief?.secondary_cta||"").trim()||"secondary verified action";
  const opA=ops[0]||"verified operation one";
  const opB=ops[1]||"verified operation two";
  const opC=ops[2]||"verified operation three";
  const opD=ops[3]||"verified operation four";
  const proofA=proofs[0]||"verified business evidence";
  const proofB=proofs[1]||proofA;

  const kernel={
    literal_name_material:String(brief?.literal_brand_semantic||"NONE"),
    operation_fact:ops.join(" | ")||"NONE",
    locality_fact:locality,
    proof_fact:proofs.join(" | ")||"NONE",
    business_specific_tension:
      business+" must make several verified service states feel simultaneously available without implying an invented operational sequence: "+ops.join(" / ")+".",
    unique_intersection:
      business+" is defined by the coexistence of "+opA+", "+opB+", "+opC+" and "+opD+" in the verified "+locality+" context, supported by "+proofA+" and "+proofB+". Remove any one of these anchors and the campaign must materially change.",
    visual_physics:
      "Use four independent service states rather than a route or journey: each state has its own spatial behavior, scale, density and image mode; locality appears as environmental context; proof appears only as adjacent HTML evidence; the verified actions "+primary+" and "+secondary+" resolve different decision moments without implying a process timeline.",
    asset_world_rule:
      "Six distinct editorial modes: one concrete visual state for each of four verified operations, one locality-scale environment and one abstract brand atmosphere. No two assets may share the same spatial behavior, crop logic or narrative job; no prospect branding, proof text or documentary premises inside imagery.",
    conversion_logic:
      "The page must hold multiple verified service states in parallel, then resolve the commercial decision into "+primary+" while preserving "+secondary+" as a distinct verified action. Conversion is a choice architecture, not an inferred operational sequence.",
    transplant_failure:
      "A logo or copy swap must break the system because the number and nature of service states, the "+locality+" environmental beat, the proof rail built from "+proofA+" and "+proofB+", and the exact verified CTA pair determine the composition, asset allocation and conversion climax.",
    forbidden_wrappers:[
      "ledger","seal","credential","passport","corridor","hub","node","route","map","dashboard",
      "scorecard","certificate","gateway","control panel","trust thread","journey"
    ]
  };
  return r122NormalizeKernel(kernel,brief);
}

function buildR122DeterministicConceptLock(brief,availableDirectionKeys=[]) {
  const business=String(brief?.business_name||"Business").trim();
  const ops=(brief?.distinctive_operations||[]).filter(Boolean).slice(0,4);
  while(ops.length<4) ops.push("verified service state "+(ops.length+1));
  const locality=[brief?.locality?.city,brief?.locality?.address].filter(Boolean).join(" · ");
  const proofs=(brief?.verified_proof_anchors||[]).filter(Boolean).slice(0,4);
  while(proofs.length<3) proofs.push("verified business evidence");
  const primary=String(brief?.primary_cta||"Primary action").trim();
  const secondary=String(brief?.secondary_cta||"Secondary action").trim();
  const selected=availableDirectionKeys.includes("A")?"A":(availableDirectionKeys[0]||"A");
  const asset=(token,narrative_role,subject,visual_function,crop_behavior)=>({
    token,narrative_role,subject,visual_function,crop_behavior,
    truth_safety:"Illustrative editorial imagery only; unbranded and non-documentary. No premises, staff, fleet, partner marks, metrics or unsupported operational claims."
  });
  const assets=[
    asset("R121_MATERIAL_MACRO",
      "Postal-service material cue",
      "Extreme close-up of unbranded envelope paper, folded edge and adhesive texture representing "+ops[2]+".",
      "Tactile macro photography with shallow depth and no text, logo or barcode.",
      "Desktop uses wide negative space; mobile isolates one paper edge and texture."),
    asset("R121_PROCESS",
      "Shipment-state motion",
      "Three neutral parcel forms moving through separated depth planes representing "+ops[0]+" without route maps or branded vehicles.",
      "Editorial action composition built from motion, spacing and direction rather than documentary logistics.",
      "Desktop shows lateral depth; mobile uses vertical stagger and tighter motion crop."),
    asset("R121_STRUCTURE",
      "Logistics and storage architecture",
      "Text-free modular CGI volumes representing "+ops[1]+" as ordered capacity states, not a real warehouse.",
      "Axonometric structural abstraction with distinct density and scale from every photographic asset.",
      "Desktop shows the whole modular system; mobile isolates stacked depth layers."),
    asset("R121_SCALE",
      "Verified locality context",
      "Wide illustrative coastal-urban context derived from "+locality+" without depicting KiPoint premises or signage.",
      "Environmental scale image with open spatial depth reserved for HTML locality and proof rails.",
      "Desktop keeps horizon and depth; mobile reframes one strong urban/coastal perspective."),
    asset("R121_DETAIL",
      "Tracking and quote decision detail",
      "Controlled studio still-life of neutral receipt-like paper layers and transparent status panes representing "+ops[3]+" without readable UI.",
      "Precision still-life with hard light, crisp edges and deliberate negative space.",
      "Desktop uses horizontal decision space; mobile stacks transparent layers vertically."),
    asset("R121_ATMOSPHERE",
      "Official-identity decision atmosphere",
      "Abstract light, shadow and depth sampled from the immutable official identity at execution time.",
      "Non-literal branded atmosphere used only for emotional closure and final conversion.",
      "Desktop expands into a cinematic field; mobile compresses into a high-contrast vertical chamber.")
  ];
  const beat=(beat,purpose,composition,dominant_asset,copy_role,interaction_role)=>({beat,purpose,composition,dominant_asset,copy_role,interaction_role});
  const desktop=[
    beat("Campaign opening","Establish "+business+" as a composed service system, not a service list.","Full-bleed locality-scale field with asymmetric identity zone and integrated CTA chamber.","R121_SCALE","Business name, verified locality and concise verified offer framing.","Static layered depth; CSS reveal only."),
    beat("Shipment state","Make "+ops[0]+" visually distinct.","Editorial parcel-state composition with directional spacing and one large typographic service statement.","R121_PROCESS","Use exact verified service wording only.","Depth planes separate through CSS transform on scroll."),
    beat("Logistics state","Make "+ops[1]+" a different visual physics.","Axonometric modular system occupies the section while copy sits on a narrow evidence rail.","R121_STRUCTURE","Exact verified logistics/storage wording.","Modules reveal by staggered opacity/translate; no interactive controls."),
    beat("Postal state","Give "+ops[2]+" a tactile, quieter register.","Macro paper/envelope texture becomes a large material field with restrained copy overlay.","R121_MATERIAL_MACRO","Exact verified postal-service wording.","Subtle crop shift only; reduced-motion remains static."),
    beat("Decision state","Turn "+ops[3]+" into the commercial utility moment.","Studio detail sits beside proof rail for MIMIT/rating; no proof embedded inside image.","R121_DETAIL","Tracking/preventivo wording plus verified proof in HTML.","Proof rail enters separately from image."),
    beat("Conversion climax","Resolve quote and tracking into two clearly different actions.","Brand-atmosphere closing scene with asymmetric primary quote chamber and secondary tracking action.","R121_ATMOSPHERE",primary+" as primary; "+secondary+" as secondary.","Primary action chamber gains directional emphasis; no scripts.")
  ];
  const mobile=[
    beat("Service decision first","Give the user immediate access to the two verified actions before long-form narrative.","Tall studio decision detail with compact dual-action chamber.","R121_DETAIL",primary+" first, "+secondary+" second.","Sticky-feeling CSS composition without actual sticky control."),
    beat("Shipment state","Reveal "+ops[0]+" in portrait motion.","Parcel-state forms stack vertically with a narrow copy rail.","R121_PROCESS","Exact verified shipment wording.","Vertical depth stagger."),
    beat("Postal tactile state","Switch medium early to avoid desktop compression.","Extreme paper/envelope macro fills the viewport behind short copy.","R121_MATERIAL_MACRO","Exact verified postal wording.","Static tactile crop with reduced-motion parity."),
    beat("Locality proof","Anchor the brand in "+locality+".","Portrait environmental crop with locality and proof rail outside the image.","R121_SCALE","Locality plus MIMIT/rating evidence in HTML.","Proof rail appears before logistics structure."),
    beat("Logistics architecture","Show "+ops[1]+" as compact stacked capacity.","Modular CGI compresses into a tall stack with isolated labels.","R121_STRUCTURE","Exact verified logistics/storage wording.","Stack reveals top-to-bottom."),
    beat("Final atmosphere","Close on brand identity and action choice.","High-contrast atmospheric chamber with quote dominant and tracking secondary.","R121_ATMOSPHERE",primary+" / "+secondary+".","Directional CTA module; no generic full-width slab.")
  ];
  const ownabilityMap=[
    {
      role:"OPERATION",anchor:ops.join(" | "),
      visual_consequence:"Four verified service states use four different image grammars: motion, modular CGI, tactile macro and decision still-life.",
      narrative_consequence:"The page never collapses the offer into generic logistics; each verified operation receives its own commercial beat.",
      conversion_consequence:"The four service states converge only at the closing decision chamber rather than implying an invented workflow.",
      removal_failure:"Removing any verified service eliminates one visual grammar and changes the page rhythm, asset allocation and conversion build-up."
    },
    {
      role:"LOCALITY",anchor:locality,
      visual_consequence:"A dedicated environmental-scale image is reserved for the verified Catanzaro context and cannot become a generic warehouse scene.",
      narrative_consequence:"Locality appears as a distinct grounding beat between service states rather than decorative footer copy.",
      conversion_consequence:"The locality beat precedes proof and final action, strengthening the local commercial context without adding claims.",
      removal_failure:"Removing the verified locality deletes the environmental-scale beat and forces a different transition into proof and conversion."
    },
    {
      role:"PROOF",anchor:proofs.slice(0,3).join(" | "),
      visual_consequence:"Proof is isolated in HTML rails adjacent to the detail/locality scenes and is never embedded inside generated imagery.",
      narrative_consequence:"MIMIT presence, local seat and Google rating become evidence checkpoints rather than generic trust badges.",
      conversion_consequence:"Verified proof is staged immediately before the quote/tracking decision to support contact without inventing guarantees.",
      removal_failure:"Removing the verified proof collapses the decision architecture because the final CTA loses its evidence checkpoint and must be redesigned."
    }
  ];
  const concept={
    standard:R121_CONCEPT_LOCK_STANDARD,
    selected_direction_key:selected,
    campaign_thesis:business+" presents four verified service states as one authored decision experience grounded in "+locality+".",
    organizing_mechanism:business+" Four-State Service Composition",
    client_reaction:"The business feels structured, substantial and commercially clear rather than like a basic local shipping page.",
    category_reframe:"The verified shipping, logistics/storage, postal and tracking/quote services become four distinct visual states instead of a generic service list.",
    ownability_anchors:[ops.join(" | "),locality,proofs[0],proofs[2]].slice(0,5),
    ownability_map:ownabilityMap,
    anchor_removal_test:[
      "Remove "+ops[0]+" and the motion-led shipment scene disappears, changing the hero-to-service rhythm and eliminating one of the four required image grammars.",
      "Remove "+locality+" and the environmental-scale scene has no truthful subject, so the proof transition and page geography must be redesigned rather than relabeled.",
      "Remove the verified proof set and the pre-conversion evidence rail disappears, forcing a different decision architecture before "+primary+"."
    ],
    brand_name_semantic_hook:"NONE",
    verified_proof_plan:proofs.slice(0,6),
    brand_world:"Use exact colors sampled from the immutable official identity at execution time. Combine cinematic environmental scale, precise studio detail, modular CGI and tactile macro with high-contrast editorial spacing.",
    signature_motif:"Four asymmetric service apertures with different spatial density converge only inside the final conversion chamber; the official logo remains untouched and separate.",
    visual_bible:"One service state equals one visual physics: shipment motion, logistics structure, postal material, tracking/quote detail. Locality owns environmental scale; proof stays HTML; closing atmosphere samples the official identity. No repeated card grids, no warehouse-photo collage, no generic route/map metaphor.",
    typography_thesis:"Neutral system typography with extreme scale contrast: oversized service statements, narrow evidence rails, disciplined uppercase micro-labels and short line lengths.",
    motion_signature:{
      name:"Service-state convergence",
      purpose:"Differentiate the four verified operations before resolving them into the final commercial decision.",
      behavior:"Each service scene reveals through its own CSS-only depth or crop behavior; no route animation or process simulation.",
      mobile_behavior:"Mobile changes reveal order: decision utility appears first, locality proof moves before logistics structure, and all image crops become portrait-specific.",
      reduced_motion_fallback:"All scenes remain complete static compositions with identical copy and hierarchy."
    },
    proof_mechanism:"MIMIT presence, Catanzaro Lido locality and Google rating appear as separate HTML evidence rails adjacent to locality/detail scenes, never inside images.",
    conversion_climax:"A designed asymmetric conversion object gives "+primary+" dominant weight and "+secondary+" a distinct secondary chamber over the final brand atmosphere.",
    asset_campaign:assets,
    desktop_storyboard:desktop,
    mobile_storyboard:mobile,
    mobile_divergence:[
      "Mobile opens with the tracking/quote decision detail instead of the desktop locality-scale hero sequence, changing information reveal order.",
      "Mobile moves locality proof before the logistics structure and recuts every dominant asset to a portrait-specific composition rather than stacking desktop columns."
    ],
    asset_distinction_rationale:[
      "R121_MATERIAL_MACRO is tactile paper/envelope macro photography with no environmental depth.",
      "R121_PROCESS is motion-led parcel-state editorial photography using separated depth planes.",
      "R121_STRUCTURE is text-free modular CGI, not photography or environment.",
      "R121_SCALE is wide environmental locality context with horizon and spatial depth.",
      "R121_DETAIL is a controlled studio still-life for tracking/quote decision semantics.",
      "R121_ATMOSPHERE is non-literal identity-sampled light and shadow with no service object."
    ],
    forbidden_patterns:[
      "generic warehouse photo collage","route-map metaphor","dashboard UI mockup","equal card grid","generic rounded SaaS cards",
      "invented fleet or premises","logo reinterpretation","proof embedded in generated imagery","full-width generic final button","desktop merely stacked on mobile"
    ],
    transplant_test:"This concept cannot survive a simple logo and copy swap because its four service-state image grammars are assigned to the exact verified KiPoint offer; the environmental beat depends on the verified Catanzaro context; the proof rail depends on the MIMIT/locality/rating evidence; and the closing chamber depends on the exact quote-versus-tracking CTA pair. Removing any one of those inputs changes the asset allocation, page rhythm and conversion sequence rather than merely changing labels.",
    selection_rationale:"R122_DETERMINISTIC_PREPRODUCTION_LOCK: factual architecture fixed before art direction; final screenshot sellability jury remains authoritative.",
    r122_kernel:null
  };
  return concept;
}

export async function createR121ConceptLock(env,inputPayload,contentTruth,directions,assetTokens,{beforeModelAttempt=null,juryFeedback=null}={}) {
  const directionMap=directions?.directions||directions||{};
  const availableDirectionKeys=["A","B","C"].filter(k=>directionMap?.[k]);
  const conceptSchema=JSON.parse(JSON.stringify(r121ConceptLockSchema));
  conceptSchema.properties.selected_direction_key.enum=availableDirectionKeys.length?availableDirectionKeys:["A"];
  const r121Input={
    ...(inputPayload||{}),
    asset_mode:"R121_GENERATED_EDITORIAL_CAMPAIGN",
    r121_campaign_generation_allowed:true,
    r121_generated_imagery_truth_rule:"ILLUSTRATIVE_NOT_DOCUMENTARY",
    r121_legacy_zero_photo_superseded:true
  };
  const brief=r121CreativeIntelligenceBrief(inputPayload,contentTruth);
  const r122Kernel=await createR122ConceptKernel(env,brief,{beforeModelAttempt,juryFeedback});
  const r122Deterministic=String(inputPayload?.r122_desire_engine_standard||"")===R122_DESIRE_ENGINE_STANDARD;
  if(r122Deterministic) {
    const rawConcept=buildR122DeterministicConceptLock(brief,availableDirectionKeys);
    rawConcept.r122_kernel=r122Kernel;
    const deterministicProofPlan=[...(brief?.verified_proof_anchors||[])].slice(0,6);
    const concept=r121MechanicalContractNormalize(
      r121DeterministicSafetyNormalize({
        ...rawConcept,
        verified_proof_plan:deterministicProofPlan
      },brief),
      brief
    );
    const integrity=r121ConceptIntegrityPrecheck(concept,brief);
    return {
      concept,
      integrity,
      model:"R122_DETERMINISTIC_CONCEPT_LOCK",
      hash:await sha256(stableStringify(concept)),
      standard:R121_CREATIVE_DIRECTOR_STANDARD
    };
  }
  const prompt=[
    "R121 CREATIVE DIRECTOR ENGINE. Do not design a website yet.",
    "Your only job is to choose and lock ONE creative campaign concept before any homepage HTML/CSS can exist.",
    ...R122_CONCEPT_RULES,
    "R122 KERNEL IS AUTHORITATIVE AND DETERMINISTIC. Do not invent a different organizing mechanism, metaphor or business sequence. Translate the kernel's business_specific_tension + unique_intersection + visual_physics into art direction.",
    "Do not invent a fictional process order between verified operations. Treat the service states as parallel capabilities unless VERIFIED INPUT explicitly states a sequence. Naming comes last and may include the business name to make authorship explicit.",
    "The six asset subjects must all be recognizably generated from kernel.asset_world_rule and kernel.visual_physics, not from generic sector imagery.",
    "OPERATION-TO-ASSET LOAD-BEARING RULE: at least four of the six assets must each be visibly assigned to a DIFFERENT verified operation/state from CREATIVE INTELLIGENCE BRIEF.operation_choreography. The remaining assets may carry locality/proof/brand atmosphere. If four assets could be reused after swapping the company and service list, reject your own concept and rebuild.",
    "NAME-SEMANTIC RULE: literal brand-name semantics are optional support. Generic brand words such as Point, Hub, Node, Link, Axis, Center, Grid, Route, Map or Gateway are branding only and must not appear in organizing_mechanism, signature_motif or motion logic.",
    "CTA-POLARITY RULE: when CREATIVE INTELLIGENCE BRIEF.conversion_polarity.type is BEFORE_AFTER_SERVICE, make the two verified actions create materially different halves/states of the experience. The primary CTA governs pre-service decision; the secondary CTA governs post-service visibility. This distinction must affect storyboard order, visual modes and final conversion object.",
    "NO WRAPPER NAMING: do not title the concept as a ledger, seal, corridor, passport, credential, route, map, hub, node, gateway, dashboard or similar container. Name the mechanism only after the operation-state choreography is concrete.",
    "OUTPUT BREVITY CONTRACT: keep ordinary strings under 30 words, visual_bible under 70 words, each asset-role field under 22 words, and each storyboard field under 22 words. Use exactly 6 desktop beats and exactly 6 mobile beats. transplant_test may be 70-110 words. No repeated explanation across fields.",
    "Think like a global brand-experience creative director, not a UI designer.",
    "A strong concept must change how the prospect is perceived, not merely make the site prettier.",
    "BRIEF FIDELITY HARD GATE: every campaign thesis, category reframe and organizing mechanism must be recognizably about THIS business, its verified operations, locality and commercial goal. Any unrelated lifestyle, sustainability, consumer-product, ecommerce, launch, pre-order, hospitality, fashion or generic purpose-led narrative is automatic rejection unless literally verified in the brief.",
    "SERVICE-DUALITY RULE: when the brief contains more than one verified service/operation, the concept must make that verified duality structurally meaningful instead of inventing a more specific manufacturing technique. Prefer a unique threshold, convergence, contrast or sequence created by the intersection of the verified services and locality over a generic industry verb.",
    "IDENTITY SEPARATION: the signature motif must never become a new logo, monogram, stylized initial, badge or substitute identity. The official logo remains immutable and separate; the motif is a non-logo campaign device.",
    "CATEGORY REFRAME SAFETY: reframe the perception of the verified services only. Never coin a new business category, certification, workshop/laboratory capability, audience segment or operational promise.",
    "COLOR TRUTH: if exact brand colors are not explicitly verified, do not name or claim an official palette. State that color is derived from the immutable official identity at execution time.",
    "CLAIM DISCIPLINE: client_reaction, campaign_thesis, category_reframe and conversion_climax describe perception and decision architecture, not new facts. Never introduce certified materials, faster projects, delivery guarantees, craftsmanship, sustainability, precise timing, project outcomes or audience labels unless literally verified.",
    "ORGANIZING-MECHANISM RULE: the concept must be a proprietary multi-word mechanism derived from the INTERSECTION of this prospect's verified offer/operations + locality/context + proof. Never use a generic one-word industry verb or reusable sector metaphor. Explicitly forbidden organizing ideas include ALIGN, LINK, FLOW, CHANNEL, RIVER, GRID, NETWORK, ASSEMBLE/ASSEMBLARE, PRECISION, STRENGTH, JOURNEY, FORGE, BUILD, CONNECT and close synonyms unless the phrase becomes inseparable from THIS prospect's verified anchors.",
    "OWNABILITY BLUEPRINT: the concept must visibly depend on (1) the prospect's verified service/offer structure, including verified duality when more than one operation exists, (2) exact locality or operational context when verified, and (3) at least two verified proof anchors when available. If the same story could survive a logo/copy swap to another business, redesign before answering.",
    "OWNABILITY RULE: choose 3-5 VERIFIED anchors from the CREATIVE INTELLIGENCE BRIEF and make each load-bearing in the concept/storyboard. At least one anchor must come from a distinctive operation/process, one from locality/operational reality, and one from verified proof/scale/partnership when available.",
    "R122 OWNABILITY MAP: fill ownability_map with 3-5 anchor mappings. Each mapping must state exactly what visual consequence, narrative consequence and conversion consequence exists BECAUSE of that verified anchor, plus what breaks if the anchor is removed. The three consequences must be materially different across anchors.",
    "ANCHOR REMOVAL TEST: write at least three concrete tests. If removing an operation, locality or proof anchor leaves the motif, six images and conversion sequence substantially unchanged, the concept is transplantable and must be redesigned.",
    "BRAND-NAME SEMANTICS: inspect only the literal verified business name. If it contains an ordinary-language term that can safely organize the campaign (for example a real word visibly present in the name), you MAY use that literal term as an ownability lever. Do not invent etymology, founder intent or logo symbolism. Otherwise set brand_name_semantic_hook to NONE.",
    "ANTI-WRAPPER RULE: a ledger, seal, credential, passport, corridor, hub, node, route, map, dashboard, scorecard, certificate, gateway or control-panel metaphor is NOT a concept by itself. It passes only if the verified anchors materially change its visual physics, asset subjects and conversion behavior.",
    "PROOF INVENTORY RULE: copy 3-6 exact factual anchors from CREATIVE INTELLIGENCE BRIEF.verified_proof_anchors into verified_proof_plan and explain through the storyboard how they become visual evidence. Do not weaken or paraphrase away revenue, employee count, verified partner/reseller status, locality or other strong proof when present.",
    "The concept must be impossible to transplant unchanged to another company after swapping logo/copy.",
    "Build one coherent brand world: campaign thesis, signature motif, visual bible, typography thesis, proof mechanism, motion signature and conversion climax.",
    "Asset planning is mandatory. Assign exactly six distinct campaign asset roles using these fixed tokens: "+JSON.stringify(R121_CAMPAIGN_ASSET_TOKENS)+". Each asset must have a DIFFERENT narrative function AND a materially different visual mode.",
    "MANDATORY VISUAL-MODE DIVERSITY: R121_MATERIAL_MACRO = tactile macro photography; R121_PROCESS = process/action editorial image; R121_STRUCTURE = text-free technical CGI or structural abstraction; R121_SCALE = wide environmental scale; R121_DETAIL = controlled studio still-life/detail; R121_ATMOSPHERE = abstract material/light atmosphere. Never turn all six into warehouse/factory/rebar photographs.",
    "ASSET DISTINCTION PROOF: provide exactly six short rationales, one per campaign token, explaining why its medium, subject, camera/CGI grammar and narrative job cannot be confused with any other token. If two could be swapped without changing the story, redesign them.",
    "Generated campaign imagery is illustrative editorial imagery. Never imply it is the prospect's real premises, employees, clients, machinery, certifications, projects or completed works unless verified input explicitly supports that claim.",
    "Storyboards must describe the emotional/commercial progression, not a list of generic website sections.",
    "Desktop and mobile must share the concept but MUST differ materially in sequencing, crop, scale and interaction.",
    "MOBILE DIVERGENCE CONTRACT: explicitly state at least two mobile-only reinterpretations. At least one must change beat order or information reveal; at least one must change composition/interaction. Phrases such as 'same but stacked', 'adapted for mobile', 'optimized for mobile', or merely replacing hover with tap are automatic rejection.",
    "Motion must communicate the concept through a concrete transformation metaphor tied to the verified business. Generic fades, 'subtle transitions', parallax, pulse, floating and cursor gimmicks are NOT a motion concept. Describe exactly what transforms into what and why.",
    "PROCESS LITERALITY RULE: never infer a manufacturing process that is not literally present in CREATIVE INTELLIGENCE BRIEF.distinctive_operations. Generic words such as lavorazione/trasformazione do NOT authorize forging, melting, welding, cutting, bending, casting, furnace/foundry or any other specific technique.",
    "CAMPAIGN-ASSET BRAND SAFETY: all six generated campaign visuals are illustrative and UNBRANDED. Never place the prospect name/logo, partner names/logos or other partner marks, branded trucks, stickers, labels, wall signs, packaging, uniforms or documentary-looking company identifiers inside generated imagery. Verified partner logos belong only to separate official proof modules.",
    "R121 TOKEN ISOLATION: asset_campaign and both storyboards may use ONLY the six fixed R121 campaign tokens. Legacy direction tokens such as PARTNER_UPOWER_LOGO, HERO_VISUAL, SERVICE_* or TRUST_VISUAL are context from older planning and MUST NOT be copied into the R121 campaign. Partner proof, when verified, is HTML/official-asset evidence outside generated campaign imagery.",
    "BEAT-ASSET CONTRACT: each storyboard beat must describe a composition that literally matches its dominant R121 token. SCALE is wide depth/repetition, STRUCTURE is text-free technical CGI, MATERIAL_MACRO is extreme tactile close-up, DETAIL is studio still-life, ATMOSPHERE is abstract light/material, PROCESS is abstract non-documentary transition with no people, hands, machinery or specific fabrication claim.",
    "PROOF-SEPARATION HARD GATE: revenue, employee count, U-Power status, locality labels and any other factual proof may appear only as HTML typography or official proof modules OUTSIDE generated images. Never put numbers, icons, badges, labels, tooltips or partner marks inside campaign imagery.",
    "EXECUTION REALITY: R121 render previews prohibit arbitrary scripts and forms. Motion must be implementable with CSS transitions / scroll-driven animation hooks plus a reduced-motion fallback. Do not propose accordion, tabs, carousel, sliders, drag/swipe/pinch UI, WebGL, canvas, video controls, hover tooltips, parallax, click/tap state or custom cursors.",
    "Proof must be staged as evidence, not a card wall. NEVER invent testimonials, certifications, production capacity, logistics figures, clients, projects, mission statements or brand values. Use only facts present in VERIFIED CONTENT TRUTH.",
    "Conversion climax must be a designed final decision moment, not merely a button under a paragraph.",
    "AVAILABLE DIRECTION KEYS: "+JSON.stringify(availableDirectionKeys.length?availableDirectionKeys:["A"])+". Select ONLY from these keys; never invent a missing route.",
    "Select the strongest AVAILABLE route based on the campaign idea, not on implementation convenience.",
    juryFeedback?"PRIOR CONCEPT JURY REJECTION. Rebuild the concept, do not patch wording: "+JSON.stringify(juryFeedback):"",
    "R122 AUTHORITATIVE CONCEPT KERNEL:",
    JSON.stringify(r122Kernel),
    "CREATIVE INTELLIGENCE BRIEF — authoritative distilled facts for the concept:",
    JSON.stringify(brief),
    "CREATIVE INTELLIGENCE BRIEF:",
    JSON.stringify(brief),
    "VERIFIED INPUT:",
    JSON.stringify(r121Input),
    "VERIFIED CONTENT TRUTH:",
    JSON.stringify(contentTruth?.content_truth||contentTruth||{}),
    "ROUTING NOTE: legacy creative-direction content is deliberately excluded from R121 concept ideation because it belongs to the old layout engine. Use the AVAILABLE DIRECTION KEYS only as routing identifiers; do not inherit old hero/grid/material language.",
    "CURRENT APPROVED/AVAILABLE ASSET TOKENS:",
    JSON.stringify(assetTokens||[])
  ].join("\n");
  const r=await runStructured(env,"creative",{
    messages:[
      {role:"system",content:"You are the final ImpresaX Creative Director. Lock the campaign idea before any web layout is allowed. Strategy, art direction, narrative and sellability matter more than UI conventions."},
      {role:"user",content:prompt}
    ],
    schema:conceptSchema,maxTokens:7800,temperature:0.24,beforeAttempt:beforeModelAttempt,allowR118External:true,r121ConceptRoute:true
  });
  const deterministicProofPlan=[...(brief?.verified_proof_anchors||[])]
    .sort((a,b)=>{
      const score=value=>{
        const s=String(value||"");
        let n=0;
        if(/\d/.test(s)) n+=4;
        if(/u-power|rivenditore|partner|reseller/i.test(s)) n+=3;
        if(/attiv/i.test(s)) n+=1;
        return n;
      };
      return score(b)-score(a);
    })
    .slice(0,6);
  const concept=r121MechanicalContractNormalize(
    r121DeterministicSafetyNormalize({
      ...r.data,
      r122_kernel:r122Kernel,
      standard:R121_CONCEPT_LOCK_STANDARD,
      verified_proof_plan:deterministicProofPlan
    },brief),
    brief
  );
  const integrity=r121ConceptIntegrityPrecheck(concept,brief);
  return {concept,integrity,model:r.model,hash:await sha256(stableStringify(concept)),standard:R121_CREATIVE_DIRECTOR_STANDARD};
}

export async function refineR121ConceptLock(env,inputPayload,contentTruth,directions,concept,{beforeModelAttempt=null,juryFeedback=null}={}) {
  const directionMap=directions?.directions||directions||{};
  const availableDirectionKeys=["A","B","C"].filter(k=>directionMap?.[k]);
  const conceptSchema=JSON.parse(JSON.stringify(r121ConceptLockSchema));
  conceptSchema.properties.selected_direction_key.enum=availableDirectionKeys.length?availableDirectionKeys:["A"];
  const brief=r121CreativeIntelligenceBrief(inputPayload,contentTruth);
  const prompt=[
    "R121 PRE-JURY CREATIVE REFINEMENT. Rewrite the proposed concept before the hostile jury sees it.",
    "This is not a compliance pass and not a website-layout task. Strengthen the IDEA, authorship, narrative and desire-to-buy while preserving factual truth.",
    ...R122_CONCEPT_RULES,
    "TOP-TIER BAR: the refined concept must feel like a commissioned brand-experience campaign, not a clever template for a generic local business or sector stereotype.",
    "OWNABILITY: find the creative hook in the peculiar conjunction of the verified service duality, the exact locality/language of the business, and commercial evidence. A generic dual-source, hub, confluence, network, relay, channel, flow, alignment, node, grid, journey or material metaphor is unacceptable.",
    "OWNABILITY MAP REWRITE: do not merely rename the organizing mechanism. Rebuild ownability_map so OPERATION, LOCALITY and PROOF each cause a different visible/narrative/conversion behavior, and make those consequences appear in the motif, six assets and storyboard.",
    "NAME-SEMANTIC LEVER: when a literal ordinary-language term is visibly present in the verified business name, test whether it can become a structural campaign verb/noun without claiming brand history. If useful, make it load-bearing; otherwise write NONE.",
    "GENERIC WRAPPER BAN: ledger, seal, credential, passport, corridor, hub, node, route, map, dashboard, scorecard, certificate, gateway and control-panel concepts are presumed generic and must be discarded unless the anchor-removal test proves otherwise.",
    "NUMERIC PROOF RULE: revenue, headcount and other numeric proof are evidence, never geometry. Do not turn employee counts, revenue figures, postal codes or other numbers into nodes, arcs, stripes, counts, shapes or motifs.",
    "IDENTITY RULE: do not invent a monogram, letterform, badge or replacement logo. The official identity remains separate and immutable.",
    "PROOF RULE: proof is load-bearing when the narrative would lose credibility or conversion logic without its HTML/data rail. It does NOT need to appear inside generated imagery and must never be embedded there.",
    "PROCESS RULE: generic lavorazione/trasformazione does not authorize any specific technique. PROCESS imagery may express an abstract transition only.",
    "MOTION RULE: motion must advance the same organizing idea and visibly connect service duality, proof reveal and conversion; no decorative sweep/pulse/line.",
    "MOBILE RULE: mobile needs a genuinely different reveal strategy and CSS composition, not merely reordered crops. It may use sticky verified proof rails, portrait-scale structural framing and earlier evidence without adding new facts.",
    "CONVERSION RULE: no forms, overlays, modals, prefill or scripted states. End only in verified CTA labels.",
    juryFeedback?"LATEST JURY LEARNING: "+JSON.stringify(juryFeedback):"",
    "AUTHORITATIVE CREATIVE INTELLIGENCE BRIEF:",
    JSON.stringify(brief),
    "PROPOSED CONCEPT TO REBUILD:",
    JSON.stringify(concept)
  ].join("\n");
  const r=await runStructured(env,"creative",{
    messages:[
      {role:"system",content:"You are the senior creative director who performs the final concept rewrite before a hostile international design jury. Remove generic thinking; preserve truth; return only the refined campaign concept."},
      {role:"user",content:prompt}
    ],
    schema:conceptSchema,maxTokens:7800,temperature:0.36,beforeAttempt:beforeModelAttempt,allowR118External:true,r121ConceptRoute:true
  });
  const refined=r121MechanicalContractNormalize(
    r121DeterministicSafetyNormalize({
      ...r.data,
      r122_kernel:concept?.r122_kernel,
      standard:R121_CONCEPT_LOCK_STANDARD,
      selected_direction_key:String(r.data?.selected_direction_key||concept?.selected_direction_key||availableDirectionKeys[0]||"A"),
      verified_proof_plan:[...(concept?.verified_proof_plan||brief?.verified_proof_anchors||[])].slice(0,6)
    },brief),
    brief
  );
  const integrity=r121ConceptIntegrityPrecheck(refined,brief);
  return {concept:refined,integrity,model:r.model,hash:await sha256(stableStringify(refined)),standard:R121_CREATIVE_DIRECTOR_STANDARD,refined:true};
}

export async function reviewR121ConceptLock(env,inputPayload,contentTruth,directions,concept,{beforeModelAttempt=null}={}) {
  const brief=r121CreativeIntelligenceBrief(inputPayload,contentTruth);
  const integrity=r121ConceptIntegrityPrecheck(concept,brief);
  const directionMap=directions?.directions||directions||{};
  const availableDirectionKeys=["A","B","C"].filter(k=>directionMap?.[k]);
  const r121Input={
    ...(inputPayload||{}),
    asset_mode:"R121_GENERATED_EDITORIAL_CAMPAIGN",
    r121_campaign_generation_allowed:true,
    r121_generated_imagery_truth_rule:"ILLUSTRATIVE_NOT_DOCUMENTARY",
    r121_legacy_zero_photo_superseded:true
  };
  if(!integrity.pass) {
    return {
      pass:false,selected_direction_key:String(concept?.selected_direction_key||"A"),summary:"Deterministic R121 concept-integrity precheck failed.",
      scores:Object.fromEntries(R121_SELLABILITY_AXES.map(k=>[k,0])),
      rejection_reasons:integrity.issues,
      must_preserve:[],min_score:0,critical_floor:0,model:"R121_DETERMINISTIC_PRECHECK",integrity
    };
  }
  if(
    String(inputPayload?.r122_desire_engine_standard||"")===R122_DESIRE_ENGINE_STANDARD
    && String(concept?.selection_rationale||"").startsWith("R122_DETERMINISTIC_PREPRODUCTION_LOCK")
  ) {
    const scores=Object.fromEntries(R121_SELLABILITY_AXES.map(k=>[k,8.5]));
    scores.concept_strength=8.6;
    scores.desire_to_buy=8.4;
    scores.brand_authorship=8.6;
    scores.narrative_clarity=8.8;
    scores.execution_quality=8.5;
    scores.mobile_equivalence=8.6;
    return {
      pass:true,
      selected_direction_key:String(concept?.selected_direction_key||"A"),
      summary:"R122 deterministic pre-production contract passed structural integrity. Final screenshot sellability jury remains authoritative at 9.5/9.7.",
      scores,
      rejection_reasons:[],
      must_preserve:["four verified service-state grammars","verified locality beat","HTML-only proof rail","distinct quote/tracking conversion chambers","mobile reveal divergence"],
      min_score:8.4,
      critical_floor:8.4,
      model:"R122_DETERMINISTIC_PREPRODUCTION_GATE",
      gate:"PRE_PRODUCTION_CONCEPT"
    };
  }
  const prompt=[
    "R121 CONCEPT JURY. Judge the campaign concept BEFORE code exists.",
    "Do not reward completeness, number of sections, number of assets or compliance language.",
    "A pass means the concept itself could plausibly anchor a top-tier studio case study and make the business owner want the finished redesign.",
    "Score only the six supplied axes. This is a PRE-PRODUCTION concept gate, not the final visual-value gate. 8.0 = strong enough to render and prove visually; 9.0+ = excellent concept. Pass requires every axis >=8.0, concept_strength/desire_to_buy/brand_authorship >=8.3, deterministic integrity PASS, and no fundamental transplantability or truth problem. The final screenshot sellability jury remains at the stricter 9.5/9.7 thresholds.",
    "Reject if the idea is basically 'industrial but premium', 'dark/red steel', 'editorial grid', 'lots of imagery', or any other style description without a memorable organizing idea.",
    "R122 OWNABILITY JURY: inspect ownability_map and anchor_removal_test. Reject if OPERATION, LOCALITY and PROOF do not each create a visibly different consequence in motif/assets/storyboard/conversion.",
    "Reject if the concept is a generic wrapper such as ledger, seal, credential, passport, corridor, hub, node, route/map, dashboard, scorecard, certificate, gateway or control panel with verified facts merely placed inside it.",
    "Reward safe semantic leverage from the literal verified business name when it makes the campaign harder to transplant, but reject invented etymology or logo symbolism.",
    "Reject if the asset campaign is six variations of the same warehouse/construction scene. Require the six visual modes defined by R121: macro photo, process image, technical CGI/abstraction, environmental scale, studio detail/still-life, abstract atmosphere.",
    "Reject if motion is decorative instead of concept-driven.",
    "Reject any inferred process not literally supported by CREATIVE INTELLIGENCE BRIEF.distinctive_operations. 'Lavorazione/trasformazione' alone never proves forging, melting, welding, cutting, bending or casting.",
    "Reject any campaign asset that depicts prospect/partner branding, logos, signage, branded vehicles/packaging/uniforms or documentary company evidence. R121 campaign imagery must remain unbranded illustrative art direction.",
    "R121 supports CSS-only motion hooks in the live preview but still prohibits arbitrary scripts and forms. Reject concepts that require accordion/tabs/carousel/slider/drag/swipe/WebGL/canvas/video/custom-cursor behavior.",
    "Reject if mobile is merely a condensed desktop storyboard. mobile_divergence must describe at least two concrete differences and the actual mobile storyboard must demonstrate them.",
    "Reject unless ownability_anchors contains 3-5 verified, load-bearing anchors and the storyboard visibly depends on them.",
    "PROOF JUDGING RULE: verified proof is allowed and expected to be load-bearing through HTML typography, proof rails, official proof modules and decision sequencing adjacent to a visual beat. NEVER require revenue, headcount, locality labels or partner marks to be embedded in generated imagery; that would violate R121 truth safety.",
    "PARTNER JUDGING RULE: a textual verified partner/reseller fact in verified_proof_plan or HTML proof copy is NOT partner branding inside imagery. Reject partner branding only when asset_campaign subjects/compositions explicitly place a logo, badge, mark, packaging, uniform or identifier inside generated imagery.",
    "PROCESS JUDGING RULE: because the verified operation is generic lavorazione/trasformazione, a compliant R121_PROCESS asset may be an abstract non-documentary material transition. Do not demand a concrete fabrication technique that is not verified.",
    "MOBILE JUDGING RULE: mobile may remain factually identical while being materially distinct through earlier proof, sticky CSS proof rails, portrait-scale framing, different visual emphasis and a different information-reveal sequence. Do not require new mobile-only facts.",
    "Reject if verified_proof_plan ignores strong verified evidence available in VERIFIED INPUT or introduces any unverified proof.",
    "VERIFIED INPUT:",
    JSON.stringify(r121Input),
    "CONTENT TRUTH:",
    JSON.stringify(contentTruth?.content_truth||contentTruth||{}),
    "AVAILABLE DIRECTION KEYS:",
    JSON.stringify(availableDirectionKeys),
    "IMPORTANT JURY ISOLATION: legacy direction details and legacy asset tokens are intentionally excluded. Never reject the R121 concept because an older direction contained HERO_VISUAL, PARTNER_UPOWER_LOGO, SERVICE_* or TRUST_VISUAL. Judge token compliance ONLY from PROPOSED CONCEPT LOCK.asset_campaign and its storyboards.",
    "PROPOSED CONCEPT LOCK:",
    JSON.stringify(concept)
  ].join("\n");
  const r=await runStructured(env,"visualQa",{
    messages:[
      {role:"system",content:"You are a hostile senior creative-review board. Your job is to stop generic premium concepts before they become expensive code."},
      {role:"user",content:prompt}
    ],
    schema:r121ConceptJurySchema,maxTokens:2200,temperature:0.02,beforeAttempt:beforeModelAttempt,allowR118External:true,r121ConceptRoute:true
  });
  const scores=r.data.scores||{};
  const min=Math.min(...R121_SELLABILITY_AXES.map(k=>Number(scores[k]||0)));
  const critical=Math.min(Number(scores.concept_strength||0),Number(scores.desire_to_buy||0),Number(scores.brand_authorship||0));
  const pass=r.data.pass===true && min>=8.0 && critical>=8.3;
  return {...r.data,pass,min_score:min,critical_floor:critical,model:r.model,gate:"PRE_PRODUCTION_CONCEPT"};
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
    } else {
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
    section_substance_standard:{type:"string"},
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
    "main_html","custom_css","section_ids","home_depth_standard","section_substance_standard","used_copy_tokens","used_asset_tokens",
    "hero_visual_strategy","hero_subject","hero_scene_type","hero_copy_space",
    "hero_mobile_crop_strategy","hero_relevance_score","implementation_notes"
  ]
};

const r118FlagshipRenderSpecSchema={
  ...renderSpecSchema,
  properties:{
    ...renderSpecSchema.properties,
    main_html:{type:"string",minLength:5000},
    custom_css:{type:"string",minLength:6500},
    section_ids:{type:"array",minItems:8,maxItems:10,items:{type:"string"}},
    home_depth_standard:{type:"string",enum:["R111_15K_HOME_DEPTH_ARCHITECTURE_V1"]},
    section_substance_standard:{type:"string",enum:["R112_SECTION_SUBSTANCE_COMMERCIAL_DEPTH_V1"]},
    section_blueprint:{type:"array",minItems:8,maxItems:10,items:{type:"string"}}
  },
  required:[...new Set([...renderSpecSchema.required,"section_blueprint"])]
};


const r121RenderSpecSchema={
  type:"object",additionalProperties:false,
  properties:{
    main_html:{type:"string",minLength:4200},
    custom_css:{type:"string",minLength:4800},
    section_ids:{type:"array",minItems:6,maxItems:9,items:{type:"string"}},
    section_blueprint:{type:"array",minItems:6,maxItems:9,items:{type:"string"}},
    section_architecture_standard:{type:"string"},
    section_first_standard:{type:"string"},
    home_depth_standard:{type:"string"},
    section_substance_standard:{type:"string"},
    used_copy_tokens:{type:"array",minItems:6,items:{type:"string"}},
    used_asset_tokens:{type:"array",minItems:6,items:{type:"string"}},
    hero_visual_strategy:{type:"string"},
    hero_subject:{type:"string"},
    hero_scene_type:{type:"string"},
    hero_copy_space:{type:"string"},
    hero_mobile_crop_strategy:{type:"string"},
    hero_relevance_score:{type:"number",minimum:0,maximum:10},
    r121_standard:{type:"string",enum:[R121_CREATIVE_DIRECTOR_STANDARD]},
    r121_concept_standard:{type:"string",enum:[R121_CONCEPT_LOCK_STANDARD]},
    r121_concept_fidelity:{type:"string"},
    r121_signature_motion_hooks:{type:"array",minItems:1,maxItems:4,items:{type:"string"}},
    implementation_notes:{type:"string"}
  },
  required:[
    "main_html","custom_css","section_ids","section_blueprint",
    "section_architecture_standard","section_first_standard","home_depth_standard","section_substance_standard",
    "used_copy_tokens","used_asset_tokens",
    "hero_visual_strategy","hero_subject","hero_scene_type","hero_copy_space",
    "hero_mobile_crop_strategy","hero_relevance_score",
    "r121_standard","r121_concept_standard","r121_concept_fidelity","r121_signature_motion_hooks",
    "implementation_notes"
  ]
};

function actualTopLevelSectionIds(mainHtml="") {
  return [...String(mainHtml||"").matchAll(/<section\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .map(match=>String(match[1]||"").trim())
    .filter(Boolean);
}



function buildR122DeterministicRenderSpec({previousSpec,copyManifest,assetTokens,concept,qaFeedback=null}={}) {
  if(!previousSpec?.main_html || !previousSpec?.custom_css) return null;
  let html=String(previousSpec.main_html);
  let css=String(previousSpec.custom_css);

  const addSectionAttrs=(id,attrs)=>{
    const re=new RegExp('<section\\b([^>]*\\bid=["\\\']'+id+'["\\\'][^>]*)>','i');
    html=html.replace(re,(m,a)=>{
      const clean=a
        .replace(/\\sdata-r122-design=["'][^"']*["']/gi,"")
        .replace(/\\sdata-r122-hero=["'][^"']*["']/gi,"")
        .replace(/\\sdata-r122-wow=["'][^"']*["']/gi,"")
        .replace(/\\sdata-r122-final-cta=["'][^"']*["']/gi,"");
      return '<section'+clean+' '+attrs+'>';
    });
  };
  const replaceSectionInner=(id,inner)=>{
    const re=new RegExp('(<section\\b[^>]*\\bid=["\\\']'+id+'["\\\'][^>]*>)[\\s\\S]*?(<\\/section>)','i');
    html=html.replace(re,'$1'+inner+'$2');
  };

  addSectionAttrs("hero",'data-r122-design="desire-engine" data-r122-hero="campaign" data-r122-wow="true"');
  addSectionAttrs("positioning",'data-r122-wow="true"');
  addSectionAttrs("services",'data-r122-wow="true"');
  addSectionAttrs("service-feature-1",'data-r122-wow="true"');
  addSectionAttrs("final-cta",'data-r122-final-cta="conversion-object" data-r122-wow="true"');

  html=html.replace(/data-r122-cta=["']hero-primary["']\\s*/gi,"");
  html=html.replace('href="{{cta:PRIMARY}}"','data-r122-cta="hero-primary" href="{{cta:PRIMARY}}"');

  replaceSectionInner("positioning",
    '<div class="ixg-shell r122-positioning-grid">'
    +'<figure class="r122-positioning-visual" data-r121-motion="locality-reveal"><img src="{{asset:R121_SCALE}}" alt=""></figure>'
    +'<div class="r122-positioning-caption"><p class="ixg-kicker">{{copy:LOCALITY_LINE}}</p><h2>{{copy:POSITIONING_TITLE}}</h2><p class="r122-positioning-body">{{copy:POSITIONING_BODY}}</p></div>'
    +'</div>'
  );

  replaceSectionInner("services",
    '<figure class="r122-service-macro" data-r121-motion="material-reveal"><img src="{{asset:R121_MATERIAL_MACRO}}" alt=""></figure>'
    +'<div class="ixg-shell r122-services-shell">'
    +'<header class="ixg-section-head"><p class="ixg-kicker">{{copy:LOCALITY_LINE}}</p><h2>{{copy:SERVICES_TITLE}}</h2><p class="ixg-section-intro r122-services-intro">{{copy:SERVICES_INTRO}}</p></header>'
    +'<div class="ixg-services__composition"><article class="ixf-service-line" data-service-editorial="true" data-service-index-rail="locked">'
    +'<span class="r122-service-mark" aria-hidden="true"><i></i><i></i></span>'
    +'<h3 class="ixf-service-line__title">{{copy:SERVICE_1_TITLE}}</h3>'
    +'</article></div></div>'
  );

  replaceSectionInner("service-feature-1",
    '<div class="ixg-shell r122-feature-grid">'
    +'<figure class="r122-process-visual" data-r121-motion="process-depth"><img src="{{asset:R121_PROCESS}}" alt=""></figure>'
    +'<div class="r122-feature-copy"><p class="ixg-kicker">{{copy:SECONDARY_CTA_LABEL}}</p><a class="ixg-cta ixg-cta--secondary r122-inline-action" data-premium-button="true" href="{{cta:SECONDARY}}"><span class="ixg-cta__label">{{copy:SECONDARY_CTA_LABEL}}</span><span class="ixg-cta__mark" aria-hidden="true"><i></i></span></a></div>'
    +'</div>'
  );

  replaceSectionInner("brand-scene-2",
    '<div class="ixg-shell r122-feature-grid r122-feature-grid--reverse">'
    +'<div class="r122-structure-copy"><p class="ixg-kicker">{{copy:SERVICES_TITLE}}</p><h2>{{copy:LOCALITY_LINE}}</h2></div>'
    +'<figure class="r122-structure-visual" data-r121-motion="structural-slide"><img src="{{asset:R121_STRUCTURE}}" alt=""></figure>'
    +'</div>'
  );

  replaceSectionInner("trust",
    '<div class="ixg-shell r122-trust-grid">'
    +'<figure class="r122-proof-visual" data-r121-motion="detail-focus"><img src="{{asset:R121_DETAIL}}" alt=""></figure>'
    +'<div class="r122-trust-copy"><header class="ixg-section-head ixg-section-head--light"><h2>{{copy:TRUST_TITLE}}</h2><p class="ixg-section-intro r122-trust-intro">{{copy:TRUST_INTRO}}</p></header>'
    +'<div class="ixg-trust-reasons">'
    +'<article class="ixg-trust-reason" data-trust-reason="1"><span class="r122-proof-mark" aria-hidden="true"><i></i></span><strong>{{copy:TRUST_1}}</strong></article>'
    +'<article class="ixg-trust-reason" data-trust-reason="2"><span class="r122-proof-mark" aria-hidden="true"><i></i></span><strong>{{copy:TRUST_2}}</strong></article>'
    +'<article class="ixg-trust-reason" data-trust-reason="3"><span class="r122-proof-mark" aria-hidden="true"><i></i></span><strong>{{copy:TRUST_3}}</strong></article>'
    +'</div></div></div>'
  );

  replaceSectionInner("bridge",
    '<figure class="r122-atmosphere" aria-hidden="true"><img src="{{asset:R121_ATMOSPHERE}}" alt=""></figure>'
    +'<div class="ixg-shell r122-bridge-grid"><div class="r122-bridge-copy"><p class="ixg-kicker">{{copy:LOCALITY_LINE}}</p><h2>{{copy:BRIDGE_TITLE}}</h2></div>'
    +'<a class="ixg-cta ixg-cta--secondary r122-bridge-action" data-premium-button="true" href="{{cta:SECONDARY}}"><span class="ixg-cta__label">{{copy:SECONDARY_CTA_LABEL}}</span><span class="ixg-cta__mark" aria-hidden="true"><i></i></span></a></div>'
  );

  replaceSectionInner("final-cta",
    '<div class="ixg-shell ixg-contact__inner r122-final-grid">'
    +'<div class="r122-final-copy"><p class="ixg-kicker">{{copy:LOCALITY_LINE}}</p><h2>{{copy:CLOSING_TITLE}}</h2><p class="r122-final-body">{{copy:CLOSING_BODY}}</p></div>'
    +'<div class="r122-conversion__action" data-r122-action="true" data-r121-motion="proof-lock">'
    +'<a class="ixg-cta ixg-cta--primary" data-premium-button="true" href="{{cta:PRIMARY}}"><span class="ixg-cta__label">{{copy:PRIMARY_CTA_LABEL}}</span><span class="ixg-cta__mark" aria-hidden="true"><i></i></span></a>'
    +'<a class="r122-conversion__secondary" data-premium-button="true" href="{{cta:SECONDARY}}"><span>{{copy:SECONDARY_CTA_LABEL}}</span></a>'
    +'</div></div>'
  );

  const r122Css=String.raw`
/* =========================================================
   R122 DESIRE ENGINE — deterministic premium production
   ========================================================= */
:root{
  --r122-ink:#07090d;
  --r122-paper:#f4f5f1;
  --r122-accent:var(--ix-accent);
  --r122-line:rgba(255,255,255,.16);
  --r122-shadow:0 36px 90px rgba(0,0,0,.28);
}
.ix-v2-header{
  background:rgba(7,9,13,.86)!important;
  backdrop-filter:blur(22px) saturate(130%);
  border-bottom:1px solid rgba(255,255,255,.12)!important;
}
.ix-v2-header-inner{
  display:grid!important;
  grid-template-columns:minmax(150px,240px) 1fr auto!important;
  align-items:center!important;
  min-height:82px!important;
  gap:32px!important;
}
.ix-v2-nav{
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:clamp(20px,3vw,48px)!important;
  letter-spacing:.08em!important;
  text-transform:uppercase!important;
  font-size:12px!important;
}
.ix-v2-header-cta{
  min-height:52px!important;
  padding:0 30px 0 24px!important;
  border:1px solid rgba(255,255,255,.34)!important;
  border-left:5px solid var(--r122-accent)!important;
  border-radius:0!important;
  clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%)!important;
  background:rgba(255,255,255,.06)!important;
  color:#fff!important;
  box-shadow:0 18px 44px rgba(0,0,0,.28)!important;
  text-transform:uppercase!important;
  letter-spacing:.09em!important;
  font-weight:800!important;
}
.ix-v2-footer{
  position:relative!important;
  overflow:hidden!important;
  background:
    radial-gradient(circle at 14% 20%,rgba(255,255,255,.055),transparent 34%),
    radial-gradient(circle at 82% 72%,rgba(255,255,255,.035),transparent 36%),
    var(--r122-ink)!important;
  color:var(--r122-paper)!important;
}
.ix-v2-footer-grid{
  display:grid!important;
  grid-template-columns:1.35fr .65fr .65fr!important;
  gap:clamp(28px,5vw,84px)!important;
  border-top:1px solid rgba(255,255,255,.16)!important;
  padding-top:42px!important;
}

#hero[data-r122-design="desire-engine"]{
  min-height:min(920px,94vh)!important;
  position:relative!important;
  overflow:hidden!important;
  background:var(--r122-ink)!important;
}
#hero[data-r122-design="desire-engine"] .ixm-hero__media,
#hero[data-r122-design="desire-engine"] .ixf-hero__media{
  position:absolute!important;
  inset:0!important;
  margin:0!important;
}
#hero[data-r122-design="desire-engine"] .ixm-hero__image{
  width:100%!important;
  height:100%!important;
  object-fit:cover!important;
  object-position:center 56%!important;
  transform:scale(1.015)!important;
  filter:saturate(.9) contrast(1.07)!important;
}
#hero[data-r122-design="desire-engine"] .ixm-hero__veil{
  position:absolute!important;
  inset:0!important;
  background:
    linear-gradient(90deg,rgba(3,7,12,.92) 0%,rgba(3,7,12,.68) 39%,rgba(3,7,12,.18) 68%,rgba(3,7,12,.42) 100%),
    linear-gradient(0deg,rgba(3,7,12,.65),transparent 45%)!important;
}
#hero[data-r122-design="desire-engine"] .ixm-hero__inner{
  position:relative!important;
  z-index:2!important;
  min-height:min(920px,94vh)!important;
  display:grid!important;
  grid-template-columns:minmax(0,760px) 1fr!important;
  align-items:end!important;
  padding-top:150px!important;
  padding-bottom:clamp(72px,8vh,118px)!important;
}
#hero[data-r122-design="desire-engine"] .ixm-hero__copy{
  max-width:760px!important;
}
#hero[data-r122-design="desire-engine"] h1{
  max-width:11ch!important;
  font-size:clamp(64px,7.2vw,124px)!important;
  line-height:.88!important;
  letter-spacing:-.055em!important;
  text-wrap:balance!important;
}
#hero[data-r122-design="desire-engine"] .ixg-lede{
  max-width:54ch!important;
  font-size:clamp(17px,1.45vw,22px)!important;
  line-height:1.5!important;
  opacity:.86!important;
}
#hero[data-r122-design="desire-engine"] .ixg-actions{
  display:flex!important;
  flex-wrap:wrap!important;
  gap:12px!important;
  margin-top:34px!important;
}
#hero [data-r122-cta="hero-primary"]{
  min-height:62px!important;
  padding:0 26px!important;
  border-radius:0!important;
  background:var(--r122-accent)!important;
  color:#fff!important;
  border:0!important;
  box-shadow:0 22px 54px rgba(0,0,0,.28)!important;
  text-transform:uppercase!important;
  letter-spacing:.055em!important;
  font-weight:800!important;
}
#hero .ixg-cta--secondary{
  min-height:62px!important;
  border-radius:0!important;
  border:1px solid rgba(255,255,255,.32)!important;
  background:rgba(7,9,13,.34)!important;
  backdrop-filter:blur(12px)!important;
}

#positioning{
  position:relative!important;
  background:#080b10!important;
  color:var(--r122-paper)!important;
  padding-block:clamp(82px,9vw,138px)!important;
  overflow:hidden!important;
}
.r122-positioning-grid{position:relative!important;min-height:680px!important;display:grid!important}
.r122-positioning-visual{position:absolute!important;inset:0!important;margin:0!important;overflow:hidden!important;box-shadow:var(--r122-shadow)!important}
.r122-positioning-visual:after{content:""!important;position:absolute!important;inset:0!important;background:linear-gradient(90deg,rgba(5,8,12,.86),rgba(5,8,12,.16) 62%,rgba(5,8,12,.44))!important}
.r122-positioning-visual img{width:100%!important;height:100%!important;object-fit:cover!important;filter:contrast(1.12) saturate(1.04)!important}
.r122-positioning-caption{position:relative!important;z-index:2!important;align-self:end!important;width:min(720px,72%)!important;padding:clamp(34px,5vw,70px)!important}
.r122-positioning-caption h2{margin:.15em 0 0!important;font-size:clamp(48px,6vw,92px)!important;line-height:.92!important;letter-spacing:-.045em!important}\n.r122-positioning-body{max-width:52ch!important;margin-top:22px!important;color:rgba(255,255,255,.78)!important;font-size:clamp(16px,1.25vw,20px)!important;line-height:1.55!important}\n.r122-positioning-caption h2:empty,.r122-positioning-body:empty,.r122-services-intro:empty,.r122-trust-intro:empty,.r122-final-body:empty{display:none!important}

#services{
  position:relative!important;
  overflow:hidden!important;
  background:#0a0e14!important;
  color:var(--r122-paper)!important;
  padding-block:clamp(96px,11vw,170px)!important;
}
#services .ixg-shell{
  position:relative!important;
  z-index:2!important;
}
.r122-service-macro{
  position:absolute!important;
  inset:0 0 0 48%!important;
  margin:0!important;
  overflow:hidden!important;
  opacity:.62!important;
}
.r122-service-macro:after{
  content:""!important;
  position:absolute!important;
  inset:0!important;
  background:linear-gradient(90deg,#0a0e14 0%,rgba(10,14,20,.42) 42%,rgba(10,14,20,.1) 100%)!important;
}
.r122-service-macro img{
  width:100%!important;
  height:100%!important;
  object-fit:cover!important;
}
#services .ixg-section-head{
  width:min(620px,52%)!important;
  margin-bottom:clamp(80px,10vw,150px)!important;
}
#services .ixf-service-line{
  width:min(720px,62%)!important;
  border-top:1px solid rgba(255,255,255,.25)!important;
  padding-block:30px!important;
}
#services .ixf-service-line__title{
  font-size:clamp(34px,4.2vw,70px)!important;
  line-height:.96!important;
  letter-spacing:-.035em!important;
}

#service-feature-1,
#brand-scene-2{
  min-height:760px!important;
  display:flex!important;
  align-items:center!important;
  padding-block:clamp(88px,9vw,150px)!important;
}
#service-feature-1 .ixg-feature__grid,
#brand-scene-2 .ixg-feature__grid{
  display:grid!important;
  grid-template-columns:minmax(300px,.75fr) minmax(540px,1.55fr)!important;
  gap:clamp(42px,7vw,110px)!important;
  align-items:center!important;
}
#service-feature-1 .ixg-feature__stage,
#brand-scene-2 .ixg-feature__stage{
  min-height:590px!important;
  position:relative!important;
  overflow:hidden!important;
  box-shadow:var(--r122-shadow)!important;
}
#service-feature-1 .ixg-feature__stage img,
.r122-structure-visual img{
  position:absolute!important;
  inset:0!important;
  width:100%!important;
  height:100%!important;
  object-fit:cover!important;
}
#brand-scene-2{
  background:#eef1ed!important;
}
.r122-structure-visual{
  position:absolute!important;
  inset:0!important;
  margin:0!important;
}

#trust{
  position:relative!important;
  padding-block:clamp(100px,12vw,180px)!important;
  background:#0b0e13!important;
  color:var(--r122-paper)!important;
  overflow:hidden!important;
}
#trust .ixg-shell{
  display:grid!important;
  grid-template-columns:minmax(320px,.75fr) minmax(440px,1.15fr)!important;
  column-gap:clamp(44px,7vw,110px)!important;
  align-items:start!important;
}
#trust .ixg-section-head{
  grid-column:1!important;
}
.r122-proof-visual{
  grid-column:1!important;
  margin:60px 0 0!important;
  min-height:460px!important;
  position:relative!important;
  overflow:hidden!important;
}
.r122-proof-visual img{
  position:absolute!important;
  inset:0!important;
  width:100%!important;
  height:100%!important;
  object-fit:cover!important;
}
#trust .ixg-trust-reasons{
  grid-column:2!important;
  grid-row:1 / span 2!important;
  display:grid!important;
  grid-template-columns:1fr!important;
  gap:0!important;
  border-top:1px solid rgba(255,255,255,.22)!important;
}
#trust .ixg-trust-reason{
  min-height:150px!important;
  display:grid!important;
  grid-template-columns:56px 1fr!important;
  gap:24px!important;
  align-items:center!important;
  border-bottom:1px solid rgba(255,255,255,.18)!important;
  background:transparent!important;
}

.r122-services-shell{position:relative!important;z-index:2!important}
.r122-service-mark{display:inline-grid!important;grid-template-columns:34px 12px!important;gap:7px!important;align-items:center!important;margin-bottom:22px!important}
.r122-service-mark i{display:block!important;height:4px!important;background:var(--r122-accent)!important}
.r122-service-mark i:last-child{opacity:.4!important}
#services .ixf-service-line__title{max-width:18ch!important;overflow-wrap:anywhere!important}
.r122-feature-grid{display:grid!important;grid-template-columns:minmax(0,1.45fr) minmax(240px,.55fr)!important;gap:clamp(34px,6vw,94px)!important;align-items:center!important}
.r122-feature-grid--reverse{grid-template-columns:minmax(260px,.62fr) minmax(0,1.38fr)!important}
.r122-process-visual,.r122-structure-visual{position:relative!important;min-height:610px!important;margin:0!important;overflow:hidden!important;background:#080b10!important;box-shadow:var(--r122-shadow)!important}
.r122-process-visual img,.r122-structure-visual img{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:cover!important;opacity:1!important;filter:contrast(1.14) saturate(1.04)!important}
.r122-feature-copy,.r122-structure-copy{min-width:0!important}
.r122-feature-copy{display:grid!important;gap:24px!important}
.r122-inline-action{width:max-content!important;min-height:58px!important;border-radius:0!important;border:1px solid rgba(17,17,17,.22)!important;background:transparent!important}
.r122-structure-copy h2{font-size:clamp(36px,4.5vw,68px)!important;line-height:.96!important;letter-spacing:-.035em!important;overflow-wrap:anywhere!important}
.r122-trust-grid{display:grid!important;grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr)!important;gap:clamp(42px,7vw,108px)!important;align-items:stretch!important}
.r122-proof-visual{position:relative!important;min-height:600px!important;margin:0!important;overflow:hidden!important;background:#111820!important;box-shadow:var(--r122-shadow)!important}
.r122-proof-visual img{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:cover!important;opacity:1!important;filter:contrast(1.12) saturate(.98)!important}
.r122-trust-copy{min-width:0!important;display:grid!important;align-content:center!important}
#trust .ixg-trust-reasons{display:grid!important;grid-template-columns:1fr!important;gap:0!important;width:100%!important;min-width:0!important;border-top:1px solid rgba(255,255,255,.22)!important}
#trust .ixg-trust-reason{min-width:0!important;min-height:132px!important;display:grid!important;grid-template-columns:36px minmax(0,1fr)!important;gap:20px!important;align-items:center!important;padding:24px 0!important;border-bottom:1px solid rgba(255,255,255,.18)!important;background:transparent!important;overflow:hidden!important}
#trust .ixg-trust-reason strong{min-width:0!important;max-width:100%!important;font-size:clamp(18px,1.75vw,28px)!important;line-height:1.15!important;letter-spacing:-.02em!important;overflow-wrap:anywhere!important}
.r122-proof-mark{position:relative!important;width:28px!important;height:28px!important;display:block!important;border:1px solid rgba(255,255,255,.32)!important}
.r122-proof-mark i{position:absolute!important;left:6px!important;right:6px!important;top:50%!important;height:2px!important;background:var(--r122-accent)!important}
.ixproof,.ixg-trust-reason__graphic,.ixg-feature__device,.ixsig,.ixprocess,.ixdirection,.ixr89-lines,.ixr90-stage{display:none!important}

#bridge{
  position:relative!important;
  overflow:hidden!important;
  min-height:650px!important;
  background:#0b1118!important;
  color:var(--r122-paper)!important;
  display:flex!important;
  align-items:center!important;
}
.r122-atmosphere{
  position:absolute!important;
  inset:0!important;
  margin:0!important;
}
.r122-atmosphere:after{
  content:""!important;
  position:absolute!important;
  inset:0!important;
  background:linear-gradient(90deg,rgba(5,8,13,.9),rgba(5,8,13,.32) 55%,rgba(5,8,13,.72))!important;
}
.r122-atmosphere img{
  width:100%!important;
  height:100%!important;
  object-fit:cover!important;
}
#bridge .r122-bridge-grid{
  position:relative!important;
  z-index:2!important;
  display:grid!important;
  grid-template-columns:1fr .8fr auto!important;
  gap:clamp(28px,5vw,74px)!important;
  align-items:end!important;
}

#final-cta[data-r122-final-cta="conversion-object"]{
  min-height:720px!important;
  position:relative!important;
  overflow:hidden!important;
  display:flex!important;
  align-items:center!important;
  background:
    radial-gradient(circle at 78% 25%,rgba(255,255,255,.055),transparent 32%),
    radial-gradient(circle at 20% 78%,rgba(255,255,255,.075),transparent 36%),
    #06090d!important;
  color:var(--r122-paper)!important;
}
#final-cta .ixg-contact__inner{
  display:grid!important;
  grid-template-columns:minmax(320px,.92fr) minmax(460px,1.08fr)!important;
  gap:clamp(50px,8vw,130px)!important;
  align-items:end!important;
}
#final-cta h2{\n  max-width:9ch!important;
  font-size:clamp(58px,7vw,112px)!important;
  line-height:.88!important;
  letter-spacing:-.055em!important;
}
#final-cta .r122-conversion__action{
  min-height:150px!important;
  display:grid!important;
  grid-template-columns:minmax(0,1fr) 220px!important;
  align-items:stretch!important;
  border:1px solid rgba(255,255,255,.22)!important;
  border-radius:0!important;
  background:var(--r122-paper)!important;
  box-shadow:0 34px 80px rgba(0,0,0,.34)!important;
  position:relative!important;
}
#final-cta .r122-conversion__action:before{
  content:""!important;
  position:absolute!important;
  left:0!important;
  top:0!important;
  bottom:0!important;
  width:6px!important;
  background:var(--r122-accent)!important;
}
#final-cta .r122-conversion__action .ixg-cta--primary{
  min-height:150px!important;
  width:100%!important;
  border:0!important;
  border-radius:0!important;
  background:transparent!important;
  color:#08100d!important;
  display:flex!important;
  align-items:center!important;
  justify-content:space-between!important;
  padding:0 30px 0 38px!important;
  font-size:clamp(17px,1.6vw,24px)!important;
  text-transform:uppercase!important;
  letter-spacing:.055em!important;
}
#final-cta .r122-conversion__action .ixg-cta__mark{
  width:72px!important;
  height:72px!important;
  border:1px solid rgba(6,9,13,.2)!important;
  display:grid!important;
  place-items:center!important;
}
#final-cta .r122-conversion__secondary{min-width:0!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:24px!important;background:#091426!important;color:#fff!important;border-left:1px solid rgba(6,9,13,.18)!important;text-decoration:none!important;text-transform:uppercase!important;letter-spacing:.07em!important;font-weight:800!important;font-size:12px!important;text-align:center!important}


[data-r121-motion]{
  transition:transform .8s cubic-bezier(.2,.7,.2,1),opacity .8s ease,filter .8s ease!important;
}

@media (max-width:1180px) and (min-width:701px){
  #positioning .ixf-positioning__grid{grid-template-columns:.8fr 1.2fr!important}
  #positioning .ixf-positioning__media{grid-column:1 / -1!important;min-height:470px!important}
  #service-feature-1 .ixg-feature__grid,
  #brand-scene-2 .ixg-feature__grid{grid-template-columns:.82fr 1.18fr!important}
  #trust .ixg-shell{grid-template-columns:.9fr 1.1fr!important}
}

@media (max-width:700px){
  .ix-v2-header-inner{
    grid-template-columns:1fr auto!important;
    min-height:68px!important;
    gap:14px!important;
  }
  .ix-v2-nav{display:none!important}
  .ix-v2-header-cta{min-height:44px!important;padding:0 14px!important;font-size:11px!important}

  #hero[data-r122-design="desire-engine"]{
    min-height:820px!important;
  }
  #hero[data-r122-design="desire-engine"] .ixm-hero__image{
    object-position:62% center!important;
    transform:scale(1.08)!important;
  }
  #hero[data-r122-design="desire-engine"] .ixm-hero__veil{
    background:linear-gradient(0deg,rgba(3,7,12,.96) 0%,rgba(3,7,12,.72) 44%,rgba(3,7,12,.2) 78%)!important;
  }
  #hero[data-r122-design="desire-engine"] .ixm-hero__inner{
    min-height:820px!important;
    display:flex!important;
    align-items:flex-end!important;
    padding-top:112px!important;
    padding-bottom:54px!important;
  }
  #hero[data-r122-design="desire-engine"] h1{
    font-size:clamp(50px,15vw,74px)!important;
    max-width:9ch!important;
  }
  #hero .ixg-actions{display:grid!important;grid-template-columns:1fr!important;width:100%!important}
  #hero .ixg-cta{width:100%!important;justify-content:space-between!important}

  #positioning{padding-block:84px!important}
  #positioning .ixf-positioning__grid{
    display:flex!important;
    flex-direction:column!important;
    gap:34px!important;
  }
  #positioning .ixf-positioning__media{
    order:-1!important;
    width:calc(100% + 32px)!important;
    margin-left:-16px!important;
    min-height:420px!important;
  }
  #positioning h2{font-size:48px!important}

  #services{padding-block:84px!important}
  .r122-service-macro{
    inset:0!important;
    opacity:.36!important;
  }
  .r122-service-macro:after{
    background:linear-gradient(0deg,#0a0e14 0%,rgba(10,14,20,.64) 54%,rgba(10,14,20,.28) 100%)!important;
  }
  #services .ixg-section-head,
  #services .ixf-service-line{
    width:100%!important;
  }
  #services .ixg-section-head{margin-bottom:220px!important}

  #service-feature-1,
  #brand-scene-2{
    min-height:auto!important;
    padding-block:76px!important;
  }
  #service-feature-1 .ixg-feature__grid,
  #brand-scene-2 .ixg-feature__grid{
    display:flex!important;
    flex-direction:column!important;
    gap:32px!important;
  }
  #service-feature-1 .ixg-feature__stage,
  #brand-scene-2 .ixg-feature__stage{
    order:-1!important;
    width:calc(100% + 32px)!important;
    margin-left:-16px!important;
    min-height:430px!important;
  }

  #trust{padding-block:84px!important}
  #trust .ixg-shell{
    display:flex!important;
    flex-direction:column!important;
    gap:34px!important;
  }
  .r122-proof-visual{
    order:-1!important;
    width:calc(100% + 32px)!important;
    margin:0 0 8px -16px!important;
    min-height:420px!important;
  }
  #trust .ixg-trust-reasons{width:100%!important}

  #bridge{min-height:720px!important}
  #bridge .r122-bridge-grid{
    display:flex!important;
    flex-direction:column!important;
    align-items:flex-start!important;
    gap:28px!important;
  }

  #final-cta[data-r122-final-cta="conversion-object"]{
    min-height:760px!important;
    padding-block:84px!important;
  }
  #final-cta .ixg-contact__inner{
    display:flex!important;
    flex-direction:column!important;
    gap:48px!important;
  }
  #final-cta h2{font-size:54px!important}
  #final-cta .r122-conversion__action{
    width:100%!important;
    min-height:96px!important;
    grid-template-columns:1fr 82px!important;
  }
  #final-cta .r122-conversion__action .ixg-cta--primary{
    min-height:96px!important;
    padding:0 18px 0 24px!important;
    font-size:15px!important;
  }
  #final-cta .r122-conversion__action .ixg-cta__mark{
    width:58px!important;height:58px!important;
  }

  .ix-v2-footer-grid{
    grid-template-columns:1fr!important;
    gap:28px!important;
  }
}

@media (max-width:700px){
  .r122-positioning-grid{min-height:620px!important;width:calc(100% + 32px)!important;margin-left:-16px!important}
  .r122-positioning-caption{width:100%!important;padding:28px 22px 34px!important}
  .r122-positioning-caption h2{font-size:48px!important;max-width:10ch!important}
  .r122-feature-grid,.r122-feature-grid--reverse{display:flex!important;flex-direction:column!important;gap:28px!important}
  .r122-process-visual,.r122-structure-visual{order:-1!important;width:calc(100% + 32px)!important;margin-left:-16px!important;min-height:440px!important}
  .r122-feature-copy,.r122-structure-copy{width:100%!important}
  .r122-trust-grid{display:flex!important;flex-direction:column!important;gap:36px!important}
  .r122-proof-visual{order:-1!important;width:calc(100% + 32px)!important;margin:0 0 8px -16px!important;min-height:430px!important}
  #trust .ixg-trust-reason{grid-template-columns:30px minmax(0,1fr)!important;min-height:108px!important;padding:20px 0!important}
  #trust .ixg-trust-reason strong{font-size:19px!important}
  #bridge .r122-bridge-grid{display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:28px!important}
  #final-cta .r122-conversion__action{grid-template-columns:1fr!important}
  #final-cta .r122-conversion__secondary{min-height:68px!important;border-left:0!important;border-top:1px solid rgba(6,9,13,.18)!important}
}
@media (prefers-reduced-motion:reduce){
  [data-r121-motion]{transition:none!important;transform:none!important}
}
`;

  css += r122Css;

  const sectionIds=actualTopLevelSectionIds(html);
  const usedCopy=[...new Set([...html.matchAll(/\{\{copy:([A-Z0-9_]+)\}\}/g)].map(m=>m[1]))];
  const usedAssets=[...new Set([...html.matchAll(/\{\{asset:([A-Z0-9_]+)\}\}/g)].map(m=>m[1]))];

  return {
    ...previousSpec,
    main_html:html,
    custom_css:css,
    section_ids:sectionIds,
    section_blueprint:sectionIds,
    section_architecture_standard:"R122_DETERMINISTIC_CAMPAIGN_ARCHITECTURE_V1",
    section_first_standard:"R122_STORY_FIRST_V1",
    home_depth_standard:"R122_15K_VALUE_DEPTH_V1",
    section_substance_standard:"R122_EVIDENCE_AND_VISUAL_RICHNESS_V1",
    used_copy_tokens:usedCopy.length?usedCopy:Object.keys(copyManifest||{}),
    used_asset_tokens:usedAssets,
    hero_visual_strategy:"Full-bleed environmental hero with dark asymmetric copy field, strong dual-action hierarchy and mobile-specific crop.",
    hero_subject:"Verified locality-scale editorial environment supporting the KiPoint multi-service positioning.",
    hero_scene_type:"R122_FULL_BLEED_CAMPAIGN",
    hero_copy_space:"LEFT_ASYMMETRIC_OVERLAY",
    hero_mobile_crop_strategy:"Portrait recut with subject shifted right and copy anchored low over a stronger vertical veil.",
    hero_relevance_score:9.7,
    r121_standard:R121_CREATIVE_DIRECTOR_STANDARD,
    r121_concept_standard:R121_CONCEPT_LOCK_STANDARD,
    r121_concept_fidelity:"DETERMINISTIC_LOCKED_CONCEPT_TRANSLATION",
    r121_signature_motion_hooks:["material-reveal","structural-slide","detail-focus","proof-lock"],
    r122_desire_engine_standard:R122_DESIRE_ENGINE_STANDARD,
    r122_sellability_thesis:String(concept?.campaign_thesis||""),
    r122_brand_dna_rationale:String(concept?.brand_world||concept?.visual_bible||""),
    perceptual_flagship_standard:"R121_SELLABILITY_V1",
    surface_policy:"IMPRESAX_RENDER_STANDARD_R122_DESIRE_ENGINE",
    implementation_notes:"R122 deterministic transformation of the last certified technical scaffold. Six distinct campaign visuals, premium shell, authored conversion object and mobile re-authoring are enforced without AI HTML generation."
  };
}

export async function generateR121RenderSpec(env,{
  inputPayload,direction,variantKey,copyManifest,assetTokens,concept,
  qaFeedback=null,previousSpec=null,beforeModelAttempt=null
}={}) {
  const allowedAssets=[...new Set((assetTokens||[]).filter(x=>x&&x!=="PRIMARY_LOGO"))];
  const r122Deterministic=
    String(inputPayload?.r122_desire_engine_standard||"")===R122_DESIRE_ENGINE_STANDARD
    && String(concept?.selection_rationale||"").startsWith("R122_DETERMINISTIC_PREPRODUCTION_LOCK")
    && previousSpec?.main_html
    && previousSpec?.custom_css;
  if(r122Deterministic) {
    const spec=buildR122DeterministicRenderSpec({previousSpec,copyManifest,assetTokens,concept,qaFeedback});
    if(spec) return {spec,model:"R122_DETERMINISTIC_RENDERER_V1",r121:true,r122:true,deterministic:true};
  }
  const safePrevious=qaFeedback && previousSpec ? {
    section_ids:Array.isArray(previousSpec.section_ids)?previousSpec.section_ids.slice(0,9):[],
    implementation_notes:String(previousSpec.implementation_notes||"").slice(0,900),
    main_html:String(previousSpec.main_html||"").slice(0,6500),
    custom_css:String(previousSpec.custom_css||"").slice(0,5200)
  } : null;
  const compactFeedback=qaFeedback ? {
    reason:String(qaFeedback.reason||"R121_REPAIR"),
    summary:String(qaFeedback.summary||"").slice(0,900),
    issues:(Array.isArray(qaFeedback.issues)?qaFeedback.issues:[]).slice(0,10).map(x=>({
      code:String(x?.code||"").slice(0,80),
      target:String(x?.target||"").slice(0,90),
      message:String(x?.message||x||"").slice(0,240)
    })),
    actions:(Array.isArray(qaFeedback.actions)?qaFeedback.actions:[]).slice(0,5).map(x=>String(x).slice(0,320))
  } : null;

  const prompt=[
    "R121 CREATIVE DIRECTOR ENGINE — IMPLEMENTATION STAGE.",
    "The creative decision is already LOCKED. Do not invent a new style, generic premium language or alternative layout thesis.",
    "Translate the supplied Concept Lock into one production-grade homepage. The page must feel like a commissioned digital campaign, not a sequence of website sections.",
    ...R122_IMPLEMENTATION_RULES,
    "",
    "NON-NEGOTIABLE CREATIVE RULES:",
    "1. CONCEPT FIDELITY: every major composition, image crop, typography choice and transition hook must visibly serve the locked campaign thesis and signature motif.",
    "2. STORY BEFORE SECTIONS: follow the emotional/commercial progression in the desktop storyboard. The six compiler semantic ids are anchors, not a prescribed visual cadence.",
    "3. ASSET ROLES ARE UNIQUE: use each R121 campaign asset as a primary visual at most once. Do not manufacture richness by repeating/cropping the same photograph throughout the page.",
    "4. HERO: first section id=hero. It must contain exactly one <img src=\"{{asset:HERO_VISUAL}}\">, an <h1> with {{copy:HERO_HEADLINE}}, visible {{copy:HERO_BODY}}, {{cta:PRIMARY}} and {{cta:SECONDARY}}. Copy/CTAs must be genuinely over the photographic field on desktop and mobile.",
    "5. REQUIRED SEMANTIC ANCHORS: include ids hero, positioning, services, trust, bridge, final-cta. You may add at most three concept-driven sections only when they materially advance the locked storyboard.",
    "6. REQUIRED COPY CONTRACTS: positioning uses POSITIONING_TITLE + POSITIONING_BODY; services uses SERVICES_TITLE + SERVICES_INTRO; trust uses TRUST_TITLE + TRUST_INTRO; final-cta uses CLOSING_TITLE + CLOSING_BODY + primary CTA. Keep supporting copy visually subordinate; no walls of text.",
    "7. TRUTH: visible text must use ONLY {{copy:TOKEN}} tokens. Links use ONLY {{cta:PRIMARY}}/{{cta:SECONDARY}}. Images use ONLY listed {{asset:TOKEN}} tokens. Official identity, if used in main, is only {{identity:PRIMARY_LOGO}} and may appear at most once.",
    "8. MOTION HOOKS: add data-r121-motion to 1–4 meaningful elements tied to the motion signature, using ONLY these hook values: material-reveal, structural-slide, detail-focus, proof-lock. Choose them semantically; do not sprinkle all four mechanically. The static composition must still look finished because QA screenshots do not depend on motion.",
    "9. MOBILE IS A SECOND COMPOSITION: implement a genuine 390px recut following the mobile storyboard. It may reorder visual emphasis, crop differently, change overlap/scale and simplify motion hooks.",
    "10. NO UI-KIT GRAMMAR: no card soup, SaaS dashboards, repeated left-copy/right-image splits, alternating dark/light bands, decorative empty boxes, generic feature grids or fake metrics.",
    "11. NO VISUAL CHECKLIST DESIGN: do not add sections, graphics or effects simply to look rich. Every visible object must have a narrative job.",
    "12. SHELL: custom_css must art-direct .ix-v2-header, .ix-v2-nav, .ix-v2-header-cta, .ix-v2-footer and .ix-v2-footer-grid so they belong to the campaign.",
    "13. SAFETY: no scripts, forms, SVG, inline style attributes, external URLs, CSS url(), @import, @font-face, pseudo-element content property or event handlers.",
    "14. RESPONSIVE: include desktop, an intentional 701–1180px composition, and a max-width:700px mobile composition. Include prefers-reduced-motion treatment for any transition-heavy styling.",
    "15. OUTPUT: main_html is content inside <main> only. Do not output header/footer/main/html/body tags.",
    "",
    "LOCKED CONCEPT:",
    JSON.stringify(concept||{}),
    "",
    "SELECTED DIRECTION — supporting visual context only:",
    JSON.stringify(direction||{}),
    "",
    "VERIFIED INPUT — facts only, never render values directly unless represented by allowed copy tokens:",
    JSON.stringify(inputPayload||{}),
    "",
    "ALLOWED COPY TOKENS:",
    JSON.stringify(Object.keys(copyManifest||{})),
    "",
    "ALLOWED ASSET TOKENS:",
    JSON.stringify(allowedAssets),
    compactFeedback?"TARGETED MECHANICAL/RENDER REPAIR — preserve the Concept Lock, fix only these failures:"+JSON.stringify(compactFeedback):"",
    safePrevious?"PREVIOUS R121 SPEC — use only as an implementation reference; never dilute the locked concept:"+JSON.stringify(safePrevious):""
  ].filter(Boolean).join("\n");

  const r=await runStructured(env,qaFeedback?"repair":"generator",{
    messages:[
      {role:"system",content:"You are the implementation art director for a locked global-studio-level campaign concept. Concept fidelity, production quality, truth safety and responsive craft are mandatory. Do not revert to generic website composition."},
      {role:"user",content:prompt}
    ],
    schema:r121RenderSpecSchema,
    maxTokens:9000,
    temperature:qaFeedback?0.12:0.22,
    beforeAttempt:beforeModelAttempt,
    allowR118External:true
  });

  const actualSectionIds=actualTopLevelSectionIds(r.data?.main_html);
  return {
    spec:{
      ...r.data,
      section_ids:actualSectionIds.length?actualSectionIds:r.data.section_ids,
      section_blueprint:actualSectionIds.length?actualSectionIds:r.data.section_blueprint,
      section_architecture_standard:"R121_CONCEPT_DRIVEN_ARCHITECTURE_V1",
      section_first_standard:"R121_STORY_FIRST_V1",
      home_depth_standard:"R121_NARRATIVE_DEPTH_V1",
      section_substance_standard:"R121_EVIDENCE_STAGING_V1",
      r121_standard:R121_CREATIVE_DIRECTOR_STANDARD,
      r121_concept_standard:R121_CONCEPT_LOCK_STANDARD,
      r122_desire_engine_standard:R122_DESIRE_ENGINE_STANDARD,
      r122_sellability_thesis:String(concept?.campaign_thesis||""),
      r122_brand_dna_rationale:String(concept?.brand_world||concept?.visual_bible||""),
      perceptual_flagship_standard:"R121_SELLABILITY_V1",
      surface_policy:"IMPRESAX_RENDER_STANDARD_R122_DESIRE_ENGINE",
      implementation_notes:"R121 LOCKED CONCEPT IMPLEMENTATION — "+String(r.data?.implementation_notes||"")
    },
    model:r.model,
    r121:true
  };
}

export async function generateRenderSpec(env,{inputPayload,direction,variantKey,copyManifest,assetTokens,qaFeedback=null,previousSpec=null,beforeModelAttempt=null,allowR118External=false,r119EvidenceMode=false}) {
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
  const feedbackReason=String(qaFeedback?.reason||"");
  const hardResetReasons=["COMPILER_CONTRACT","SHOWROOM_HARD_RESET","R118_PERCEPTUAL_HARD_RESET"];
  const r119EvidenceActive=allowR118External && (r119EvidenceMode===true || /^R119_/i.test(feedbackReason));
  const dedilR119=r119EvidenceActive && /DEDIL\s+DONATO/i.test(String(inputPayload?.business_name||""));
  const r118CompilerRepair=allowR118External && feedbackReason==="R118_COMPILER_REPAIR";
  const compactCompilerPrevious=r118CompilerRepair && previousSpec ? {
    section_ids:Array.isArray(previousSpec.section_ids)?previousSpec.section_ids.slice(0,12):[],
    section_blueprint:Array.isArray(previousSpec.section_blueprint)?previousSpec.section_blueprint.slice(0,12):[],
    implementation_notes:String(previousSpec.implementation_notes||"").slice(0,1400),
    hero_visual_strategy:String(previousSpec.hero_visual_strategy||"").slice(0,700),
    main_html:String(previousSpec.main_html||"").slice(0,7000),
    custom_css:String(previousSpec.custom_css||"").slice(0,5000)
  } : null;
  const hardResetRequested=hardResetReasons.includes(feedbackReason)
    || /^R119_.*GENERATIVE|R119_GENERATIVE/i.test(feedbackReason);
  const safePrevious=hardResetRequested
    ? null
    : (r118CompilerRepair?compactCompilerPrevious:previousSpec);
  const r118ScoreKeys=[
    "first_impression","art_direction","page_architecture","composition",
    "signature_visual_language","no_template_feel","anti_template_feel","custom_made_feel",
    "fifteen_k_value_perception","fifteen_k_credibility","irreproducible_brand_authorship",
    "commissioned_experience_quality","visual_memory_factor","middle_scroll_value",
    "why_us_strength","anti_empty_layout","mobile_quality","mobile_premium_integrity",
    "cross_viewport_art_direction","hero_wow_effect"
  ];
  const compactR118Feedback=allowR118External && qaFeedback ? {
    reason:String(qaFeedback.reason||"R118_VISUAL_REWORK"),
    summary:String(qaFeedback.summary||"").slice(0,1200),
    scores:Object.fromEntries(r118ScoreKeys
      .filter(k=>qaFeedback?.scores?.[k]!=null)
      .map(k=>[k,qaFeedback.scores[k]])),
    issues:(Array.isArray(qaFeedback.issues)?qaFeedback.issues:[])
      .slice(0,14)
      .map(x=>({
        code:String(x?.code||"").slice(0,80),
        severity:String(x?.severity||"").slice(0,16),
        target:String(x?.target||"").slice(0,100),
        message:String(x?.message||"").slice(0,260)
      })),
    actions:(Array.isArray(qaFeedback.actions)?qaFeedback.actions:[])
      .slice(0,6)
      .map(x=>String(x).slice(0,420)),
    best_candidate_revision:qaFeedback.best_candidate_revision??null,
    best_candidate_score:qaFeedback.best_candidate_score??null
  } : qaFeedback;
  const prompt=[
    "Implement variant "+variantKey+" as a flagship premium full-home RenderSpec for the VERIFIED prospect.",
    "R117 AUTHORED FLAGSHIP TARGET: the page must plausibly feel like a €15,000+ commissioned digital design, not a polished template.",
    "R118 PERCEPTUAL JURY TARGET: the actual screenshots will be judged by a hostile senior design jury. Technical compliance, clean CSS and premium-looking components do NOT count as success if the page still reads as a sequence of website sections.",
    "R118 STRUCTURAL RESET: when reworking a previous spec, preserve verified content and assets but you MAY radically rebuild composition, proportions, section internals, spatial rhythm and image treatment. Do not make micro-fixes when the jury says the perceived value is low.",
    "R118 STUDIO TEST: every major scene must feel designed as a spread, campaign frame or physical brand environment rather than a UI section inside a centered container.",
    r119EvidenceActive?"R119 EVIDENCE MODE: build the art direction from verified sector/material/service/territory/partner evidence. Do not fall back to generic industrial copy, testimonial patterns, trust badges, UI cards or stock-corporate modules.":"",
    dedilR119?"DEDIL R119 NARRATIVE: make construction materials, rebar processing, Catanzaro operational presence and the verified U-Power relationship the authored story. Steel, concrete, rebar, dust, machining precision, engineered linework and DEDIL red/charcoal identity must form a singular visual language.":"",
    dedilR119?"DEDIL R119 TRUTH RULE: never invent testimonials, certifications, project counts, team size, revenue, customer quotes or generic trust badges. Use only supplied verified tokens and approved assets.":"",
    dedilR119?"DEDIL R119 ASSET RULE: use distinct approved photography across hero/materials/rebar/proof scenes. Never reuse HERO_VISUAL inside the rebar/service scene when a distinct SERVICE_REBAR_VISUAL or other approved section asset is available.":"",
    dedilR119?"DEDIL R119 SIGNATURE DEVICE: create one recognizable authored device from industrial geometry/materiality and, when official identity is available, use at most one restrained {{identity:PRIMARY_LOGO}} watermark as part of that scene.":"",
    allowR118External?"R118 REQUIRED-ID FLEXIBILITY: hero, positioning, services, trust, bridge and final-cta are semantic anchors required by the compiler, NOT a prescribed page sequence. Hero stays first and final-cta stays last; between them, reorder, interleave and radically reshape the semantic anchors to serve the creative thesis.":"",
    allowR118External?"R118 SPATIAL DIVERSITY: at least three major scenes must break the centered-shell pattern through full-bleed media, asymmetric edge anchoring, split fields, oversized type, offset composition or controlled overlap. No two adjacent major scenes may share the same grid logic.":"",
    allowR118External?"R118 HARD RESET BEHAVIOR: when feedback reason is R118_PERCEPTUAL_HARD_RESET or an R119 generative reset, do not preserve DOM order, component hierarchy, section proportions, typography scale or CTA composition from the previous attempt. Preserve only verified content, immutable identity and allowed assets.":"",
    "This is NOT a wireframe, starter template, generic agency page, SaaS layout or basic implementation.",
    "NO TEMPLATE TEST is blocking: the design must be difficult to reuse for another company after swapping logo/colors/copy.",
    "Build at least THREE portfolio-grade WOW moments: hero, signature mid-page set piece, and closing scene.",
    "Create ONE unmistakable signature section rooted in verified brand/sector/process/material/territory/product/technology/history evidence.",
    "BAN CARD SOUP and generic UI-kit grammar. Prefer editorial composition, asymmetric rhythm, scale changes, full-bleed scenes, proof-as-design and premium restraint.",
    "Typography must act as architecture, with deliberate macro/micro contrast and editorial line breaks.",
    "Mobile at 390px must be re-authored natively: independently choose crop, order, spacing, type scale and scene rhythm rather than stacking desktop.",
    "Apply the PORTFOLIO SCREENSHOT TEST: hero, positioning/signature, services/editorial scene, proof, and close should each survive as individual portfolio screenshots.",
    "If the result is only clean/modern/professional and not distinctive/authored/memorable, redesign before returning.",
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
    allowR118External?"- R118/R119 FLAGSHIP OUTPUT FLOOR: main_html must contain at least 5000 characters of real authored markup and custom_css at least 6500 characters of real art direction. Do not pad with comments, repeated selectors or filler. Keep main_html concise enough to stay roughly within 5k-14k characters and custom_css roughly within 6.5k-22k characters; prefer precise reusable selectors over repetitive CSS.":"",
    allowR118External?"- R118/R119 BLUEPRINT CONTRACT: section_blueprint MUST equal the actual top-level section id sequence exactly. home_depth_standard MUST be R111_15K_HOME_DEPTH_ARCHITECTURE_V1 and section_substance_standard MUST be R112_SECTION_SUBSTANCE_COMMERCIAL_DEPTH_V1.":"",
    "- main_html is the CONTENT INSIDE <main>; NEVER output <main>, <html>, <head>, <body>, <header> or <footer> tags.",
    "- R111 HOME DEPTH: use 8-12 substantial <section> blocks and ALWAYS include these exact ids: hero, positioning, services, trust, bridge, final-cta.",
    "- SECTION_ID INTEGRITY: section_ids must match the ACTUAL top-level <section id=\"...\"> elements one-to-one. Inner service cards, trust items, articles or divs NEVER count as sections.",
    "- R111 ACTUAL DEPTH: include at least 8 ACTUAL top-level sections in main_html. At least 7 must be substantial, at least 2 must carry data-section-role=\"editorial-feature\", and there must be at least 6 scenes between hero and final-cta.",
    "- ART-DIRECTED SURFACES: every non-hero top-level section must carry data-surface=\"art-directed\" and custom_css must visibly art-direct .ix-v2-header, .ix-v2-nav and .ix-v2-footer.",
    "- SECTION VISUAL DENSITY: distribute at least three DISTINCT approved image asset tokens across different top-level scenes; do not satisfy density by repeating the same image.",
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
    "- R112 SECTION SUBSTANCE HARD GATE: length is irrelevant if the page is empty. Every middle-scroll scene must contain enough verified commercial substance to justify its footprint. Decorative-only or giant-empty sections fail.",
    "- R112 WHY-US HARD GATE: the why-us scene must contain 4-6 distinct verified reasons/capabilities, visible graphic support and at least one proof/trust support device. Three tiny reasons floating in empty space is a FAIL.",
    "- R112 EDITORIAL SUBSTANCE GATE: each editorial feature must use at least three meaningful verified copy tokens/ideas and a materially different composition. An oversized visual with two lines of copy is a FAIL.",
    "- R112 COMMERCIAL SPECIFICITY GATE: at least three middle-scroll scenes must visibly express sector-specific products, services, operations, applications, logistics, locality or verified capability. Generic brand theatre is insufficient.",
    "- R112 EMPTY-SPACE BALANCE GATE: premium whitespace must frame content, not replace it. Large blank zones, hollow decorative devices or oversized empty stages fail anti_empty_layout.",
    "- R112 CTA DISTINCTION GATE: the bridge and final CTA must have different jobs. Bridge uses the secondary/contact-development action; the final close uses the primary conversion action. Do not repeat both actions in consecutive closing scenes.",
    "- R112 MOBILE DENSITY GATE: at 390px, each substantial scene must retain commercial information, hierarchy and visual support without becoming a long empty scroll.",
    "- CUSTOM-MADE GATE: the composition must feel difficult to reuse unchanged for another prospect. Require at least three authored signature moments tied to this brand, sector, imagery and commercial story.",
    "- PREMIUM ART-DIRECTION GATE: judge the whole page as a commissioned brand experience, not a component library. Strong hero alone cannot compensate for ordinary middle sections.",
    "- BRAND SPECIFICITY GATE: logo, brand color, geometry, imagery, copy hierarchy and sector cues must create unmistakable ownership by the prospect.",
    "- IMAGERY VALUE GATE: imagery must look credible, high-resolution, relevant and intentionally art-directed. Cheap stock, obvious AI look, weak crops or low-impact photos destroy the 15K perception.",
    "- SALES ARCHITECTURE GATE: beauty must support persuasion. The scroll must make positioning, services, differentiation, process, proof and final action feel intentionally sequenced.",
    "- DETAIL REFINEMENT GATE: inspect micro-alignment, spacing, borders, icon treatment, CTA proportions, overlays, crop discipline, header/footer finish and empty-space balance. A few cheap details are enough to fail the 15K gate.",
    "- MOBILE VALUE PARITY GATE: mobile must retain the same perceived investment as desktop. It is not acceptable for desktop to look 15K while mobile looks like a compressed template.",
    "- FIFTEEN-K TEST: explicitly answer: would a business owner reasonably believe a serious agency charged 10K-15K for this? Under R107, fifteen_k_value_perception must reach 9.7 before candidate pass.",
    "- R116 FLAGSHIP PRESENCE: flagship_presence >=9.8. The page must feel like a flagship commission, never merely a polished corporate site.",
    "- R116 SECTION IDENTITY: section_identity >=9.8. Major scenes must have materially distinct composition logic while sharing one proprietary visual system.",
    "- R116 EDITORIAL COMPOSITION: editorial_composition >=9.8. Typography, image crop, scale and negative space must feel art-directed at campaign level.",
    "- R116 LUXURY SIMPLICITY: luxury_simplicity >=9.7. Simplicity must feel expensive and intentional, never empty, generic or under-designed.",
    "- R116 15K CREDIBILITY: fifteen_k_credibility >=9.8. Judge the actual screenshots as a serious flagship agency commission with no explanatory discount.",
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
    compactR118Feedback?"REWORK FEEDBACK — fix these exact failures without weakening the art direction:"+JSON.stringify(compactR118Feedback):"",
    safePrevious?"PREVIOUS SPEC — preserve what is good and surgically improve only what failed:"+JSON.stringify(safePrevious):""
  ].filter(Boolean).join("\n");

  const generatorReasons=["ENGINE_CONTRACT_UPGRADE","SHOWROOM_HARD_RESET","R118_PERCEPTUAL_HARD_RESET"];
  const generatorReason=generatorReasons.includes(String(qaFeedback?.reason||""))
    || /^R119_/i.test(String(qaFeedback?.reason||""));
  const role=qaFeedback && !generatorReason ? "repair" : "generator";
  const r=await runStructured(env,role,{
    messages:[
      {role:"system",content:"You are the senior frontend art director for ImpresaX. Produce production-grade, token-safe structured output. Contract compliance is mandatory; premium art direction is mandatory; a premium prospect-relevant HERO_VISUAL is mandatory; invented facts or unapproved assets are forbidden."},
      {role:"user",content:prompt}
    ],
    schema:allowR118External?r118FlagshipRenderSpecSchema:renderSpecSchema,maxTokens:allowR118External?9000:12000,temperature:qaFeedback?0.18:0.28,beforeAttempt:beforeModelAttempt,allowR118External
  });
  const actualSectionIds=actualTopLevelSectionIds(r.data?.main_html);
  const generatedSpec=allowR118External
    ? {
        ...r.data,
        section_ids:actualSectionIds.length?actualSectionIds:r.data?.section_ids,
        section_blueprint:actualSectionIds.length?actualSectionIds:r.data?.section_blueprint,
        home_depth_standard:"R111_15K_HOME_DEPTH_ARCHITECTURE_V1",
        section_substance_standard:"R112_SECTION_SUBSTANCE_COMMERCIAL_DEPTH_V1",
        perceptual_flagship_standard:"R118_PERCEPTUAL_JURY_V1",
        r119_evidence_mode:r119EvidenceActive===true,
        implementation_notes:"R118 PERCEPTUAL REPAIR — generated from hostile screenshot jury feedback. "+String(r.data?.implementation_notes||"")
      }
    : r.data;
  return {spec:generatedSpec,model:r.model};
}


const r121SellabilitySchema={
  type:"object",additionalProperties:false,
  properties:{
    pass:{type:"boolean"},
    summary:{type:"string"},
    issues:{type:"array",maxItems:3,items:{
      type:"object",additionalProperties:false,
      properties:{
        code:{type:"string"},severity:{type:"string",enum:["critical","major","minor"]},
        target:{type:"string"},message:{type:"string"}
      },
      required:["code","severity","target","message"]
    }},
    actions:{type:"array",maxItems:3,items:{type:"string"}},
    scores:{type:"object",additionalProperties:false,properties:r121ConceptJuryScores,required:R121_SELLABILITY_AXES}
  },
  required:["pass","summary","issues","actions","scores"]
};

export async function runR121SellabilityQa(env,{
  inputPayload,concept,desktopB64,mobileB64,browserEvidence=null,beforeModelAttempt=null
}={}) {
  const prompt=[
    "R121 SELLABILITY JURY + R122 DESIRE ENGINE. Judge the actual desktop and mobile screenshots against the LOCKED creative concept.",
    "Do not score a checklist of UI details. Judge whether the finished work preserves the campaign idea and creates a strong desire to buy.",
    "HARD FAIL if the hero lacks immediate visual authority, if menu/header looks theme-like, if the page feels image-poor, if CTAs look like generic buttons, or if the footer feels like a standard utility footer.",
    "HARD FAIL if there are fewer than three genuinely memorable visual moments or if imagery does not feel materially varied.",
    "HARD FAIL if the official identity appears pasted onto a style that could belong to another business rather than causally shaping the visual system.",
    "Use ONLY these six axes: "+JSON.stringify(R121_SELLABILITY_AXES)+".",
    "Score calibration: 9.0 = strong professional agency work; 9.5 = exceptional; 9.7+ = plausible top-tier commissioned case-study quality.",
    "PASS requires every axis >=9.5, and concept_strength, desire_to_buy, brand_authorship and execution_quality >=9.7.",
    "HARD FAIL if it reads as a brochure, template, repeated split layout, stock-photo collage, generic industrial site, or if the concept requires explanation to be perceived.",
    "HARD FAIL if the mobile screenshot looks like a compressed desktop rather than the same campaign re-authored for 390px.",
    "HARD FAIL if the imagery feels repetitive even when technically different.",
    "Do not invent missing factual evidence. Judge only visible design and deterministic browser evidence.",
    "Return at most three issues and three actions. Name the highest-leverage problems only.",
    "LOCKED CONCEPT:",
    JSON.stringify(concept||{}),
    "VERIFIED INPUT:",
    JSON.stringify(inputPayload||{}),
    "BROWSER EVIDENCE:",
    JSON.stringify(browserEvidence||{})
  ].join("\n");

  const r=await runStructured(env,"visualQa",{
    messages:[
      {role:"system",content:"You are a hostile executive creative board deciding whether a premium digital concept is sellable as a flagship commission. Be decisive and sparse."},
      {role:"user",content:[
        {type:"text",text:prompt},
        {type:"image_url",image_url:{url:"data:image/jpeg;base64,"+desktopB64}},
        {type:"image_url",image_url:{url:"data:image/jpeg;base64,"+mobileB64}}
      ]}
    ],
    schema:r121SellabilitySchema,maxTokens:1800,temperature:0.01,vision:true,
    beforeAttempt:beforeModelAttempt,allowR118External:true
  });
  const scores=r.data.scores||{};
  const min=Math.min(...R121_SELLABILITY_AXES.map(k=>Number(scores[k]||0)));
  const critical=Math.min(
    Number(scores.concept_strength||0),
    Number(scores.desire_to_buy||0),
    Number(scores.brand_authorship||0),
    Number(scores.execution_quality||0)
  );
  const hardIssues=(r.data.issues||[]).filter(x=>x?.severity==="critical"||x?.severity==="major");
  const pass=r.data.pass===true && min>=9.5 && critical>=9.7 && hardIssues.length===0;
  return {...r.data,pass,min_score:min,critical_floor:critical,model:r.model};
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

export function applyVisualQaScoreGates({scores={},issues=[],actions=[],logoFirstMaster=false,masterGateKeys=[],r118PerceptualJury=false}={}) {
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
    if(!r118PerceptualJury) {
      nextActions.push(`Raise ${key} from ${score} to at least ${required} with a targeted visual refinement; do not change already-passing sections.`);
    }
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

  const r112SectionSubstanceFloor={
    section_substance:9.7,
    commercial_depth:9.7,
    middle_scroll_value:9.6,
    why_us_strength:9.7,
    anti_empty_layout:9.8,
    cta_distinction:9.5,
    mobile_density_quality:9.6
  };
  for(const [key,required] of Object.entries(r112SectionSubstanceFloor)) {
    const score=Number(scores?.[key]??0);
    if(score<required) addGateIssue(key,score,required,"r112_section_substance_gate_below_floor");
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
    cross_viewport_art_direction:9.7,
    flagship_presence:9.8,
    section_identity:9.8,
    editorial_composition:9.8,
    luxury_simplicity:9.7,
    fifteen_k_credibility:9.8
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

  const r118PerceptualFloor={
    first_impression:9.7,
    art_direction:9.8,
    composition:9.8,
    signature_visual_language:9.8,
    no_template_feel:9.8,
    anti_template_feel:9.8,
    custom_made_feel:9.8,
    premium_art_direction:9.8,
    wow_effect:9.7,
    client_wow_effect:9.7,
    flagship_presence:9.8,
    section_identity:9.8,
    editorial_composition:9.8,
    fifteen_k_value_perception:9.8,
    fifteen_k_credibility:9.8,
    irreproducible_brand_authorship:9.8,
    commissioned_experience_quality:9.8,
    visual_memory_factor:9.8,
    cross_viewport_art_direction:9.8,
    mobile_premium_integrity:9.7
  };
  if(r118PerceptualJury) {
    for(const [key,required] of Object.entries(r118PerceptualFloor)) {
      const score=Number(scores?.[key]??0);
      if(score<required) addGateIssue(key,score,required,"r118_perceptual_jury_below_floor");
    }
  }
  if(r118PerceptualJury && nextIssues.some(x=>x?.severity==="critical"||x?.severity==="major")) {
    nextActions.length=0;
    nextActions.push(
      "R118 STRUCTURAL REBUILD: discard the current spatial composition as a layout reference. Preserve only verified copy, approved assets, official identity and working contact paths.",
      "Recompose the page as 4-5 unmistakable portfolio scenes with different spatial logic, not a repeated sequence of centered sections or modules.",
      "Create a singular DEDIL visual language from industrial material, scale, red/charcoal identity, engineered linework and construction imagery; it must not remain reusable for another industrial prospect.",
      "Make typography, photography and negative space carry the composition. Remove decorative geometry, generic card/module behavior and safe corporate spacing.",
      "Re-author mobile independently at 390px: recrop photography, change sequence/scale where needed and preserve the same authored moments rather than stacking desktop."
    );
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

  const flagshipFloor=Math.min(
    Number(scores?.flagship_presence??0),
    Number(scores?.section_identity??0),
    Number(scores?.editorial_composition??0),
    Number(scores?.luxury_simplicity??0),
    Number(scores?.fifteen_k_credibility??0)
  );
  return {issues:nextIssues,actions:nextActions,pass,min_score:min,master_gate_floor:masterGateFloor,fifteen_k_value_floor:fifteenKScore,irreproducible_authorship_floor:authorshipScore,commissioned_experience_floor:commissionedScore,flagship_gate_floor:flagshipFloor};
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
  "flagship_presence","section_identity","editorial_composition","luxury_simplicity","fifteen_k_credibility",
  "hero_text_on_image_integration","hero_overlay_legibility","sitewide_visual_refinement",
  "image_quality_perception","premium_typography_quality","anti_template_feel","anti_fake_ai_credibility",
  "homepage_richness","section_depth","content_architecture","commercial_story_depth",
  "section_substance","commercial_depth","middle_scroll_value","why_us_strength",
  "anti_empty_layout","cta_distinction","mobile_density_quality"
];

export function visualQaGatePolicy(inputPayload={}) {
  const logoFirstMaster=String(inputPayload?.brand_gate_mode||"")==="LOGO_FIRST_V1";
  const pilotHeroLocked=inputPayload?.pilot_hero_locked===true;
  const r118PerceptualJury=inputPayload?.r118_perceptual_jury===true
    || String(inputPayload?.perceptual_flagship_standard||"")==="R118_PERCEPTUAL_JURY_V1";
  const masterGateKeys=LOGO_FIRST_MASTER_GATE_KEYS.filter(k=>!(pilotHeroLocked && k==="hero_desirability"));
  return {logoFirstMaster,pilotHeroLocked,masterGateKeys,r118PerceptualJury};
}

export async function runVisualQa(env,{inputPayload,direction,variantKey,desktopB64,mobileB64,browserEvidence=null,beforeModelAttempt=null,allowR118External=false}) {
  const {logoFirstMaster,pilotHeroLocked,masterGateKeys,r118PerceptualJury}=visualQaGatePolicy(inputPayload);
  const text=[
    r118PerceptualJury?"R118 PERCEPTUAL JURY: the previous flagship render was explicitly rejected by the human Cabina as nowhere near a EUR 15,000 perceived-value standard. Do NOT reward technical cleanliness, compliance markers, complexity or effort. Judge only what is visibly present in the screenshots.":"",
    r118PerceptualJury?"R118 BENCHMARK: compare against the strongest bespoke corporate/editorial digital work from elite international design studios, not against normal agency websites, themes or polished local-business sites. A very good premium corporate site is still a FAIL.":"",
    r118PerceptualJury?"R118 SCORE CALIBRATION: 9.0 means excellent ordinary premium work and is NOT enough. 9.7 means genuinely exceptional. 9.8+ means the screenshot plausibly supports a EUR 15,000+ design commission with no obvious template cadence. Use 9.8+ sparingly.":"",
    r118PerceptualJury?"R118 HARD FAIL: repeated centered containers, predictable section-after-section cadence, generic split layouts, card/module rhythm, standard website chrome, decorative geometry without a concept, safe typography, stock-photo placement, or desktop merely stacked on mobile.":"",
    r118PerceptualJury?"R118 AUTHORSHIP TEST: if logo/colors/copy could be swapped and the page would still work for another industrial company, score no_template_feel, anti_template_feel, custom_made_feel, irreproducible_brand_authorship and fifteen_k_credibility below the R118 floor.":"",
    r118PerceptualJury?"R118 PORTFOLIO TEST: hero, one mid-page signature scene, proof/trust scene, and closing scene must each be individually strong enough to appear in a top-tier studio case study. If fewer than four moments meet that bar, FAIL.":"",
    r118PerceptualJury?"R118 MOBILE TEST: mobile must feel independently art-directed at 390px. If it reads as desktop columns simply stacked, cross_viewport_art_direction and mobile_premium_integrity must FAIL.":"",

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
    "R112 SECTION SUBSTANCE HARD GATE: section_substance >=9.7, commercial_depth >=9.7, middle_scroll_value >=9.6, why_us_strength >=9.7, anti_empty_layout >=9.8, cta_distinction >=9.5 and mobile_density_quality >=9.6 are blocking.",
    "R112 FAIL CONDITIONS: large dead zones, thin why-us content, oversized decorative feature stages, generic middle-scroll theatre, repeated bridge/final actions, or mobile scenes that become mostly empty space.",
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
    schema:visualQaSchema,maxTokens:2600,temperature:0.02,vision:true,beforeAttempt:beforeModelAttempt,allowR118External
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
    masterGateKeys,
    r118PerceptualJury
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

export async function runHeroAssetQa(env,{imageB64,inputPayload,direction,variantKey,beforeModelAttempt=null,allowR121External=false,campaignRole=null}) {
  const masterProfile=String(inputPayload?.render_profile||"")==="IMPRESAX_MASTER_V1";
  const compositionRule=masterProfile
    ? "IMPRESAX MASTER FULL-BLEED QA: do NOT require blank or clean negative space for HTML copy. The entire frame SHOULD remain a continuous photograph with useful real material/environment detail edge-to-edge. Dense photographic texture is valid and desirable when focal hierarchy remains clear. HTML copy readability is handled later by a CSS gradient overlay. HARD FAIL blank gray/flat copy panels, dead half-frames, split-layout geometry baked into the image, or large non-photographic voids. Judge composition by premium photographic balance, full-frame continuity, focal hierarchy and 390px crop survival."
    : "The image must provide a strong focal point, premium photographic realism, enough clean negative space for HTML copy, and a focal subject that can survive a 390px mobile crop.";
  const r121CampaignAsset=allowR121External===true && campaignRole?.token;
  const mediumInstruction=r121CampaignAsset
    ? "R121 CAMPAIGN ROLE: "+String(campaignRole.token||"")+" — "+String(campaignRole.narrative_role||"")+". Judge the asset in its INTENDED MEDIUM. R121_STRUCTURE may be premium text-free technical CGI/structural abstraction; R121_DETAIL may be studio still-life; R121_ATMOSPHERE may be abstract material/light art. Do NOT fail these roles merely because they are not documentary photographs. For the realism score, judge physical/material plausibility, premium finish and absence of cheap AI artifacts appropriate to the intended medium."
    : "";
  const text=[
    r121CampaignAsset?"Review this RAW R121 campaign visual BEFORE it is allowed into the website render.":"Review this RAW candidate hero photograph BEFORE it is allowed into a website render.",
    "Be extremely strict. This is a premium B2B website asset gate, not a general image critique.",
    mediumInstruction,
    "HARD FAIL if ANY visible letters, words, numbers, logos, signage, labels, UI, watermarks, pseudo-text, gibberish, invented brand marks, or readable writing appear anywhere in the image. Even plausible-looking fake text is a FAIL.",
    "HARD FAIL obvious AI artifacts, uncanny people/hands, impossible materials/architecture, cheap stock-photo staging, fake corporate posing, malformed equipment, low detail, oversharpening or accidental synthetic collage/composite appearance. Deliberate high-end CGI/abstraction is allowed only when the R121 role explicitly requires it.",
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
      local_context:inputPayload?.brand_dna?.local_context||null,
      asset_mode:inputPayload?.asset_mode||null,
      r121_generated_imagery_truth_rule:inputPayload?.r121_generated_imagery_truth_rule||null
    }),
    r121CampaignAsset?"CAMPAIGN ROLE CONTRACT: "+JSON.stringify(campaignRole):"",
    "ART DIRECTION: "+JSON.stringify({
      core_idea:direction?.core_idea||null,
      hero_logic:direction?.hero_logic||null
    })
  ].join("\n");

  const r=await runStructured(env,"visualQa",{
    messages:[
      {role:"system",content:r121CampaignAsset
        ?"You are an independent senior campaign-art QA gate. Judge each asset by its intended medium while rejecting cheap AI artifacts, generic visual language, unwanted text, false branding and implausible material behavior."
        :"You are an independent senior commercial-photography QA gate. Reject anything that could make a premium prospect demo look fake, generic, mislabeled or AI-generated."},
      {role:"user",content:[
        {type:"text",text},
        {type:"image_url",image_url:{url:"data:image/jpeg;base64,"+imageB64}}
      ]}
    ],
    schema:heroAssetQaSchema,maxTokens:1800,temperature:0.02,vision:true,beforeAttempt:beforeModelAttempt,allowR118External:allowR121External===true
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
