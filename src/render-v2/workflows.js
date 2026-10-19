import { WorkflowEntrypoint } from "cloudflare:workers";
import { db, getInputPack, getV2Pack, setPackStatus, persistWorkflow, updateWorkflow, getContentTruth, persistContentTruth, getDirectionPlan, persistDirectionPlan, persistCreativePlan, createVariants, allocateRevision, updateRevision, setVariantStatus, ensureBestPreview, recordQa, recordFailure, countFailureFingerprint } from "./db.js";
import { EXECUTION_ENGINE_VERSION, QUALITY_CONTRACT_VERSION, MODEL_ROUTE_VERSION, PROMPT_VERSION, MAX_VISUAL_REVISIONS, COMPILER_VERSION, MIN_SECTION_VISUALS, EXTERNAL_AI_CALLS_ALLOWED, RENDER_GENERATION_MODE, SHOWROOM_RULES_VERSION, VARIANT_KEYS, TRIPLE_VARIANT_REQUIRED, MINIMUM_VARIANTS_PER_PACK, VARIANT_DIVERGENCE_REQUIRED, VARIANT_DIVERGENCE_FLOOR, STRUCTURAL_DIVERGENCE_REQUIRED, STRUCTURAL_DOM_SIMILARITY_CEILING, STRUCTURAL_HERO_SIMILARITY_CEILING, STRUCTURAL_SECTION_POSITION_SIMILARITY_CEILING, STRUCTURAL_DISTINCT_SECTION_ORDER_REQUIRED, AUTO_SELECT_VARIANT_WINNER, MASTER_AUTO_APPROVE, VARIANT_CREATIVE_ROLES, REMEDIATION_POLICY_VERSION } from "./constants.js";
import { generateContentTruthDraft, reviewContentTruthDraft, createCreativeDirections, combineCreativePlan, buildCopyManifest, generateRenderSpec, runVisualQa, runSetQa, runHeroAssetQa, applyVisualQaScoreGates, visualQaGatePolicy } from "./ai.js";
import { ingestInputAssets, putArtifact, materializeAssetDataUrls, readArtifactBytes } from "./artifacts.js";
import { compileRenderSpec, buildCaptureHtml } from "./compiler.js";
import { captureVariant } from "./browser.js";
import { classifyFailure, failureFingerprint, shouldChangeStrategy } from "./failure-policy.js";
import { bytesToBase64, sha256, stableStringify } from "./utils.js";
import { reserveAiCall, reserveBrowserCapture } from "./metrics.js";
import { buildContactManifest } from "./contacts.js";
import { sanitizeDirectionForExecution, zeroPhotoExecutionDirection, buildZeroPhotoPremiumSpec } from "./design-grammar.js";
import { remediateBlockedPack } from "./remediation.js";
import { explicitHeroAsset, generatePremiumHeroVisual } from "./hero.js";
import { renderConcurrencyState } from "./concurrency.js";
import { sectionVisualTokens } from "./showroom-policy.js";


function verifiedList(value="") {
  return String(value||"")
    .split(/[;|\n]+/)
    .map(x=>x.replace(/\s+/g," ").trim())
    .filter(Boolean);
}

async function deterministicR107Truth(inputPayload={}) {
  const businessName=String(inputPayload.business_name||"").replace(/\s+/g," ").trim();
  const genericService=/^(?:attività(?:\s+di\s+.+)?|panoramica\s+generale|home|chi\s+siamo|azienda|servizi|contatti|portfolio|gallery|galleria)$/i;
  const internalCopy=/\b(?:usare\s+solo|segnali\s+di\s+fiducia|esplicitamente\s+verificat|fonti\s+verificate|non\s+assumere|non\s+inventare|source\s+references?)\b/i;
  const rawServices=verifiedList(inputPayload.verified_services||inputPayload?.brand_dna?.offer||"");
  const certificationTrust=[];
  const cleanedServices=[];
  for(const value of rawServices) {
    const item=String(value||"").replace(/\s+/g," ").trim();
    if(!item || genericService.test(item) || internalCopy.test(item)) continue;
    if(/\bcertificazion[ei]\b/i.test(item)) {
      certificationTrust.push(item);
      continue;
    }
    if(!cleanedServices.some(x=>x.toLowerCase()===item.toLowerCase())) cleanedServices.push(item);
  }
  const explicitTrust=verifiedList(inputPayload.verified_trust||"")
    .filter(x=>!internalCopy.test(x))
    .filter(x=>!/\b(?:fatturato|ricavi|revenue|turnover|dipendenti|employees|headcount|addetti)\b/i.test(x));
  const verifiedTrust=[...new Set([...explicitTrust,...certificationTrust])];
  const services=cleanedServices
    .slice(0,6)
    .map(title=>({title,description:""}));
  const locality=[inputPayload.city,inputPayload.address].filter(Boolean).join(" · ");
  const serviceTitles=services.map(x=>x.title).filter(Boolean);
  const heroBody=[businessName,String(inputPayload.city||"").trim()].filter(Boolean).join(" · ")
    || locality
    || String(inputPayload.verified_contacts||"").trim();
  const servicesIntro=serviceTitles.length>1
    ? serviceTitles.join(" · ")
    : String(inputPayload.city||businessName||"").trim();
  const content_truth={
    hero_headline:businessName||serviceTitles[0]||"",
    hero_body:heroBody,
    positioning_title:"",
    positioning_body:"",
    services_title:"Competenze e servizi",
    services_intro:servicesIntro,
    services,
    trust_title:"Esperienza e affidabilità",
    trust_intro:"",
    trust_points:verifiedTrust.map(text=>({text})),
    locality_line:locality,
    primary_cta_label:String(inputPayload.primary_cta||"Contatti").trim(),
    secondary_cta_label:String(inputPayload.secondary_cta||"Approfondisci").trim(),
    closing_title:"Parliamone",
    closing_body:"",
    footer_line:String(inputPayload.address||inputPayload.city||"").trim()
  };
  const hash=await sha256(stableStringify(content_truth));
  return {
    content_truth,
    verification:{
      pass:true,
      issues:[],
      deterministic:true,
      source:"CERTIFIED_INPUT_PACK",
      no_invented_claims:true
    },
    generator_model:"R107_DETERMINISTIC_TRUTH",
    reviewer_model:"R107_DETERMINISTIC_TRUTH",
    hash,
    verified:true,
    deterministic:true
  };
}

async function deterministicR107Directions(inputPayload={},assetTokens=[]) {
  const directions={};
  const fingerprints={};
  for(const key of VARIANT_KEYS) {
    const base=zeroPhotoExecutionDirection(key,inputPayload);
    const direction={
      ...base,
      asset_tokens:[...new Set(["HERO_VISUAL",...(assetTokens||[]).filter(x=>x!=="PRIMARY_LOGO").slice(0,6)])],
      deterministic_r107:true,
      creative_role:VARIANT_CREATIVE_ROLES?.[key]||key
    };
    directions[key]=direction;
    fingerprints[key]=direction.fingerprint||{};
  }
  const creative_strategy="R107 deterministic premium planning from certified prospect evidence; three structurally distinct routes with overlay hero and premium typography.";
  const diversity_precheck={
    pass:true,
    deterministic:true,
    required:true,
    variant_roles:VARIANT_CREATIVE_ROLES,
    note:"A/B/C are generated from independent deterministic direction fingerprints and later enforced by structural QA."
  };
  const payload={creative_strategy,directions,fingerprints,diversity_precheck};
  return {
    ...payload,
    model:"R107_DETERMINISTIC_DIRECTION_PLANNER",
    hash:await sha256(stableStringify(payload)),
    deterministic:true
  };
}

function structuralSequence(html) {
  const out=[];
  const re=/<\/?(header|nav|main|section|article|aside|footer|figure|form|div)\b([^>]*)>/gi;
  let m;
  while((m=re.exec(String(html||""))) && out.length<420) {
    const closing=m[0][1]==="/";
    if(closing) continue;
    const cls=String(m[2]||"").match(/\bclass\s*=\s*["']([^"']+)["']/i)?.[1]||"";
    const classes=cls.split(/\s+/).filter(Boolean).slice(0,4).sort().join(".");
    out.push(String(m[1]).toLowerCase()+(classes?":"+classes:""));
  }
  return out;
}

function heroStructuralSequence(html) {
  const text=String(html||"");
  const match=text.match(/<section\b[^>]*(?:id=["']hero["']|class=["'][^"']*hero[^"']*["'])[^>]*>[\s\S]*?<\/section>/i);
  return structuralSequence(match?.[0]||text.slice(0,Math.min(text.length,9000)));
}

function sectionOrder(spec) {
  if(Array.isArray(spec?.section_ids) && spec.section_ids.length) return spec.section_ids.map(String);
  const out=[];
  const re=/<section\b[^>]*\bid=["']([^"']+)["'][^>]*>/gi;
  let m; while((m=re.exec(String(spec?.main_html||""))) && out.length<40) out.push(String(m[1]));
  return out;
}

function lcsSimilarity(a,b) {
  const x=(a||[]).slice(0,420), y=(b||[]).slice(0,420);
  if(!x.length || !y.length) return 1;
  const dp=new Array(y.length+1).fill(0);
  for(let i=1;i<=x.length;i++) {
    let prev=0;
    for(let j=1;j<=y.length;j++) {
      const tmp=dp[j];
      dp[j]=x[i-1]===y[j-1] ? prev+1 : Math.max(dp[j],dp[j-1]);
      prev=tmp;
    }
  }
  return dp[y.length]/Math.max(x.length,y.length);
}

function positionalSimilarity(a,b) {
  const n=Math.max(a.length,b.length);
  if(!n) return 1;
  let same=0;
  for(let i=0;i<n;i++) if(a[i]===b[i] && a[i]!=null) same++;
  return same/n;
}

function analyzeStructuralDivergence(specs) {
  const pairs=[["A","B"],["A","C"],["B","C"]];
  const pairResults={};
  const burden={A:0,B:0,C:0};
  let pass=true;
  const issues=[];
  for(const [a,b] of pairs) {
    const sa=specs[a]||{}, sb=specs[b]||{};
    const dom=lcsSimilarity(structuralSequence(sa.main_html),structuralSequence(sb.main_html));
    const hero=lcsSimilarity(heroStructuralSequence(sa.main_html),heroStructuralSequence(sb.main_html));
    const oa=sectionOrder(sa), ob=sectionOrder(sb);
    const section=positionalSimilarity(oa,ob);
    const sameOrder=oa.length===ob.length && oa.every((x,i)=>x===ob[i]);
    const pairPass=
      dom<=STRUCTURAL_DOM_SIMILARITY_CEILING &&
      hero<=STRUCTURAL_HERO_SIMILARITY_CEILING &&
      section<=STRUCTURAL_SECTION_POSITION_SIMILARITY_CEILING &&
      (!STRUCTURAL_DISTINCT_SECTION_ORDER_REQUIRED || !sameOrder);
    const weighted=dom*0.5+hero*0.3+section*0.2;
    const divergence=Math.max(0,Math.min(10,(1-weighted)*10));
    pairResults[a+b]={
      pass:pairPass,
      dom_similarity:Number(dom.toFixed(3)),
      hero_similarity:Number(hero.toFixed(3)),
      section_position_similarity:Number(section.toFixed(3)),
      same_section_order:sameOrder,
      structural_divergence_score:Number(divergence.toFixed(2)),
      section_order_a:oa,
      section_order_b:ob
    };
    burden[a]+=weighted; burden[b]+=weighted;
    if(!pairPass) {
      pass=false;
      issues.push(`${a}/${b} structural collision: DOM ${dom.toFixed(2)}, hero ${hero.toFixed(2)}, section-position ${section.toFixed(2)}, same-order=${sameOrder}`);
    }
  }
  const weakest=Object.entries(burden).sort((x,y)=>y[1]-x[1]||x[0].localeCompare(y[0]))[0]?.[0]||"B";
  return {
    pass,
    required:STRUCTURAL_DIVERGENCE_REQUIRED,
    weakest_variant:pass?"NONE":weakest,
    pairs:pairResults,
    scores:{
      structural_divergence_ab:pairResults.AB.structural_divergence_score,
      structural_divergence_ac:pairResults.AC.structural_divergence_score,
      structural_divergence_bc:pairResults.BC.structural_divergence_score
    },
    issues,
    actions:pass?[]:[
      "Rebuild the weakest variant with a different DOM/component hierarchy, not a CSS skin.",
      "Change section ordering/content staging by at least two major modules versus both other routes.",
      "Use a materially different hero architecture and CTA journey."
    ]
  };
}

async function waitForVariantSlot(step,sql,label,{maxChecks=60,delay="30 seconds"}={}) {
  for(let i=1;i<=maxChecks;i++) {
    const state=await step.do(label+"-capacity-"+i,async()=>renderConcurrencyState(sql));
    if(Number(state.slots||0)>0) return state;
    await step.sleep(label+"-wait-"+i,delay);
  }
  throw new Error("RENDER_CONCURRENCY_SLOT_TIMEOUT");
}

async function inputAssetsFromDb(sql,packId,inputPayload) {
  const rows=await sql`
    select artifact_type,r2_key,sha256,mime,bytes
    from render_artifacts_v2
    where render_pack_id=${packId}::uuid and artifact_type like 'INPUT_ASSET_%'`;
  const byToken={};
  for(const row of rows) {
    const token=String(row.artifact_type).replace(/^INPUT_ASSET_/,"");
    const source=(inputPayload.assets||[]).find(x=>x.asset_id===token)||{};
    byToken[token]={...source,r2_key:row.r2_key,sha256:row.sha256,mime:row.mime,bytes:row.bytes};
  }
  return byToken;
}


async function latestReusableHeroAsset(sql,packId,variantKey) {
  const prefix="HERO_VISUAL_APPROVED_"+variantKey+"_";
  const rows=await sql`
    select a.artifact_type,a.r2_key,a.sha256,a.mime,a.bytes,a.created_at
    from render_artifacts_v2 a
    where a.render_pack_id=${packId}::uuid
      and a.variant_revision_id is null
      and a.artifact_type like ${prefix+"%"}
      and a.mime like 'image/%'
      and a.sha256 is not null
      and a.bytes>0
      and exists(
        select 1
        from render_qa_results_v2 q
        where q.render_pack_id=a.render_pack_id
          and q.qa_type='HERO_ASSET_PREQA'
          and q.status='PASS'
          and q.artifact_hashes->>'variant_key'=${variantKey}
          and q.artifact_hashes->>'hero_sha256'=a.sha256
      )
    order by a.created_at desc
    limit 1`;
  if(!rows.length) return null;
  const a=rows[0];
  return {
    asset_id:"HERO_VISUAL",
    role:"hero",
    source_type:"AI_GENERATED_EDITORIAL_REUSED_PREQA_PASS",
    commercial_use_status:"AI_GENERATED_EDITORIAL",
    generated:true,
    reused:true,
    preqa_pass:true,
    r2_key:a.r2_key,
    mime:a.mime,
    sha256:a.sha256,
    bytes:a.bytes
  };
}

async function reusableHeroAssetBySha(sql,packId,variantKey,sha256) {
  const sha=String(sha256||"").trim().toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(sha)) return null;
  const prefix="HERO_VISUAL_APPROVED_"+variantKey+"_";
  const rows=await sql`
    select a.artifact_type,a.r2_key,a.sha256,a.mime,a.bytes,a.created_at
    from render_artifacts_v2 a
    where a.render_pack_id=${packId}::uuid
      and a.variant_revision_id is null
      and a.artifact_type like ${prefix+"%"}
      and a.sha256=${sha}
      and a.mime like 'image/%'
      and a.bytes>0
      and exists(
        select 1
        from render_qa_results_v2 q
        where q.render_pack_id=a.render_pack_id
          and q.qa_type='HERO_ASSET_PREQA'
          and q.status='PASS'
          and q.artifact_hashes->>'variant_key'=${variantKey}
          and q.artifact_hashes->>'hero_sha256'=a.sha256
      )
    order by a.created_at desc
    limit 1`;
  if(!rows.length) return null;
  const a=rows[0];
  return {
    asset_id:"HERO_VISUAL",
    role:"hero",
    source_type:"AI_GENERATED_EDITORIAL_LOCKED_PREQA_PASS",
    commercial_use_status:"AI_GENERATED_EDITORIAL",
    generated:true,
    reused:true,
    locked:true,
    preqa_pass:true,
    r2_key:a.r2_key,
    mime:a.mime,
    sha256:a.sha256,
    bytes:a.bytes
  };
}

async function createGeneratedHeroAsset(env,sql,{packId,inputPayload,direction,variantKey,workflowInstanceId,cycle=1,revisionId=null,feedback=null}) {
  const model=env.V2_MODEL_HERO_IMAGE||"@cf/black-forest-labs/flux-2-klein-9b";
  const safeInstance=String(workflowInstanceId||"workflow").replace(/[^a-zA-Z0-9_-]+/g,"-").slice(0,120);
  const base="render-v2/"+inputPayload.prospect_code+"/"+packId+"/"+variantKey+"/hero/";
  let lastQa=null;
  let generationFeedback=feedback;

  for(let attempt=1;attempt<=3;attempt++) {
    await reserveAiCall(sql,packId,env,"HERO_IMAGE:"+variantKey+":"+model+":A"+attempt,revisionId);
    const generated=await generatePremiumHeroVisual(env,{
      inputPayload,direction,variantKey,
      feedback:generationFeedback,
      generationAttempt:attempt,
      generationCycle:cycle
    });
    const imageB64=bytesToBase64(generated.bytes);
    const qa=await runHeroAssetQa(env,{
      imageB64,
      inputPayload,
      direction,
      variantKey,
      beforeModelAttempt:({model:qaModel,role})=>
        reserveAiCall(sql,packId,env,"HERO_PREQA:"+variantKey+":"+role+":"+qaModel+":A"+attempt,revisionId)
    });
    lastQa=qa;

    const ext=generated.mime==="image/png"?"png":generated.mime==="image/webp"?"webp":"jpg";
    const approved=qa.pass===true;
    const type=(approved?"HERO_VISUAL_APPROVED_":"HERO_VISUAL_REJECTED_")+variantKey+"_R"+cycle+"_A"+attempt;
    const imageHash=await sha256(generated.bytes);
    const key=base+safeInstance+"-r"+cycle+"-a"+attempt+"-"+imageHash.slice(0,16)+(approved?"-approved":"-rejected")+"."+ext;
    const artifact=await putArtifact(env,sql,{
      packId,revisionId:null,type,key,body:generated.bytes,mime:generated.mime,
      producerStep:approved?"HERO_IMAGE_PREQA_PASS":"HERO_IMAGE_PREQA_REJECT"
    });
    const metaPayload={
      model:generated.model,
      prompt:generated.prompt,
      width:generated.width,
      height:generated.height,
      generated:true,
      illustrative_not_documentary:true,
      cycle,
      attempt,
      image_sha256:imageHash,
      preqa:{
        pass:qa.pass,
        model:qa.model,
        summary:qa.summary,
        scores:qa.scores,
        issues:qa.issues,
        regeneration_guidance:qa.regeneration_guidance
      }
    };
    const metaBytes=new TextEncoder().encode(JSON.stringify(metaPayload));
    const metaHash=await sha256(metaBytes);
    const metaKey=base+safeInstance+"-r"+cycle+"-a"+attempt+"-"+metaHash.slice(0,16)+".json";
    await putArtifact(env,sql,{
      packId,revisionId:null,
      type:(approved?"HERO_VISUAL_APPROVED_META_":"HERO_VISUAL_REJECTED_META_")+variantKey+"_R"+cycle+"_A"+attempt,
      key:metaKey,
      body:metaBytes,
      mime:"application/json",
      producerStep:"HERO_IMAGE_PREQA"
    });
    await recordQa(sql,{
      packId,
      revisionId:null,
      type:"HERO_ASSET_PREQA",
      status:approved?"PASS":"FAIL",
      scores:qa.scores||{},
      issues:qa.issues||[],
      actions:qa.regeneration_guidance||[],
      artifactHashes:{
        variant_key:variantKey,
        cycle,
        attempt,
        hero_sha256:artifact.sha256,
        hero_r2_key:artifact.r2_key,
        hero_model:generated.model,
        reviewer_model:qa.model
      },
      modelRouteVersion:MODEL_ROUTE_VERSION,
      promptVersion:PROMPT_VERSION,
      idempotencyKey:"qa:HERO_ASSET_PREQA:"+packId+":"+variantKey+":"+artifact.sha256
    });

    if(approved) {
      return {
        asset_id:"HERO_VISUAL",
        role:"hero",
        source_type:"AI_GENERATED_EDITORIAL_PREQA_PASS",
        commercial_use_status:"AI_GENERATED_EDITORIAL",
        generated:true,
        preqa_pass:true,
        model:generated.model,
        r2_key:artifact.r2_key,
        mime:artifact.mime,
        sha256:artifact.sha256,
        bytes:artifact.bytes,
        generation_cycle:cycle,
        generation_attempt:attempt,
        preqa_scores:qa.scores
      };
    }

    generationFeedback=[
      "RAW HERO PRE-QA REJECTED.",
      qa.summary||"",
      ...((qa.issues||[]).map(x=>x?.message||x?.code||String(x))),
      ...((qa.regeneration_guidance||[]).map(String)),
      "Generate a materially different photograph. Absolutely no text-like marks, labels, signage, logos, words or numbers."
    ].filter(Boolean).join(" | ").slice(0,2600);
  }

  throw new Error("HERO_ASSET_PREQA_FAILED:"+String(lastQa?.summary||"NO_CLEAN_HERO_AFTER_3_ATTEMPTS"));
}

function r107GraphicPalette(inputPayload={}) {
  const raw=JSON.stringify(inputPayload?.brand_dna?.existing_colors||"");
  const colors=[...new Set(raw.match(/#[0-9a-f]{6}/gi)||[])];
  const primary=colors.find(x=>!/^#(?:ffffff|000000|111111|f[0-9a-f]{5})$/i.test(x))||"#b31319";
  return {primary,ink:"#101214",paper:"#f4f1ec"};
}

async function createR107DeterministicGraphicHeroAsset(env,sql,{packId,inputPayload,variantKey}) {
  const {primary,ink,paper}=r107GraphicPalette(inputPayload);
  const code=String(inputPayload?.prospect_code||"prospect").replace(/[^a-zA-Z0-9_-]+/g,"-").slice(0,80);
  const motif=variantKey==="A"
    ? `<path d="M-80 850 L620 130 L760 130 L60 850 Z" fill="${primary}" opacity=".26"/>
       <path d="M560 1024 L1280 250" stroke="${primary}" stroke-width="18" opacity=".72"/>
       <path d="M820 1024 L1540 240" stroke="${paper}" stroke-width="2" opacity=".35"/>`
    : variantKey==="B"
      ? `<rect x="900" y="-80" width="310" height="1180" fill="${primary}" opacity=".22" transform="rotate(11 900 -80)"/>
         <path d="M0 760 H1536 M0 820 H1536 M0 880 H1536" stroke="${paper}" stroke-width="2" opacity=".22"/>
         <circle cx="1190" cy="310" r="240" fill="none" stroke="${primary}" stroke-width="24" opacity=".55"/>`
      : `<path d="M0 160 H1536 M0 480 H1536 M0 800 H1536" stroke="${paper}" stroke-width="2" opacity=".18"/>
         <path d="M1040 -80 L1540 420 L1040 920 L540 420 Z" fill="${primary}" opacity=".25"/>
         <path d="M1210 0 V1024" stroke="${primary}" stroke-width="22" opacity=".7"/>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${ink}"/>
        <stop offset=".58" stop-color="#22262a"/>
        <stop offset="1" stop-color="${primary}"/>
      </linearGradient>
      <radialGradient id="glow" cx=".72" cy=".32" r=".74">
        <stop offset="0" stop-color="${primary}" stop-opacity=".38"/>
        <stop offset=".55" stop-color="${primary}" stop-opacity=".08"/>
        <stop offset="1" stop-color="${ink}" stop-opacity="0"/>
      </radialGradient>
      <pattern id="grid" width="72" height="72" patternUnits="userSpaceOnUse">
        <path d="M72 0H0V72" fill="none" stroke="${paper}" stroke-width="1" opacity=".08"/>
      </pattern>
    </defs>
    <rect width="1536" height="1024" fill="url(#bg)"/>
    <rect width="1536" height="1024" fill="url(#glow)"/>
    <rect width="1536" height="1024" fill="url(#grid)"/>
    ${motif}
    <path d="M0 970 C360 870 640 1010 960 900 C1220 810 1390 840 1536 780 V1024 H0Z" fill="#000" opacity=".22"/>
  </svg>`;
  const bytes=new TextEncoder().encode(svg);
  const hash=await sha256(bytes);
  const key="render-v2/"+code+"/"+packId+"/"+variantKey+"/hero/r107-graphic-"+hash.slice(0,16)+".svg";
  const artifact=await putArtifact(env,sql,{
    packId,revisionId:null,
    type:"HERO_VISUAL_APPROVED_"+variantKey+"_R107_GRAPHIC",
    key,body:bytes,mime:"image/svg+xml",
    producerStep:"R107_DETERMINISTIC_GRAPHIC_HERO"
  });
  await recordQa(sql,{
    packId,revisionId:null,type:"HERO_ASSET_PREQA",status:"PASS",
    scores:{vector_quality:10,overlay_safety:10,no_fake_photo:10,high_resolution_scalability:10},
    issues:[],actions:[],
    artifactHashes:{variant_key:variantKey,hero_sha256:artifact.sha256,hero_r2_key:artifact.r2_key,hero_model:"R107_DETERMINISTIC_VECTOR"},
    modelRouteVersion:MODEL_ROUTE_VERSION,promptVersion:PROMPT_VERSION,
    idempotencyKey:"qa:HERO_ASSET_PREQA:"+packId+":"+variantKey+":"+artifact.sha256
  });
  return {
    asset_id:"HERO_VISUAL",role:"hero",
    source_type:"R107_DETERMINISTIC_VECTOR_ARTWORK",
    commercial_use_status:"INTERNAL_GENERATED_ARTWORK",
    generated:true,ai_generated:false,preqa_pass:true,
    r2_key:artifact.r2_key,mime:artifact.mime,sha256:artifact.sha256,bytes:artifact.bytes,
    width:1536,height:1024,r107_graphic_first:true
  };
}

async function parentInstance(env,id) {
  return env.RENDER_PROSPECT_WORKFLOW.get(id);
}

async function emitParent(env,parentId,type,payload) {
  try {
    const parent=await parentInstance(env,parentId);
    await parent.sendEvent({type,payload});
    return true;
  } catch {
    // Child certification must never be invalidated by a stale/dead parent.
    // The reconciler can launch a fresh pack finalizer from persisted variant state.
    return false;
  }
}

async function latestCertifiedRevision(sql,variantId) {
  const rows=await sql`
    select r.*
    from render_v2_variants v
    join render_variant_revisions r on r.variant_id=v.id and r.revision=v.certified_revision
    where v.id=${variantId}::uuid
    limit 1`;
  return rows[0]||null;
}

async function recordTypedFailure(sql,{packId,workflowInstanceId,revisionId=null,stepName,error,variantKey=null,revision=null,strategyVersion}) {
  const wf=await sql`select id from render_workflows_v2 where workflow_instance_id=${workflowInstanceId} limit 1`;
  const failure=classifyFailure(error,{step:stepName,variant_key:variantKey,revision});
  const fingerprint=await failureFingerprint(failure);
  const before=await countFailureFingerprint(sql,packId,fingerprint);
  const rec=await recordFailure(sql,{
    packId,workflowId:wf[0]?.id||null,revisionId,step:stepName,failure,fingerprint,
    strategyVersion,attempt:before+1,details:{variant_key:variantKey,revision}
  });
  const total=await countFailureFingerprint(sql,packId,fingerprint);
  return {failure,fingerprint,count:total,record:rec,change_strategy:shouldChangeStrategy(total)};
}

export class RenderVariantWorkflow extends WorkflowEntrypoint {
  async run(event,step) {
    try {
      return await this.runInternal(event,step);
    } catch(error) {
      const params=event.payload||{};
      const eventPrefix=String(params.eventPrefix||"initial");
      const previewType="preview-"+params.variantKey+"-"+eventPrefix;
      const terminalType="terminal-"+params.variantKey+"-"+eventPrefix;
      const message=String(error?.message||error||"UNHANDLED_VARIANT_FAILURE");
      const failure=classifyFailure(error,{step:"VARIANT_UNHANDLED",variant_key:params.variantKey});
      let sql=null;
      try {
        sql=db(this.env);
        await persistWorkflow(sql,{
          prospectId:params.prospectId,packId:params.packId,variantId:params.variantId,
          type:"VARIANT",instanceId:event.instanceId,status:"FAILED",
          metadata:{emergency_fail_safe:true,error:message}
        });
        await recordTypedFailure(sql,{
          packId:params.packId,workflowInstanceId:event.instanceId,stepName:"VARIANT_UNHANDLED",
          error:message,variantKey:params.variantKey,strategyVersion:EXECUTION_ENGINE_VERSION
        });
        if(params.variantId) await setVariantStatus(sql,params.variantId,{status:"QA_FAILED"});
        await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:"FAIL_SAFE_ESCALATION",errorCode:failure.failure_code});
      } catch {}
      try {
        await emitParent(this.env,params.parentInstanceId,previewType,{variant_key:params.variantKey,status:"NO_PREVIEW",fail_safe:true});
      } catch {}
      try {
        await emitParent(this.env,params.parentInstanceId,terminalType,{variant_key:params.variantKey,status:"ESCALATION_REQUIRED",failure_domain:failure.failure_domain,fail_safe:true});
      } catch {}
      return {status:"ESCALATION_REQUIRED",variant:params.variantKey,failure_domain:failure.failure_domain,fail_safe:true};
    }
  }

  async runInternal(event,step) {
    const params=event.payload;
    const sql=db(this.env);
    const eventPrefix=String(params.eventPrefix||"initial");
    const previewType="preview-"+params.variantKey+"-"+eventPrefix;
    const terminalType="terminal-"+params.variantKey+"-"+eventPrefix;

    await step.do("register-variant-workflow",{retries:{limit:2,delay:"2 seconds",backoff:"exponential"}},async()=>{
      await persistWorkflow(sql,{
        prospectId:params.prospectId,packId:params.packId,variantId:params.variantId,
        type:"VARIANT",instanceId:event.instanceId,status:"RUNNING",
        metadata:{variant_key:params.variantKey,event_prefix:eventPrefix}
      });
      return {ok:true};
    });

    const context=await step.do("load-variant-context",{retries:{limit:2,delay:"2 seconds",backoff:"exponential"}},async()=>{
      const input=await getInputPack(sql,params.inputPackId);
      const planRows=await sql`select * from render_creative_plans_v2 where render_pack_id=${params.packId}::uuid limit 1`;
      if(!planRows.length) throw new Error("SYSTEM_INVARIANT:CREATIVE_PLAN_NOT_FOUND");
      const plan=planRows[0];
      const packRows=await sql`select metadata from render_v2_packs where id=${params.packId}::uuid limit 1`;
      const packMetadata=packRows[0]?.metadata||{};
      const cabinaPrecomputed=params.initialFeedback?.reason==="CABINA_PRECOMPUTED_RENDER";
      const variantRenderSpecs=packMetadata.cabina_precomputed_render_specs && typeof packMetadata.cabina_precomputed_render_specs==="object"
        ? packMetadata.cabina_precomputed_render_specs
        : null;
      const variantRenderSpec=variantRenderSpecs?.[params.variantKey];
      const cabinaRenderSpec=cabinaPrecomputed && variantRenderSpec && typeof variantRenderSpec==="object"
        ? variantRenderSpec
        : (cabinaPrecomputed && packMetadata.cabina_precomputed_render_spec && typeof packMetadata.cabina_precomputed_render_spec==="object"
          ? packMetadata.cabina_precomputed_render_spec
          : null);
      const renderProfile=String(packMetadata.render_profile||"").trim();
      const logoFirstBrandProfile=packMetadata.logo_first_brand_profile||null;
      const pilotHeroLocked=packMetadata.pilot_reuse_hero_locked===true;
      const inputPayload=(renderProfile||logoFirstBrandProfile||pilotHeroLocked)
        ? {
            ...input.payload,
            ...(renderProfile?{render_profile:renderProfile}:{}),
            ...(logoFirstBrandProfile?{
              logo_first_brand_profile:logoFirstBrandProfile,
              brand_gate_mode:"LOGO_FIRST_V1"
            }:{ }),
            ...(pilotHeroLocked?{
              pilot_hero_locked:true,
              pilot_hero_source_revision:Number(packMetadata.pilot_reuse_hero_source_revision||0)||null
            }:{})
          }
        : input.payload;
      const assets=await inputAssetsFromDb(sql,params.packId,inputPayload);
      const copyManifest=buildCopyManifest(plan.content_truth_pack,inputPayload);
      const structuralRework=packMetadata.structural_divergence_rework_required===true
        || params.initialFeedback?.reason==="STRUCTURAL_DIVERGENCE_REWORK";
      const r107Retrofit=
        packMetadata.r107_retrofit_required===true
        || packMetadata.r107_retrofit_requested===true
        || String(packMetadata.master_reference_status||"")==="R107_RETROFIT_RUNNING"
        || String(packMetadata.quality_upgrade_to||"")===QUALITY_CONTRACT_VERSION
        || params.initialFeedback?.reason==="ENGINE_CONTRACT_UPGRADE";
      const cabinaCopyManifest=(cabinaPrecomputed || structuralRework)
        && packMetadata.cabina_precomputed_copy_manifest
        && typeof packMetadata.cabina_precomputed_copy_manifest==="object"
        ? packMetadata.cabina_precomputed_copy_manifest
        : null;
      if(cabinaCopyManifest) Object.assign(copyManifest,cabinaCopyManifest);
      if(inputPayload.primary_cta) copyManifest.PRIMARY_CTA_LABEL=String(inputPayload.primary_cta);
      if(inputPayload.secondary_cta) copyManifest.SECONDARY_CTA_LABEL=String(inputPayload.secondary_cta);
      const ctaManifest=buildContactManifest(inputPayload);
      const editorialAssetTokens=Object.keys(assets).filter(k=>k!=="PRIMARY_LOGO" && !assets[k]?.unavailable);
      const zeroPhoto=editorialAssetTokens.length===0;
      const direction=zeroPhoto
        ? zeroPhotoExecutionDirection(params.variantKey,inputPayload)
        : sanitizeDirectionForExecution(plan.directions?.[params.variantKey],{hasEditorialAssets:true});
      return {inputPayload,assets,copyManifest,ctaManifest,direction,editorialAssetTokens,zeroPhoto,packMetadata,cabinaPrecomputed,cabinaRenderSpec,r107Retrofit};
    });

    const heroAsset=await step.do("ensure-premium-hero",{retries:{limit:1,delay:"4 seconds",backoff:"exponential"},timeout:"8 minutes"},async()=>{
      const verified=explicitHeroAsset(context.assets);
      if(verified) return verified;
      const structuralRework=
        context.packMetadata?.structural_divergence_rework_required===true
        || String(params.initialFeedback?.reason||"")==="STRUCTURAL_DIVERGENCE_REWORK";
      const r107Retrofit=
        context.r107Retrofit===true
        || String(params.initialFeedback?.reason||"")==="ENGINE_CONTRACT_UPGRADE";
      if(structuralRework || r107Retrofit) {
        const perVariantHero=context.packMetadata?.cabina_precomputed_hero_sha256_by_variant||{};
        const requestedSha=String(perVariantHero?.[params.variantKey]||"").trim().toLowerCase();
        let reusable=requestedSha
          ? await reusableHeroAssetBySha(sql,params.packId,params.variantKey,requestedSha)
          : null;
        if(!reusable) reusable=await latestReusableHeroAsset(sql,params.packId,params.variantKey);
        if(!reusable && r107Retrofit) {
          reusable=await createR107DeterministicGraphicHeroAsset(this.env,sql,{
            packId:params.packId,inputPayload:context.inputPayload,variantKey:params.variantKey
          });
        }
        if(!reusable) throw new Error(structuralRework
          ? "SYSTEM_INVARIANT:STRUCTURAL_REWORK_REUSABLE_HERO_REQUIRED"
          : "SYSTEM_INVARIANT:R107_RETROFIT_REUSABLE_HERO_REQUIRED");
        return {...reusable,structural_rework_reuse:structuralRework,r107_retrofit_reuse:r107Retrofit};
      }
      if(context.cabinaPrecomputed) {
        const perVariantHero=context.packMetadata?.cabina_precomputed_hero_sha256_by_variant||{};
        const requestedSha=String(perVariantHero?.[params.variantKey]||context.packMetadata?.cabina_precomputed_hero_sha256||"").trim().toLowerCase();
        let reusable=requestedSha
          ? await reusableHeroAssetBySha(sql,params.packId,params.variantKey,requestedSha)
          : null;
        if(!reusable) reusable=await latestReusableHeroAsset(sql,params.packId,params.variantKey);
        if(!reusable) throw new Error("SYSTEM_INVARIANT:CABINA_APPROVED_HERO_REQUIRED");
        return {...reusable,cabina_precomputed:true};
      }
      const masterProfile=String(context.inputPayload?.render_profile||"")==="IMPRESAX_MASTER_V1";
      const lockedHeroPilot=params.initialFeedback?.reason==="PILOT_LAYOUT_MICROPOLISH_REUSE_HERO";
      if(lockedHeroPilot) {
        if(!masterProfile) throw new Error("SYSTEM_INVARIANT:PILOT_HERO_LOCK_REQUIRES_MASTER_PROFILE");
        const requestedSha=String(context.packMetadata?.pilot_reuse_hero_sha256||"").trim().toLowerCase();
        const reusable=await reusableHeroAssetBySha(sql,params.packId,params.variantKey,requestedSha);
        if(!reusable) throw new Error("SYSTEM_INVARIANT:PILOT_LOCKED_HERO_NOT_FOUND_OR_NOT_PREQA_PASS");
        return reusable;
      }

      if(EXTERNAL_AI_CALLS_ALLOWED===false) {
        return createR107DeterministicGraphicHeroAsset(this.env,sql,{
          packId:params.packId,inputPayload:context.inputPayload,variantKey:params.variantKey
        });
      }
      try {
        return await createGeneratedHeroAsset(this.env,sql,{
          packId:params.packId,
          inputPayload:context.inputPayload,
          direction:context.direction,
          variantKey:params.variantKey,
          workflowInstanceId:event.instanceId,
          cycle:1
        });
      } catch(error) {
        if(String(params.initialFeedback?.reason||"")==="SHOWROOM_HARD_RESET") {
          const reusable=await latestReusableHeroAsset(sql,params.packId,params.variantKey);
          if(reusable) {
            return {
              ...reusable,
              showroom_hero_fallback:true,
              showroom_hero_fallback_reason:"NEW_HERO_PREQA_REJECTED_AFTER_3_ATTEMPTS"
            };
          }
        }
        throw error;
      }
    });
    context.assets={...context.assets,HERO_VISUAL:heroAsset};
    context.editorialAssetTokens=[...new Set([...context.editorialAssetTokens,"HERO_VISUAL"])];
    context.direction={
      ...context.direction,
      asset_tokens:[...new Set([...(context.direction?.asset_tokens||[]),"HERO_VISUAL"])],
      hero_logic:String(context.direction?.hero_logic||"")+" HERO_VISUAL is the mandatory dominant photographic anchor; preserve a clear copy field and intentional 390px crop."
    };
    // Preserve the original no-editorial-photo fact for the fast contract-relaunch seed.
    // HERO_VISUAL is now a real asset, but the layout can still use the deterministic premium grammar on cycle 1.
    context.heroOnly=context.zeroPhoto;

    let feedback=params.initialFeedback||null;
    let previousSpec=null;
    if(params.parentRevisionId) {
      const prior=await step.do("load-parent-revision",async()=>{
        const rows=await sql`select * from render_variant_revisions where id=${params.parentRevisionId}::uuid limit 1`;
        return rows[0]||null;
      });
      previousSpec=prior?.render_spec||null;
    }

    let previewEmitted=false;
    for(let cycle=1;cycle<=MAX_VISUAL_REVISIONS;cycle++) {
      const revision=await step.do("r"+cycle+"-allocate",async()=>{
        const r=await allocateRevision(sql,params.variantId,cycle===1?params.parentRevisionId:null,event.instanceId+":cycle:"+cycle);
        await updateWorkflow(sql,event.instanceId,{status:"RUNNING",currentStep:"GENERATE",attempt:cycle,metadata:{revision:r.revision}});
        return r;
      });

      if(cycle>1
        && feedback?.reason==="HERO_VISUAL_REPAIR"
        && context.packMetadata?.structural_divergence_rework_required!==true
        && context.r107Retrofit!==true
        && String(params.initialFeedback?.reason||"")!=="ENGINE_CONTRACT_UPGRADE") {
        const refreshedHero=await step.do("r"+cycle+"-refresh-hero",{retries:{limit:1,delay:"4 seconds",backoff:"exponential"},timeout:"8 minutes"},async()=>{
          return createGeneratedHeroAsset(this.env,sql,{
            packId:params.packId,
            inputPayload:context.inputPayload,
            direction:context.direction,
            variantKey:params.variantKey,
            workflowInstanceId:event.instanceId,
            cycle,
            revisionId:revision.id,
            feedback:[...((feedback?.issues)||[]),...((feedback?.actions)||[])].map(x=>typeof x==="string"?x:(x?.message||x?.code||"")).filter(Boolean).join(" | ")
          });
        });
        context.assets={...context.assets,HERO_VISUAL:refreshedHero};
      }

      const boundHero=await step.do("r"+cycle+"-bind-hero",async()=>{
        const source=context.assets.HERO_VISUAL;
        if(!source?.r2_key) throw new Error("SYSTEM_INVARIANT:HERO_VISUAL_SOURCE_REQUIRED");
        const heroBytes=await readArtifactBytes(this.env,source.r2_key);
        const ext=source.mime==="image/png"?"png":source.mime==="image/webp"?"webp":source.mime==="image/svg+xml"?"svg":"jpg";
        const key="render-v2/"+context.inputPayload.prospect_code+"/"+params.packId+"/"+params.variantKey+"/r"+revision.revision+"/hero-visual."+ext;
        const artifact=await putArtifact(this.env,sql,{
          packId:params.packId,
          revisionId:revision.id,
          type:"HERO_VISUAL_USED",
          key,
          body:heroBytes,
          mime:source.mime||"image/jpeg",
          producerStep:"HERO_BIND_REVISION"
        });
        return {...source,r2_key:artifact.r2_key,sha256:artifact.sha256,mime:artifact.mime,bytes:artifact.bytes,bound_revision_id:revision.id};
      });
      context.assets={...context.assets,HERO_VISUAL:boundHero};

      let generated;
      try {
        generated=await step.do("r"+cycle+"-generate",{retries:{limit:1,delay:"3 seconds",backoff:"exponential"},timeout:"12 minutes"},async()=>{
          if(context.cabinaPrecomputed) {
            if(!context.cabinaRenderSpec) throw new Error("SYSTEM_INVARIANT:CABINA_RENDER_SPEC_REQUIRED");
            return {spec:context.cabinaRenderSpec,model:"CHATGPT_CABINA_PRECOMPUTED",cabina_precomputed:true};
          }
          const structuralDeterministic=
            context.packMetadata?.structural_divergence_rework_required===true
            || String(params.initialFeedback?.reason||"")==="STRUCTURAL_DIVERGENCE_REWORK"
            || String(feedback?.reason||"")==="STRUCTURAL_DIVERGENCE_REWORK";
          const contractUpgradeDeterministic=
            context.r107Retrofit===true
            || String(params.initialFeedback?.reason||"")==="ENGINE_CONTRACT_UPGRADE"
            || String(feedback?.reason||"")==="ENGINE_CONTRACT_UPGRADE";
          if(contractUpgradeDeterministic || (cycle===1 && (structuralDeterministic || (context.heroOnly && ["QUEUE_AUTO_RECOVERY","PILOT_LAYOUT_MICROPOLISH_REUSE_HERO"].includes(String(feedback?.reason||"")))))) {
            const deterministic=buildZeroPhotoPremiumSpec({
              variantKey:params.variantKey,
              copyManifest:context.copyManifest,
              hasIdentity:Boolean(context.assets.PRIMARY_LOGO),
              inputPayload:context.inputPayload,
              sectionAssetTokens:context.editorialAssetTokens.filter(token=>token!=="HERO_VISUAL")
            });
            return {spec:deterministic.spec,model:deterministic.strategy,deterministic:true};
          }
          return generateRenderSpec(this.env,{
            inputPayload:context.inputPayload,direction:context.direction,variantKey:params.variantKey,
            copyManifest:context.copyManifest,
            assetTokens:context.editorialAssetTokens,
            qaFeedback:feedback,previousSpec,
            beforeModelAttempt:({model})=>reserveAiCall(sql,params.packId,this.env,"VARIANT_GENERATION:"+model,revision.id)
          });
        });
      } catch(error) {
        const message=String(error?.message||error);
        const fail=await step.do("r"+cycle+"-record-generation-provider-failure",async()=>
          recordTypedFailure(sql,{packId:params.packId,workflowInstanceId:event.instanceId,revisionId:revision.id,stepName:"VARIANT_GENERATION_PROVIDER",error:message,variantKey:params.variantKey,revision:revision.revision,strategyVersion:MODEL_ROUTE_VERSION})
        );
        const domain=fail?.failure?.failure_domain||"AI_PROVIDER";
        const budget=/HARD_BUDGET_EXCEEDED/.test(message);
        const deterministicRecovery=
          context.r107Retrofit===true
          || ["ENGINE_CONTRACT_UPGRADE","QUEUE_AUTO_RECOVERY","STRUCTURAL_DIVERGENCE_REWORK"].includes(String(params.initialFeedback?.reason||""));
        const providerFailoverDomain=
          ["AI_OUTPUT_SCHEMA","INFRA","AI_PROVIDER","UNKNOWN"].includes(String(domain));
        // Premium V4 generation may use deterministic failover for recovery, but never for a SHOWROOM_HARD_RESET.
        // For zero-photo/home layouts, the deterministic spec is executable and still passes
        // through compiler, browser capture, HERO/VISUAL QA and SET QA before certification.
        const showroomHardReset=String(params.initialFeedback?.reason||"")==="SHOWROOM_HARD_RESET";
        const deterministicFailover=!showroomHardReset && !budget && providerFailoverDomain &&
          (context.heroOnly || deterministicRecovery);

        if(deterministicFailover) {
          const deterministic=buildZeroPhotoPremiumSpec({
            variantKey:params.variantKey,
            copyManifest:context.copyManifest,
            hasIdentity:Boolean(context.assets.PRIMARY_LOGO),
            inputPayload:context.inputPayload,
            sectionAssetTokens:context.editorialAssetTokens.filter(token=>token!=="HERO_VISUAL")
          });
          generated={
            spec:deterministic.spec,
            model:deterministic.strategy,
            deterministic:true,
            provider_failover:true,
            provider_failure_domain:domain
          };
          await step.do("r"+cycle+"-generation-provider-deterministic-failover",async()=>{
            await updateWorkflow(sql,event.instanceId,{
              status:"RUNNING",
              currentStep:"DETERMINISTIC_PROVIDER_FAILOVER",
              errorCode:null,
              metadata:{
                provider_failover:true,
                provider_failure_domain:domain,
                deterministic_strategy:deterministic.strategy,
                fallback_revision:revision.revision
              }
            });
            return {ok:true};
          });
        } else {
          const retryable=fail?.failure?.retryable===true && !budget && cycle<MAX_VISUAL_REVISIONS;
          if(retryable) {
            await step.do("r"+cycle+"-generation-provider-retry",async()=>{
              await updateRevision(sql,revision.id,{status:"QA_FAILED"});
              await updateWorkflow(sql,event.instanceId,{status:"RUNNING",currentStep:"PROVIDER_RETRY",errorCode:null,metadata:{retry_domain:domain,retry_cycle:cycle+1}});
              return {ok:true};
            });
            feedback={
              ...(feedback||{}),
              reason:"TRANSIENT_PROVIDER_RETRY",
              issues:[...((feedback?.issues)||[]),"Transient provider failure; preserve the best valid composition and retry without changing factual content."],
              actions:[...((feedback?.actions)||[]),"Retry the same visual strategy; do not redesign because of an infrastructure timeout."]
            };
            continue;
          }
          await step.do("r"+cycle+"-generation-provider-escalation",async()=>{
            await updateRevision(sql,revision.id,{status:"QA_FAILED"});
            await setVariantStatus(sql,params.variantId,{status:"ESCALATION_REQUIRED"});
            if(!previewEmitted) await emitParent(this.env,params.parentInstanceId,previewType,{variant_key:params.variantKey,status:"NO_PREVIEW"});
            await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:budget?"BUDGET_ESCALATION":"AI_PROVIDER_ESCALATION",errorCode:budget?"HARD_BUDGET_EXCEEDED":"VARIANT_GENERATION_PROVIDER_FAILED"});
            await emitParent(this.env,params.parentInstanceId,terminalType,{variant_key:params.variantKey,status:"ESCALATION_REQUIRED",failure_domain:domain});
            return {ok:true};
          });
          return {status:"ESCALATION_REQUIRED",variant:params.variantKey,failure_domain:domain};
        }
      }

      previousSpec=generated.spec;
      const assetManifest=Object.fromEntries(
        Object.keys(context.assets).filter(k=>k!=="PRIMARY_LOGO").map(k=>[k,"asset://"+k])
      );
      const logoToken=context.assets.PRIMARY_LOGO?"identity://PRIMARY_LOGO":null;
      const compiled=await step.do("r"+cycle+"-compile",async()=>{
        return compileRenderSpec(generated.spec,{
          businessName:context.inputPayload.business_name,logoToken,
          copyManifest:context.copyManifest,assetManifest,ctaManifest:context.ctaManifest
        });
      });

      if(!compiled.ok) {
        const msg="RENDER_SPEC_COMPILE_FAILED:"+compiled.issues.join("|");
        const fail=await step.do("r"+cycle+"-record-compile-failure",async()=>
          recordTypedFailure(sql,{packId:params.packId,workflowInstanceId:event.instanceId,revisionId:revision.id,stepName:"COMPILE",error:msg,variantKey:params.variantKey,revision:revision.revision,strategyVersion:COMPILER_VERSION})
        );
        await updateRevision(sql,revision.id,{status:"QA_FAILED",renderSpec:generated.spec});
        const deterministicCompileFailure=
          context.r107Retrofit===true
          || context.packMetadata?.structural_divergence_rework_required===true
          || (EXTERNAL_AI_CALLS_ALLOWED!==true && generated?.deterministic===true);
        if(deterministicCompileFailure) {
          await step.do("r"+cycle+"-deterministic-compile-escalation",async()=>{
            await setVariantStatus(sql,params.variantId,{status:"ESCALATION_REQUIRED"});
            if(!previewEmitted) await emitParent(this.env,params.parentInstanceId,previewType,{variant_key:params.variantKey,status:"NO_PREVIEW"});
            await updateWorkflow(sql,event.instanceId,{
              status:"FAILED",
              currentStep:"DETERMINISTIC_COMPILE_ESCALATION",
              errorCode:"DETERMINISTIC_COMPILE_FAILED",
              metadata:{compile_issues:compiled.issues,deterministic_no_retry:true}
            });
            await emitParent(this.env,params.parentInstanceId,terminalType,{
              variant_key:params.variantKey,status:"ESCALATION_REQUIRED",failure_domain:"STRUCTURAL_GENERATION"
            });
            return {ok:true};
          });
          return {status:"ESCALATION_REQUIRED",variant:params.variantKey,failure_domain:"STRUCTURAL_GENERATION"};
        }
        feedback={
          issues:compiled.issues,
          actions:[
            "Preserve the approved visual direction but rebuild the failing markup/CSS to satisfy the RenderSpec contract.",
            "Never reference PRIMARY_LOGO inside main_html; the deterministic compiler owns official identity.",
            "Replace every literal visible string or decorative number with an allowed copy token or remove it.",
            "Remove CSS content:, url(), @import and any external/network construct.",
            "Return 6-10 substantial sections, complete desktop/mobile CSS, and only declared tokens."
          ],
          reason:"COMPILER_CONTRACT"
        };
        if(fail.change_strategy) break;
        continue;
      }

      const htmlKey="render-v2/"+context.inputPayload.prospect_code+"/"+params.packId+"/"+params.variantKey+"/r"+revision.revision+"/source.html";
      const htmlArtifact=await step.do("r"+cycle+"-persist-source",{retries:{limit:2,delay:"2 seconds",backoff:"exponential"}},async()=>{
        return putArtifact(this.env,sql,{packId:params.packId,revisionId:revision.id,type:"SOURCE_HTML",key:htmlKey,body:compiled.html,mime:"text/html; charset=utf-8",producerStep:"COMPILE"});
      });
      await updateRevision(sql,revision.id,{status:"CAPTURING",renderSpec:compiled.normalized_spec||generated.spec,sourceHash:compiled.source_hash,htmlKey:htmlKey,compilerVersion:compiled.compiler_version||COMPILER_VERSION});

      let captured;
      try {
        captured=await step.do("r"+cycle+"-capture",{retries:{limit:1,delay:"3 seconds",backoff:"constant"},timeout:"5 minutes"},async()=>{
          const existing=await sql`
            select artifact_type,r2_key,sha256,mime,bytes
            from render_artifacts_v2
            where variant_revision_id=${revision.id}::uuid
              and artifact_type in ('DESKTOP_1440','MOBILE_390','QA_DESKTOP','QA_MOBILE','BROWSER_DIAGNOSTICS')`;
          const byType=Object.fromEntries(existing.map(x=>[x.artifact_type,x]));
          if(["DESKTOP_1440","MOBILE_390","QA_DESKTOP","QA_MOBILE","BROWSER_DIAGNOSTICS"].every(k=>byType[k])) {
            const diagBytes=await readArtifactBytes(this.env,byType.BROWSER_DIAGNOSTICS.r2_key);
            const diag=JSON.parse(new TextDecoder().decode(diagBytes));
            return {
              ok:true,reused:true,
              desktop:byType.DESKTOP_1440,mobile:byType.MOBILE_390,
              qaDesktop:byType.QA_DESKTOP,qaMobile:byType.QA_MOBILE,
              gate:diag.gate,diagnostics:diag.diagnostics
            };
          }

          await reserveBrowserCapture(sql,params.packId,this.env,params.variantKey,revision.id);
          const dataUrls=await materializeAssetDataUrls(this.env,context.assets);
          const captureHtml=buildCaptureHtml(compiled.html,dataUrls);
          const result=await captureVariant(this.env,captureHtml,context.inputPayload);
          const base="render-v2/"+context.inputPayload.prospect_code+"/"+params.packId+"/"+params.variantKey+"/r"+revision.revision+"/";
          const [desktop,mobile,qaDesktop,qaMobile]=await Promise.all([
            putArtifact(this.env,sql,{packId:params.packId,revisionId:revision.id,type:"DESKTOP_1440",key:base+"desktop-1440.jpg",body:result.desktop.bytes,mime:"image/jpeg",producerStep:"BROWSER_CAPTURE"}),
            putArtifact(this.env,sql,{packId:params.packId,revisionId:revision.id,type:"MOBILE_390",key:base+"mobile-390.jpg",body:result.mobile.bytes,mime:"image/jpeg",producerStep:"BROWSER_CAPTURE"}),
            putArtifact(this.env,sql,{packId:params.packId,revisionId:revision.id,type:"QA_DESKTOP",key:base+"qa-desktop.jpg",body:result.desktop.qaBytes,mime:"image/jpeg",producerStep:"BROWSER_CAPTURE_QA"}),
            putArtifact(this.env,sql,{packId:params.packId,revisionId:revision.id,type:"QA_MOBILE",key:base+"qa-mobile.jpg",body:result.mobile.qaBytes,mime:"image/jpeg",producerStep:"BROWSER_CAPTURE_QA"})
          ]);
          const diagPayload={gate:result.gate,diagnostics:{desktop:result.desktop.diagnostics,mobile:result.mobile.diagnostics}};
          await putArtifact(this.env,sql,{
            packId:params.packId,revisionId:revision.id,type:"BROWSER_DIAGNOSTICS",
            key:base+"browser-diagnostics.json",
            body:new TextEncoder().encode(JSON.stringify(diagPayload)),
            mime:"application/json",producerStep:"BROWSER_CAPTURE"
          });
          return {ok:true,desktop,mobile,qaDesktop,qaMobile,...diagPayload};
        });
      } catch(error) {
        captured={ok:false,error:String(error?.message||error)};
      }

      if(!captured.ok) {
        const fail=await step.do("r"+cycle+"-record-browser-failure",async()=>
          recordTypedFailure(sql,{packId:params.packId,workflowInstanceId:event.instanceId,revisionId:revision.id,stepName:"BROWSER_CAPTURE",error:captured.error,variantKey:params.variantKey,revision:revision.revision,strategyVersion:"BROWSER_V2"})
        );
        const domain=fail?.failure?.failure_domain||"BROWSER";
        const budget=/HARD_BUDGET_EXCEEDED/.test(String(captured.error||""));
        await step.do("r"+cycle+"-browser-escalation",async()=>{
          await updateRevision(sql,revision.id,{status:"QA_FAILED"});
          if(!previewEmitted) await emitParent(this.env,params.parentInstanceId,previewType,{variant_key:params.variantKey,status:"NO_PREVIEW"});
          await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:budget?"BUDGET_ESCALATION":"BROWSER_ESCALATION",errorCode:budget?"HARD_BUDGET_EXCEEDED":"BROWSER_CAPTURE_FAILED",metadata:{budget_terminal:budget}});
          await emitParent(this.env,params.parentInstanceId,terminalType,{variant_key:params.variantKey,status:"ESCALATION_REQUIRED",failure_domain:domain});
          return {ok:true};
        });
        return {status:"ESCALATION_REQUIRED",variant:params.variantKey,failure_domain:domain};
      }

      if(!captured.gate.pass) {
        const msg="BROWSER_DETERMINISTIC_GATE:"+captured.gate.issues.join("|");
        const fail=await step.do("r"+cycle+"-record-browser-gate-failure",async()=>
          recordTypedFailure(sql,{packId:params.packId,workflowInstanceId:event.instanceId,revisionId:revision.id,stepName:"BROWSER_DIAGNOSTICS",error:msg,variantKey:params.variantKey,revision:revision.revision,strategyVersion:"BROWSER_GATE_V1"})
        );
        await updateRevision(sql,revision.id,{status:"QA_FAILED",desktopKey:captured.desktop.r2_key,mobileKey:captured.mobile.r2_key});
        feedback={issues:captured.gate.issues,actions:["Fix only the deterministic browser defects."]};
        if(fail.change_strategy) break;
        continue;
      }

      await step.do("r"+cycle+"-publish-preview",async()=>{
        await updateRevision(sql,revision.id,{status:"PREVIEW_READY",desktopKey:captured.desktop.r2_key,mobileKey:captured.mobile.r2_key});
        await ensureBestPreview(sql,params.variantId,revision.revision);
        await setVariantStatus(sql,params.variantId,{status:"PREVIEW_READY"});
        if(!previewEmitted) {
          await emitParent(this.env,params.parentInstanceId,previewType,{variant_key:params.variantKey,status:"PREVIEW_READY",revision:revision.revision,revision_id:revision.id});
        }
        return {ok:true};
      });
      previewEmitted=true;

      const structuralZeroAiReview=
        (
          context.packMetadata?.structural_divergence_rework_required===true
          || context.r107Retrofit===true
        )
        && EXTERNAL_AI_CALLS_ALLOWED!==true;
      if(structuralZeroAiReview) {
        await step.do("r"+cycle+"-structural-zero-ai-deterministic-ready",async()=>{
          await recordQa(sql,{
            packId:params.packId,
            revisionId:revision.id,
            type:"CABINA_DETERMINISTIC",
            status:"PASS",
            scores:{
              browser_gate:10,
              compiler_gate:10,
              asset_integrity:10,
              structural_rework:10
            },
            issues:[],
            actions:["Cabina visual review required before certification; external AI intentionally disabled."],
            artifactHashes:{
              desktop:captured.desktop.sha256,
              mobile:captured.mobile.sha256,
              deterministic_strategy:String(generated?.model||"DETERMINISTIC_STRUCTURAL")
            },
            modelRouteVersion:"CHATGPT_CABINA_ZERO_EXTRA_AI",
            promptVersion:"STRUCTURAL_REWORK_ZERO_AI_V1",
            idempotencyKey:"qa:CABINA_DETERMINISTIC_STRUCTURAL:"+params.packId+":"+revision.id
          });
          if(context.r107Retrofit===true) {
            await setPackStatus(sql,params.packId,"PREVIEW_READY",{
              cabina_visual_review_hold:true,
              retrofit_status:"CABINA_VISUAL_REVIEW",
              master_auto_approve:false
            });
          }
          await updateWorkflow(sql,event.instanceId,{
            status:"COMPLETED",
            currentStep:"CABINA_VISUAL_REVIEW",
            attempt:cycle,
            errorCode:null,
            metadata:{
              structural_divergence_rework:true,
              zero_external_ai:true,
              cabina_visual_review_required:true,
              revision:revision.revision,
              desktop_r2_key:captured.desktop.r2_key,
              mobile_r2_key:captured.mobile.r2_key
            }
          });
          return {ok:true};
        });
        return {
          status:"PREVIEW_READY",
          variant:params.variantKey,
          revision:revision.revision,
          revision_id:revision.id,
          structural_zero_ai:true,
          cabina_visual_review_required:true
        };
      }

      if(context.cabinaPrecomputed) {
        await step.do("r"+cycle+"-cabina-deterministic-ready",async()=>{
          await recordQa(sql,{
            packId:params.packId,
            revisionId:revision.id,
            type:"CABINA_DETERMINISTIC",
            status:"PASS",
            scores:{browser_gate:10,compiler_gate:10,asset_integrity:10},
            issues:[],
            actions:["Await ChatGPT/Cabina visual review of desktop and mobile screenshots."],
            artifactHashes:{desktop:captured.desktop.sha256,mobile:captured.mobile.sha256},
            modelRouteVersion:"CHATGPT_CABINA_PRECOMPUTED",
            promptVersion:"CABINA_PRECOMPUTED_V1",
            idempotencyKey:"qa:CABINA_DETERMINISTIC:"+params.packId+":"+revision.id
          });
          await updateWorkflow(sql,event.instanceId,{
            status:"COMPLETED",
            currentStep:"CABINA_VISUAL_REVIEW",
            attempt:cycle,
            errorCode:null,
            metadata:{
              cabina_precomputed:true,
              cabina_visual_review_required:true,
              revision:revision.revision,
              desktop_r2_key:captured.desktop.r2_key,
              mobile_r2_key:captured.mobile.r2_key
            }
          });
          return {ok:true};
        });
        return {
          status:"PREVIEW_READY",
          variant:params.variantKey,
          revision:revision.revision,
          revision_id:revision.id,
          cabina_visual_review_required:true
        };
      }

      let qa;
      try {
        qa=await step.do("r"+cycle+"-visual-qa",{timeout:"8 minutes"},async()=>{
          const cachedRows=await sql`
            select q.scores,q.issues,q.actions,q.created_at,q.variant_revision_id
            from render_qa_results_v2 q
            where q.render_pack_id=${params.packId}::uuid
              and q.qa_type='VARIANT_VISUAL'
              and q.model_route_version=${MODEL_ROUTE_VERSION}
              and q.prompt_version=${PROMPT_VERSION}
              and q.artifact_hashes->>'desktop'=${captured.desktop.sha256}
              and q.artifact_hashes->>'mobile'=${captured.mobile.sha256}
            order by q.created_at asc
            limit 1`;
          if(cachedRows.length) {
            const cached=cachedRows[0];
            const policy=visualQaGatePolicy(context.inputPayload);
            const gated=applyVisualQaScoreGates({
              scores:cached.scores||{},
              issues:cached.issues||[],
              actions:cached.actions||[],
              logoFirstMaster:policy.logoFirstMaster,
              masterGateKeys:policy.masterGateKeys
            });
            return {
              pass:gated.pass,
              summary:"Artifact-identical QA reused from the canonical first review and revalidated against the current deterministic score gates.",
              scores:cached.scores||{},
              issues:gated.issues,
              actions:gated.actions,
              model:"ARTIFACT_QA_CACHE",
              min_score:gated.min_score,
              master_gate_floor:gated.master_gate_floor,
              master_gate_required:policy.logoFirstMaster?9:null,
              cache_hit:true,
              cache_source_revision_id:cached.variant_revision_id
            };
          }
          const desktopBytes=await readArtifactBytes(this.env,captured.qaDesktop.r2_key);
          const mobileBytes=await readArtifactBytes(this.env,captured.qaMobile.r2_key);
          return runVisualQa(this.env,{
            inputPayload:context.inputPayload,direction:context.direction,variantKey:params.variantKey,
            desktopB64:bytesToBase64(desktopBytes),mobileB64:bytesToBase64(mobileBytes),
            browserEvidence:{
              deterministic_gate_pass:captured.gate?.pass===true,
              deterministic_gate_issues:captured.gate?.issues||[],
              desktop:captured.diagnostics?.desktop||captured.desktop?.diagnostics||{},
              mobile:captured.diagnostics?.mobile||captured.mobile?.diagnostics||{},
              official_identity_visible:
                (captured.diagnostics?.desktop?.official_logo_present??captured.desktop?.diagnostics?.official_logo_present??false)
                && (captured.diagnostics?.mobile?.official_logo_present??captured.mobile?.diagnostics?.official_logo_present??false)
            },
            beforeModelAttempt:({model})=>reserveAiCall(sql,params.packId,this.env,"VARIANT_VISUAL_QA:"+model,revision.id)
          });
        });
      } catch(error) {
        const message=String(error?.message||error);
        const fail=await step.do("r"+cycle+"-record-qa-provider-failure",async()=>
          recordTypedFailure(sql,{packId:params.packId,workflowInstanceId:event.instanceId,revisionId:revision.id,stepName:"VISUAL_QA_PROVIDER",error:message,variantKey:params.variantKey,revision:revision.revision,strategyVersion:MODEL_ROUTE_VERSION})
        );
        const domain=fail?.failure?.failure_domain||"AI_OUTPUT_SCHEMA";
        const budget=domain==="SYSTEM_INVARIANT" && /HARD_BUDGET_EXCEEDED/.test(message);
        await step.do("r"+cycle+"-qa-provider-escalation",async()=>{
          await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:budget?"BUDGET_ESCALATION":"QA_PROVIDER_ESCALATION",errorCode:budget?"HARD_BUDGET_EXCEEDED":"VISUAL_QA_PROVIDER_FAILED"});
          await emitParent(this.env,params.parentInstanceId,terminalType,{variant_key:params.variantKey,status:"ESCALATION_REQUIRED",failure_domain:domain});
          return {ok:true};
        });
        return {status:"ESCALATION_REQUIRED",variant:params.variantKey,failure_domain:domain,preview_preserved:true};
      }

      const heroScoreKeys=["hero_strength","hero_relevance","hero_image_quality","hero_mobile_crop"];
      const heroScores=Object.fromEntries(heroScoreKeys.map(k=>[k,Number(qa.scores?.[k]??0)]));
      const heroIssues=(qa.issues||[]).filter(issue=>{
        const codeTarget=[issue?.code,issue?.target].filter(Boolean).join(" ");
        const message=String(issue?.message||"");
        const explicitHero=/\bhero\b|hero[_ -]|mobile[_ -]?crop|hero[_ -]?image|hero[_ -]?visual/i.test(codeTarget+" "+message);
        const focalCrop=/\b(?:crop|focal|subject)\b/i.test(message) && /\b(?:hero|mobile|image)\b/i.test(message);
        return explicitHero||focalCrop;
      });
      const heroHardIssues=heroIssues.filter(x=>x?.severity==="critical"||x?.severity==="major");
      const heroPass=heroScoreKeys.every(k=>Number(heroScores[k])>=8) && heroHardIssues.length===0;

      await step.do("r"+cycle+"-persist-qa",async()=>{
        await recordQa(sql,{
          packId:params.packId,revisionId:revision.id,type:"VARIANT_VISUAL",status:qa.pass?"PASS":"FAIL",
          scores:qa.scores,issues:qa.issues,actions:qa.actions,
          artifactHashes:{desktop:captured.desktop.sha256,mobile:captured.mobile.sha256},
          modelRouteVersion:MODEL_ROUTE_VERSION,promptVersion:PROMPT_VERSION
        });
        await recordQa(sql,{
          packId:params.packId,revisionId:revision.id,type:"HERO_VISUAL",status:heroPass?"PASS":"FAIL",
          scores:heroScores,issues:heroIssues,actions:qa.actions,
          artifactHashes:{
            desktop:captured.desktop.sha256,
            mobile:captured.mobile.sha256,
            hero_asset_sha256:context.assets.HERO_VISUAL?.sha256||null
          },
          modelRouteVersion:MODEL_ROUTE_VERSION,promptVersion:PROMPT_VERSION,
          idempotencyKey:"qa:HERO_VISUAL:"+params.packId+":"+revision.id
        });
        return {ok:true};
      });

      if(qa.pass && heroPass) {
        await step.do("r"+cycle+"-certify",async()=>{
          await updateRevision(sql,revision.id,{status:"RENDER_READY",score:qa.min_score});
          await setVariantStatus(sql,params.variantId,{status:"RENDER_READY",bestPreview:revision.revision,bestQa:revision.revision,certified:revision.revision});
          await updateWorkflow(sql,event.instanceId,{status:"COMPLETED",currentStep:"RENDER_READY",attempt:cycle});
          await emitParent(this.env,params.parentInstanceId,terminalType,{variant_key:params.variantKey,status:"RENDER_READY",revision:revision.revision,revision_id:revision.id});
          return {ok:true};
        });
        return {status:"RENDER_READY",variant:params.variantKey,revision:revision.revision};
      }

      await updateRevision(sql,revision.id,{status:"QA_FAILED",score:qa.min_score});
      await setVariantStatus(sql,params.variantId,{status:"REWORKING"});
      const visualFailure=await step.do("r"+cycle+"-record-visual-failure",async()=>
        recordTypedFailure(sql,{
          packId:params.packId,workflowInstanceId:event.instanceId,revisionId:revision.id,
          stepName:heroPass?"VISUAL_QUALITY":"HERO_VISUAL_QUALITY",
          error:(heroPass?"VISUAL_QUALITY_BELOW_BAR:":"HERO_VISUAL_BELOW_BAR:")+qa.summary,
          variantKey:params.variantKey,revision:revision.revision,strategyVersion:PROMPT_VERSION
        })
      );

      const bestCandidate=await step.do("r"+cycle+"-load-best-candidate",async()=>{
        const rows=await sql`
          select revision,render_spec,score
          from render_variant_revisions
          where variant_id=${params.variantId}::uuid
            and render_spec is not null
            and score is not null
          order by score desc, revision desc
          limit 1`;
        return rows[0]||null;
      });
      if(bestCandidate?.render_spec && Number(bestCandidate.score||0)>=Number(qa.min_score||0)) {
        previousSpec=bestCandidate.render_spec;
      } else {
        previousSpec=compiled.normalized_spec||generated.spec;
      }
      feedback={
        issues:qa.issues,
        actions:qa.actions,
        summary:qa.summary,
        scores:qa.scores,
        reason:!heroPass?"HERO_VISUAL_REPAIR":(visualFailure.change_strategy?"VISUAL_STRATEGY_SWITCH":"VISUAL_REPAIR"),
        best_candidate_revision:bestCandidate?.revision||revision.revision,
        best_candidate_score:Number(bestCandidate?.score??qa.min_score??0)
      };
    }

    await step.do("terminal-escalation",async()=>{
      if(!previewEmitted) await emitParent(this.env,params.parentInstanceId,previewType,{variant_key:params.variantKey,status:"NO_PREVIEW"});
      await setVariantStatus(sql,params.variantId,{status:"QA_FAILED"});
      await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:"ESCALATION_REQUIRED",errorCode:"VARIANT_MAX_REVISIONS"});
      await emitParent(this.env,params.parentInstanceId,terminalType,{variant_key:params.variantKey,status:"ESCALATION_REQUIRED"});
      return {ok:true};
    });
    return {status:"ESCALATION_REQUIRED",variant:params.variantKey};
  }
}

export class RenderProspectWorkflow extends WorkflowEntrypoint {
  async run(event,step) {
    try {
      return await this.runInternal(event,step);
    } catch(error) {
      const p=event.payload||{};
      const message=String(error?.message||error||"UNHANDLED_PARENT_FAILURE");
      const failure=classifyFailure(error,{step:"PARENT_UNHANDLED"});
      try {
        const sql=db(this.env);
        await persistWorkflow(sql,{
          prospectId:p.prospectId,packId:p.packId,type:"PROSPECT",
          instanceId:event.instanceId,status:"FAILED",
          metadata:{emergency_fail_safe:true,error:message}
        });
        await recordTypedFailure(sql,{
          packId:p.packId,workflowInstanceId:event.instanceId,stepName:"PARENT_UNHANDLED",
          error:message,strategyVersion:EXECUTION_ENGINE_VERSION
        });
        const packStatus=["INPUT_DATA","ASSET"].includes(failure.failure_domain) ? "INPUT_BLOCKED" : "ESCALATION_REQUIRED";
        await setPackStatus(sql,p.packId,packStatus,{fail_safe:true,error:message,failure_domain:failure.failure_domain});
        await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:"FAIL_SAFE_ESCALATION",errorCode:failure.failure_code});
      } catch {}
      return {status:["INPUT_DATA","ASSET"].includes(failure.failure_domain)?"INPUT_BLOCKED":"ESCALATION_REQUIRED",failure_domain:failure.failure_domain,fail_safe:true};
    }
  }

  async runInternal(event,step) {
    const p=event.payload;
    const sql=db(this.env);

    await step.do("register-parent-workflow",async()=>{
      await persistWorkflow(sql,{prospectId:p.prospectId,packId:p.packId,type:"PROSPECT",instanceId:event.instanceId,status:"RUNNING",metadata:{input_pack_id:p.inputPackId}});
      await setPackStatus(sql,p.packId,"PLANNING",{workflow_instance_id:event.instanceId});
      return {ok:true};
    });

    const input=await step.do("load-input-pack",async()=>getInputPack(sql,p.inputPackId));
    if(input.certification_status!=="PASS") {
      await step.do("input-blocked",async()=>{
        await setPackStatus(sql,p.packId,"INPUT_BLOCKED",{issues:input.certification_issues});
        await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:"INPUT_BLOCKED",errorCode:"INPUT_CERTIFICATION_FAILED"});
        return {ok:true};
      });
      return {status:"INPUT_BLOCKED"};
    }

    const assets=await step.do("ingest-input-assets",{retries:{limit:2,delay:"3 seconds",backoff:"exponential"},timeout:"5 minutes"},async()=>{
      await updateWorkflow(sql,event.instanceId,{status:"RUNNING",currentStep:"INPUT_ASSET_INGEST"});
      return ingestInputAssets(this.env,sql,{pack:await getV2Pack(sql,p.packId),inputPack:input});
    });

    const policyAssets=await step.do("load-policy-assets",async()=>inputAssetsFromDb(sql,p.packId,input.payload));
    const assetTokens=Object.entries(policyAssets)
      .filter(([k,v])=>!v.unavailable && k!=="PRIMARY_LOGO")
      .map(([k])=>k);
    const sectionTokens=sectionVisualTokens(policyAssets);
    const r107Active=String(SHOWROOM_RULES_VERSION||"").includes("R107");
    const discoveryState=await step.do("load-first-party-discovery-state",async()=>{
      const rows=await sql`
        select website_url,source_data
        from prospects where id=${p.prospectId}::uuid limit 1`;
      const row=rows[0]||{};
      return {
        website_url:String(row.website_url||row.source_data?.current_site||"").trim(),
        policy:String(row.source_data?.v2_remediation_policy_version||""),
        attempts:Number(row.source_data?.v2_remediation_attempts||0)
      };
    });
    const firstPartyDiscoveryRequired=
      r107Active
      && sectionTokens.length<MIN_SECTION_VISUALS
      && Boolean(discoveryState.website_url)
      && (
        discoveryState.policy!==REMEDIATION_POLICY_VERSION
        || discoveryState.attempts<1
      );
    if(firstPartyDiscoveryRequired) {
      await step.do("first-party-visual-discovery-required",async()=>{
        await setPackStatus(sql,p.packId,"INPUT_BLOCKED",{
          input_remediation_required:true,
          remediation_type:"SECTION_VISUALS",
          remediation_reason:"FIRST_PARTY_DISCOVERY_REQUIRED",
          remediation_policy_version:REMEDIATION_POLICY_VERSION,
          showroom_rules_version:SHOWROOM_RULES_VERSION,
          required_section_visuals:MIN_SECTION_VISUALS,
          available_section_visuals:sectionTokens.length,
          error:"FIRST_PARTY_DISCOVERY_REQUIRED"
        });
        await updateWorkflow(sql,event.instanceId,{
          status:"FAILED",
          currentStep:"INPUT_REMEDIATION",
          errorCode:"FIRST_PARTY_DISCOVERY_REQUIRED",
          metadata:{remediation_policy_version:REMEDIATION_POLICY_VERSION,available_section_visuals:sectionTokens.length}
        });
        return {ok:true};
      });
      return {status:"INPUT_REMEDIATION",reason:"FIRST_PARTY_DISCOVERY_REQUIRED"};
    }
    const graphicFirstR107=
      sectionTokens.length<MIN_SECTION_VISUALS
      && r107Active;
    if(sectionTokens.length<MIN_SECTION_VISUALS && !graphicFirstR107) {
      await step.do("section-visual-remediation-required",async()=>{
        await setPackStatus(sql,p.packId,"INPUT_BLOCKED",{
          input_remediation_required:true,
          remediation_type:"SECTION_VISUALS",
          showroom_rules_version:SHOWROOM_RULES_VERSION,
          required_section_visuals:MIN_SECTION_VISUALS,
          available_section_visuals:sectionTokens.length,
          section_visual_tokens:sectionTokens,
          error:"SECTION_VISUALS_REQUIRED"
        });
        await updateWorkflow(sql,event.instanceId,{
          status:"FAILED",
          currentStep:"INPUT_REMEDIATION",
          errorCode:"SECTION_VISUALS_REQUIRED",
          metadata:{
            showroom_rules_version:SHOWROOM_RULES_VERSION,
            required_section_visuals:MIN_SECTION_VISUALS,
            available_section_visuals:sectionTokens.length
          }
        });
        return {ok:true};
      });
      return {status:"INPUT_REMEDIATION",reason:"SECTION_VISUALS_REQUIRED",required:MIN_SECTION_VISUALS,available:sectionTokens.length};
    }
    await step.do("mark-truth-and-creative-planning",async()=>{
      await updateWorkflow(sql,event.instanceId,{status:"RUNNING",currentStep:"TRUTH_AND_CREATIVE_PLAN",metadata:{showroom_rules_version:SHOWROOM_RULES_VERSION,section_visual_tokens:sectionTokens,graphic_first_r107:graphicFirstR107}});
      return {ok:true};
    });

    const [storedTruth,storedDirections]=await Promise.all([
      step.do("load-content-truth-component",async()=>getContentTruth(sql,p.packId)),
      step.do("load-creative-directions-component",async()=>getDirectionPlan(sql,p.packId))
    ]);

    const deterministicPlanning=!EXTERNAL_AI_CALLS_ALLOWED && String(SHOWROOM_RULES_VERSION||"").includes("R107");

    const truthDraftPromise=storedTruth
      ? Promise.resolve({
          content_truth:storedTruth.payload,
          generator_model:storedTruth.generator_model,
          reviewer_model:storedTruth.reviewer_model,
          verification:storedTruth.verification,
          hash:storedTruth.content_hash,
          reused:true,
          verified:true
        })
      : deterministicPlanning
        ? step.do("content-truth-deterministic",async()=>deterministicR107Truth(input.payload))
        : step.do("content-truth-draft",{retries:{limit:1,delay:"3 seconds",backoff:"exponential"},timeout:"12 minutes"},async()=>{
            return generateContentTruthDraft(this.env,input.payload,{
              beforeModelAttempt:({role,model})=>reserveAiCall(sql,p.packId,this.env,"CONTENT_TRUTH_DRAFT:"+role+":"+model)
            });
          });

    const directionsPromise=storedDirections
      ? Promise.resolve({
          creative_strategy:storedDirections.creative_strategy,
          directions:storedDirections.directions,
          fingerprints:storedDirections.fingerprints,
          diversity_precheck:storedDirections.diversity_precheck,
          model:storedDirections.model,
          hash:storedDirections.content_hash,
          reused:true
        })
      : deterministicPlanning
        ? step.do("creative-directions-deterministic",async()=>deterministicR107Directions(input.payload,assetTokens))
        : step.do("creative-directions",{retries:{limit:1,delay:"3 seconds",backoff:"exponential"},timeout:"12 minutes"},async()=>{
            return createCreativeDirections(this.env,input.payload,assetTokens,{
              beforeModelAttempt:({model})=>reserveAiCall(sql,p.packId,this.env,"CREATIVE_DIRECTIONS:"+model)
            });
          });

    const [truthDraft,directions]=await Promise.all([truthDraftPromise,directionsPromise]);

    let truth=truthDraft;
    if(!storedTruth) {
      if(!deterministicPlanning) {
        const truthReview=await step.do("content-truth-review",{retries:{limit:1,delay:"3 seconds",backoff:"exponential"},timeout:"12 minutes"},async()=>{
          return reviewContentTruthDraft(this.env,input.payload,truthDraft,{
            beforeModelAttempt:({role,model})=>reserveAiCall(sql,p.packId,this.env,"CONTENT_TRUTH_REVIEW:"+role+":"+model)
          });
        });
        truth={
          ...truthDraft,
          ...truthReview,
          content_truth:truthReview.repaired_content_truth||truthDraft.content_truth,
          hash:truthReview.repaired_hash||truthDraft.hash,
          verified:true
        };
      }

      await step.do("persist-content-truth-component",async()=>{
        return persistContentTruth(sql,{
          packId:p.packId,inputPackId:p.inputPackId,result:truth,
          modelRouteVersion:MODEL_ROUTE_VERSION,promptVersion:PROMPT_VERSION
        });
      });
    }

    await step.do("persist-content-truth-qa",async()=>{
      await recordQa(sql,{
        packId:p.packId,type:"CONTENT_TRUTH",status:"PASS",
        scores:{truth_integrity:10},
        issues:truth.verification?.issues||[],
        actions:[],
        artifactHashes:{content_truth_hash:truth.hash},
        modelRouteVersion:MODEL_ROUTE_VERSION,promptVersion:PROMPT_VERSION
      });
      return {ok:true,content_truth_hash:truth.hash};
    });

    if(!storedDirections) {
      await step.do("persist-creative-directions-component",async()=>{
        return persistDirectionPlan(sql,{
          packId:p.packId,inputPackId:p.inputPackId,result:directions,
          modelRouteVersion:MODEL_ROUTE_VERSION,promptVersion:PROMPT_VERSION
        });
      });
    }

    const existingCreative=await step.do("load-existing-creative-plan",async()=>{
      const rows=await sql`select * from render_creative_plans_v2 where render_pack_id=${p.packId}::uuid and status='COMPLETED' limit 1`;
      return rows[0]||null;
    });

    let creative;
    if(existingCreative) {
      if(existingCreative.content_truth_hash!==truth.hash || existingCreative.creative_directions_hash!==directions.hash) {
        throw new Error("SYSTEM_INVARIANT:CREATIVE_PLAN_COMPONENT_HASH_MISMATCH");
      }
      creative={
        plan:{
          content_truth:existingCreative.content_truth_pack,
          creative_strategy:existingCreative.creative_strategy,
          directions:existingCreative.directions,
          fingerprints:existingCreative.fingerprints,
          diversity_precheck:existingCreative.diversity_precheck,
          content_truth_hash:existingCreative.content_truth_hash,
          creative_directions_hash:existingCreative.creative_directions_hash
        },
        hash:existingCreative.content_hash,
        reused:true
      };
    } else {
      creative=await step.do("combine-creative-plan",async()=>combineCreativePlan(truth,directions));
    }

    const persisted=await step.do("persist-plan-and-variants",async()=>{
      const truthEvidence=await sql`
        select count(*)::int as n
        from render_qa_results_v2
        where render_pack_id=${p.packId}::uuid
          and variant_revision_id is null
          and qa_type='CONTENT_TRUTH'
          and status='PASS'`;
      if(Number(truthEvidence[0]?.n||0)<1) throw new Error("SYSTEM_INVARIANT:CONTENT_TRUTH_QA_PASS_REQUIRED");
      await persistCreativePlan(sql,{
        packId:p.packId,inputPackId:p.inputPackId,plan:creative.plan,
        modelRouteVersion:MODEL_ROUTE_VERSION,promptVersion:PROMPT_VERSION,hash:creative.hash
      });
      const variants=await createVariants(sql,p.packId,creative.plan.directions);
      await setPackStatus(sql,p.packId,"PLANNING",{creative_plan_hash:creative.hash,variant_spawn_pending:true});
      return {variants:Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,v.id]))};
    });

    await step.do("spawn-initial-variants",async()=>{
      let {slots,limit,active}=await renderConcurrencyState(sql);
      const launched=[],deferred=[];
      for(const key of VARIANT_KEYS) {
        if(slots<=0) {
          deferred.push(key);
          continue;
        }
        const instanceId="rv2-"+p.packId+"-"+key+"-initial";
        const params={
          prospectId:p.prospectId,packId:p.packId,inputPackId:p.inputPackId,
          variantId:persisted.variants[key],variantKey:key,parentInstanceId:event.instanceId,eventPrefix:"initial"
        };
        await persistWorkflow(sql,{
          prospectId:p.prospectId,packId:p.packId,variantId:persisted.variants[key],type:"VARIANT",
          instanceId,status:"QUEUED",
          metadata:{variant_key:key,event_prefix:"initial",concurrency_limit:limit,concurrency_scheduled:true}
        });
        try { await this.env.RENDER_VARIANT_WORKFLOW.create({id:instanceId,params}); }
        catch { await this.env.RENDER_VARIANT_WORKFLOW.get(instanceId); }
        launched.push(key);
        slots--;
        active++;
      }
      if(launched.length>0) {
        await setPackStatus(sql,p.packId,"GENERATING",{
          variant_spawn_pending:deferred.length>0,
          initial_variants_launched:launched,
          initial_variants_deferred:deferred
        });
      } else {
        await setPackStatus(sql,p.packId,"PLANNING",{
          variant_spawn_pending:true,
          initial_variants_launched:[],
          initial_variants_deferred:deferred,
          deferred_concurrency:true
        });
      }
      return {ok:true,launched,deferred,concurrency_limit:limit,active_after:active};
    });

    const previewEvents={};
    for(const key of VARIANT_KEYS) {
      const state=await step.do("check-preview-state-"+key,async()=>{
        const rows=await sql`
          select v.best_preview_revision,v.status,
                 (select w.status from render_workflows_v2 w
                  where w.variant_id=v.id and w.workflow_type='VARIANT'
                  order by w.created_at desc limit 1) workflow_status
          from render_v2_variants v
          where v.id=${persisted.variants[key]}::uuid limit 1`;
        return rows[0]||{};
      });
      if(state.best_preview_revision) {
        previewEvents[key]={payload:{status:"PREVIEW_READY",revision:state.best_preview_revision,reused:true}};
      } else if(["FAILED","CANCELLED"].includes(state.workflow_status)) {
        previewEvents[key]={payload:{status:"NO_PREVIEW",reused:true}};
      } else {
        previewEvents[key]=await step.waitForEvent("wait-preview-"+key,{type:"preview-"+key+"-initial",timeout:"3 hours"});
      }
    }
    const allPreview=Object.values(previewEvents).every(e=>e.payload?.status==="PREVIEW_READY");
    if(allPreview) await step.do("mark-preview-ready",async()=>setPackStatus(sql,p.packId,"PREVIEW_READY"));

    const terminal={};
    for(const key of VARIANT_KEYS) {
      const state=await step.do("check-terminal-state-"+key,async()=>{
        const rows=await sql`
          select v.status,v.certified_revision,
                 (select w.status from render_workflows_v2 w
                  where w.variant_id=v.id and w.workflow_type='VARIANT'
                  order by w.created_at desc limit 1) workflow_status
          from render_v2_variants v
          where v.id=${persisted.variants[key]}::uuid limit 1`;
        return rows[0]||{};
      });
      if(state.status==="RENDER_READY" && state.certified_revision) {
        terminal[key]={payload:{status:"RENDER_READY",revision:state.certified_revision,reused:true}};
      } else if(["FAILED","CANCELLED"].includes(state.workflow_status)) {
        terminal[key]={payload:{status:"ESCALATION_REQUIRED",reused:true}};
      } else {
        terminal[key]=await step.waitForEvent("wait-terminal-"+key,{type:"terminal-"+key+"-initial",timeout:"6 hours"});
      }
    }
    if(!Object.values(terminal).every(e=>e.payload?.status==="RENDER_READY")) {
      await step.do("variant-escalation",async()=>{
        await setPackStatus(sql,p.packId,"ESCALATION_REQUIRED",{terminal});
        await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:"VARIANT_ESCALATION",errorCode:"VARIANT_NOT_READY"});
        return {ok:true};
      });
      return {status:"ESCALATION_REQUIRED",terminal};
    }

    const cabinaHoldBeforeSetQa=await step.do("cabina-finalization-hold-check",async()=>{
      const rows=await sql`
        select coalesce((metadata->>'cabina_visual_review_hold')::boolean,false) as hold
        from render_v2_packs where id=${p.packId}::uuid limit 1`;
      return rows[0]?.hold===true;
    });
    if(cabinaHoldBeforeSetQa) {
      await step.do("cabina-finalization-hold",async()=>{
        await setPackStatus(sql,p.packId,"PREVIEW_READY",{cabina_visual_review_hold:true,master_auto_approve:false});
        await updateWorkflow(sql,event.instanceId,{status:"COMPLETED",currentStep:"CABINA_VISUAL_REVIEW_HOLD",errorCode:null});
        return {ok:true};
      });
      return {status:"CABINA_VISUAL_REVIEW_HOLD"};
    }

    for(let setCycle=1;setCycle<=3;setCycle++) {
      await step.do("set-"+setCycle+"-mark-qa",async()=>setPackStatus(sql,p.packId,"QA_RUNNING",{set_cycle:setCycle}));
      const frames=await step.do("set-"+setCycle+"-load-frames",async()=>{
        const out={};
        for(const key of VARIANT_KEYS) {
          const variantId=persisted.variants[key];
          const rev=await latestCertifiedRevision(sql,variantId);
          if(!rev) throw new Error("SYSTEM_INVARIANT:CERTIFIED_REVISION_MISSING:"+key);
          const qaArtifacts=await sql`
            select artifact_type,r2_key
            from render_artifacts_v2
            where variant_revision_id=${rev.id}::uuid
              and artifact_type in ('QA_DESKTOP','QA_MOBILE','BROWSER_DIAGNOSTICS')`;
          const qaByType=Object.fromEntries(qaArtifacts.map(x=>[x.artifact_type,x.r2_key]));
          const d=await readArtifactBytes(this.env,qaByType.QA_DESKTOP||rev.desktop_r2_key);
          const m=await readArtifactBytes(this.env,qaByType.QA_MOBILE||rev.mobile_r2_key);
          let browserEvidence={};
          if(qaByType.BROWSER_DIAGNOSTICS) {
            const diagBytes=await readArtifactBytes(this.env,qaByType.BROWSER_DIAGNOSTICS);
            const diag=JSON.parse(new TextDecoder().decode(diagBytes));
            browserEvidence={
              deterministic_gate_pass:diag.gate?.pass===true,
              deterministic_gate_issues:diag.gate?.issues||[],
              desktop:diag.diagnostics?.desktop||{},
              mobile:diag.diagnostics?.mobile||{},
              official_identity_visible:
                (diag.diagnostics?.desktop?.official_logo_present??false)
                && (diag.diagnostics?.mobile?.official_logo_present??false)
            };
          }
          out[key]={desktop:bytesToBase64(d),mobile:bytesToBase64(m),revision_id:rev.id,browser_evidence:browserEvidence,render_spec:rev.render_spec||{}};
        }
        return out;
      });
      const structuralQa=await step.do("set-"+setCycle+"-structural-divergence",async()=>{
        return analyzeStructuralDivergence({
          A:frames.A.render_spec,
          B:frames.B.render_spec,
          C:frames.C.render_spec
        });
      });
      await step.do("set-"+setCycle+"-persist-structural-divergence",async()=>{
        await recordQa(sql,{
          packId:p.packId,type:"STRUCTURAL_DIVERGENCE",status:structuralQa.pass?"PASS":"FAIL",
          scores:structuralQa.scores,issues:structuralQa.issues,actions:structuralQa.actions,
          artifactHashes:{
            A_revision_id:frames.A.revision_id,
            B_revision_id:frames.B.revision_id,
            C_revision_id:frames.C.revision_id
          },
          modelRouteVersion:MODEL_ROUTE_VERSION,promptVersion:PROMPT_VERSION,
          idempotencyKey:"qa:STRUCTURAL_DIVERGENCE:"+p.packId+":"+frames.A.revision_id+":"+frames.B.revision_id+":"+frames.C.revision_id+":"+event.instanceId+":cycle"+setCycle
        });
        return {ok:true};
      });
      const visualSetQa=await step.do("set-"+setCycle+"-qa",{timeout:"10 minutes"},async()=>{
        return runSetQa(this.env,{
          inputPayload:input.payload,frames,
          beforeModelAttempt:({model})=>reserveAiCall(sql,p.packId,this.env,"SET_VISUAL_QA:"+model)
        });
      });
      const setQa={
        ...visualSetQa,
        pass:visualSetQa.pass===true && structuralQa.pass===true,
        weakest_variant:structuralQa.pass ? visualSetQa.weakest_variant : structuralQa.weakest_variant,
        issues:[...(visualSetQa.issues||[]),...(structuralQa.issues||[])],
        actions:[...(visualSetQa.actions||[]),...(structuralQa.actions||[])],
        structural_divergence:structuralQa
      };
      await step.do("set-"+setCycle+"-persist-qa",async()=>{
        await recordQa(sql,{
          packId:p.packId,type:"SET_VISUAL",status:setQa.pass?"PASS":"FAIL",
          scores:{...setQa.scores,...structuralQa.scores},issues:setQa.issues,actions:setQa.actions,
          artifactHashes:{
            A_revision_id:frames.A.revision_id,
            B_revision_id:frames.B.revision_id,
            C_revision_id:frames.C.revision_id
          },
          modelRouteVersion:MODEL_ROUTE_VERSION,promptVersion:PROMPT_VERSION,
          idempotencyKey:"qa:SET_VISUAL:"+p.packId+":"+frames.A.revision_id+":"+frames.B.revision_id+":"+frames.C.revision_id+":"+event.instanceId+":cycle"+setCycle
        });
        return {ok:true};
      });
      if(setQa.pass) {
        const cabinaHoldBeforeCertify=await step.do("set-"+setCycle+"-cabina-hold-before-certify",async()=>{
          const rows=await sql`
            select coalesce((metadata->>'cabina_visual_review_hold')::boolean,false) as hold
            from render_v2_packs where id=${p.packId}::uuid limit 1`;
          return rows[0]?.hold===true;
        });
        if(cabinaHoldBeforeCertify) {
          await step.do("set-"+setCycle+"-cabina-certification-hold",async()=>{
            await setPackStatus(sql,p.packId,"PREVIEW_READY",{cabina_visual_review_hold:true,master_auto_approve:false});
            await updateWorkflow(sql,event.instanceId,{status:"COMPLETED",currentStep:"CABINA_VISUAL_REVIEW_HOLD",errorCode:null});
            return {ok:true};
          });
          return {status:"CABINA_VISUAL_REVIEW_HOLD"};
        }
        const heroGate=await step.do("set-"+setCycle+"-hero-gate",async()=>{
          const rows=await sql`
            select count(distinct q.variant_revision_id)::int as passed
            from render_qa_results_v2 q
            where q.render_pack_id=${p.packId}::uuid
              and q.qa_type='HERO_VISUAL'
              and q.status='PASS'
              and q.variant_revision_id in (
                select r.id
                from render_v2_variants v
                join render_variant_revisions r on r.variant_id=v.id and r.revision=v.certified_revision
                where v.render_pack_id=${p.packId}::uuid
                  and v.status='RENDER_READY'
                  and r.status='RENDER_READY'
              )`;
          return {passed:Number(rows[0]?.passed||0)};
        });
        if(heroGate.passed!==3) {
          await step.do("set-"+setCycle+"-hero-escalation",async()=>{
            await setPackStatus(sql,p.packId,"ESCALATION_REQUIRED",{hero_visual_qa_passed:heroGate.passed,hero_gate_required:3});
            await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:"HERO_QA_ESCALATION",errorCode:"THREE_HERO_VISUAL_PASSES_REQUIRED"});
            return {ok:true};
          });
          return {status:"ESCALATION_REQUIRED",hero_visual_qa_passed:heroGate.passed};
        }
        await step.do("certify-pack",async()=>{
          const certified=await sql`
            with current_revs as (
              select
                count(*)::int as variant_count,
                bool_and(
                  v.status='RENDER_READY'
                  and r.status='RENDER_READY'
                  and r.compiler_version=${COMPILER_VERSION}
                ) as contract_ok,
                max(r.id::text) filter (where v.variant_key='A') as a_revision_id,
                max(r.id::text) filter (where v.variant_key='B') as b_revision_id,
                max(r.id::text) filter (where v.variant_key='C') as c_revision_id
              from render_v2_variants v
              join render_variant_revisions r
                on r.variant_id=v.id and r.revision=v.certified_revision
              where v.render_pack_id=${p.packId}::uuid
            ),
            current_set as (
              select q.*
              from render_qa_results_v2 q
              cross join current_revs c
              where q.render_pack_id=${p.packId}::uuid
                and q.qa_type='SET_VISUAL'
                and q.artifact_hashes->>'A_revision_id'=c.a_revision_id
                and q.artifact_hashes->>'B_revision_id'=c.b_revision_id
                and q.artifact_hashes->>'C_revision_id'=c.c_revision_id
              order by q.created_at desc
              limit 1
            ),
            structural_gate as (
              select q.*
              from render_qa_results_v2 q
              cross join current_revs c
              where q.render_pack_id=${p.packId}::uuid
                and q.qa_type='STRUCTURAL_DIVERGENCE'
                and q.artifact_hashes->>'A_revision_id'=c.a_revision_id
                and q.artifact_hashes->>'B_revision_id'=c.b_revision_id
                and q.artifact_hashes->>'C_revision_id'=c.c_revision_id
              order by q.created_at desc
              limit 1
            ),
                        hero_gate as (
              select count(distinct q.variant_revision_id)::int as passed
              from render_qa_results_v2 q
              cross join current_revs c
              where q.render_pack_id=${p.packId}::uuid
                and q.qa_type='HERO_VISUAL'
                and q.status='PASS'
                and q.variant_revision_id::text in (c.a_revision_id,c.b_revision_id,c.c_revision_id)
                and coalesce((q.scores->>'hero_strength')::numeric,0)>=8
                and coalesce((q.scores->>'hero_relevance')::numeric,0)>=8
                and coalesce((q.scores->>'hero_image_quality')::numeric,0)>=8
                and coalesce((q.scores->>'hero_mobile_crop')::numeric,0)>=8
            ),
            variant_gate as (
              select count(distinct q.variant_revision_id)::int as passed
              from render_qa_results_v2 q
              cross join current_revs c
              where q.render_pack_id=${p.packId}::uuid
                and q.qa_type='VARIANT_VISUAL'
                and q.status='PASS'
                and q.variant_revision_id::text in (c.a_revision_id,c.b_revision_id,c.c_revision_id)
                and coalesce((q.scores->>'header_quality')::numeric,0)>=8
                and coalesce((q.scores->>'navigation_quality')::numeric,0)>=8
                and coalesce((q.scores->>'page_architecture')::numeric,0)>=8
                and coalesce((q.scores->>'section_quality')::numeric,0)>=8
                and coalesce((q.scores->>'final_cta_quality')::numeric,0)>=8
                and coalesce((q.scores->>'footer_quality')::numeric,0)>=8
                and coalesce((q.scores->>'desktop_quality')::numeric,0)>=8
                and coalesce((q.scores->>'mobile_quality')::numeric,0)>=8
            )
            update render_v2_packs rp
            set status='RENDER_READY',
                metadata=(coalesce(rp.metadata,'{}'::jsonb)-'set_qa')
                  || jsonb_build_object(
                    'set_qa',jsonb_build_object(
                      'pass',true,
                      'qa_id',(select id::text from current_set),
                      'scores',(select scores from current_set),
                      'issues',(select issues from current_set),
                      'actions',(select actions from current_set),
                      'artifact_hashes',(select artifact_hashes from current_set),
                      'created_at',(select created_at from current_set)
                    ),
                    'set_qa_cycle',${setCycle}::int,
                    'hero_visual_qa_passed',3,
                    'variant_visual_qa_passed',${MINIMUM_VARIANTS_PER_PACK}::int,
                    'triple_variant_required',${TRIPLE_VARIANT_REQUIRED},
                    'minimum_variants_per_pack',${MINIMUM_VARIANTS_PER_PACK}::int,
                    'variant_divergence_required',${VARIANT_DIVERGENCE_REQUIRED},
                    'variant_divergence_floor',${VARIANT_DIVERGENCE_FLOOR}::numeric,
                    'structural_divergence_required',${STRUCTURAL_DIVERGENCE_REQUIRED},
                    'structural_dom_similarity_ceiling',${STRUCTURAL_DOM_SIMILARITY_CEILING}::numeric,
                    'structural_hero_similarity_ceiling',${STRUCTURAL_HERO_SIMILARITY_CEILING}::numeric,
                    'structural_section_position_similarity_ceiling',${STRUCTURAL_SECTION_POSITION_SIMILARITY_CEILING}::numeric,
                    'structural_distinct_section_order_required',${STRUCTURAL_DISTINCT_SECTION_ORDER_REQUIRED},
                    'structural_divergence',(select jsonb_build_object('status',status,'scores',scores,'issues',issues,'actions',actions) from structural_gate),
                    'variant_creative_roles',${JSON.stringify(VARIANT_CREATIVE_ROLES)}::jsonb,
                    'winner_auto_select',${AUTO_SELECT_VARIANT_WINNER},
                    'winner_variant',${setQa.winner_variant||"A"},
                    'master_auto_approve',${MASTER_AUTO_APPROVE},
                    'master_reference_status','AWAITING_CABINA_VISUAL_APPROVAL',
                    'final_gate_atomic',true,
                    'final_gate_verified_at',to_jsonb(now())
                  ),
                render_ready_at=coalesce(rp.render_ready_at,now()),
                updated_at=now()
            where rp.id=${p.packId}::uuid
              and (select variant_count=${MINIMUM_VARIANTS_PER_PACK} and contract_ok=true from current_revs)
              and (select passed from hero_gate)=${MINIMUM_VARIANTS_PER_PACK}
              and (select passed from variant_gate)=${MINIMUM_VARIANTS_PER_PACK}
              and (select status from current_set)='PASS'
              and (select status from structural_gate)='PASS'
              and coalesce((select (scores->>'structural_divergence_ab')::numeric from structural_gate),0)>0
              and coalesce((select (scores->>'structural_divergence_ac')::numeric from structural_gate),0)>0
              and coalesce((select (scores->>'structural_divergence_bc')::numeric from structural_gate),0)>0
              and coalesce((select (scores->>'set_quality')::numeric from current_set),0)>=8
              and coalesce((select (scores->>'diversity_ab')::numeric from current_set),0)>=${VARIANT_DIVERGENCE_FLOOR}
              and coalesce((select (scores->>'diversity_ac')::numeric from current_set),0)>=${VARIANT_DIVERGENCE_FLOOR}
              and coalesce((select (scores->>'diversity_bc')::numeric from current_set),0)>=${VARIANT_DIVERGENCE_FLOOR}
              and coalesce((select (scores->>'prospect_fit_a')::numeric from current_set),0)>=8
              and coalesce((select (scores->>'prospect_fit_b')::numeric from current_set),0)>=8
              and coalesce((select (scores->>'prospect_fit_c')::numeric from current_set),0)>=8
            returning rp.id,rp.status,rp.metadata`;
          if(!certified.length) throw new Error("SYSTEM_INVARIANT:ATOMIC_CURRENT_SET_GATE_FAILED");
          await sql`
            update prospects
            set render_status='RENDER_READY',
                current_step='CABINA_RENDER_REVIEW',
                error=null,
                next_action='CABINA_RENDER_SELECTION',
                updated_at=now()
            where id=${p.prospectId}::uuid
              and pipeline_status='RENDERING'`;
          await updateWorkflow(sql,event.instanceId,{status:"COMPLETED",currentStep:"RENDER_READY",metadata:{final_gate_atomic:true}});
          return {ok:true,atomic_gate:true};
        });
        return {status:"RENDER_READY",pack_id:p.packId,hero_visual_qa_passed:3};
      }

      const weakest=setQa.weakest_variant;
      if(!["A","B","C"].includes(weakest) || setCycle===3) {
        await step.do("set-escalation",async()=>{
          await setPackStatus(sql,p.packId,"ESCALATION_REQUIRED",{set_qa:setQa});
          await updateWorkflow(sql,event.instanceId,{status:"FAILED",currentStep:"SET_QA_ESCALATION",errorCode:"SET_DIVERSITY_FAILED"});
          return {ok:true};
        });
        return {status:"ESCALATION_REQUIRED",set_qa:setQa};
      }

      const variantId=persisted.variants[weakest];
      const prior=await step.do("set-"+setCycle+"-prior-"+weakest,async()=>latestCertifiedRevision(sql,variantId));
      const prefix="set"+setCycle;
      await waitForVariantSlot(step,sql,"set-"+setCycle+"-"+weakest,{maxChecks:60,delay:"30 seconds"});
      await step.do("set-"+setCycle+"-spawn-"+weakest,async()=>{
        const instanceId="rv2-"+p.packId+"-"+weakest+"-"+prefix;
        const params={
          prospectId:p.prospectId,packId:p.packId,inputPackId:p.inputPackId,variantId,variantKey:weakest,
          parentInstanceId:event.instanceId,eventPrefix:prefix,parentRevisionId:prior?.id||null,
          initialFeedback:{issues:setQa.issues,actions:setQa.actions,summary:setQa.summary,reason:"SET_DIVERSITY"}
        };
        await persistWorkflow(sql,{prospectId:p.prospectId,packId:p.packId,variantId,type:"VARIANT",instanceId,status:"QUEUED",metadata:{variant_key:weakest,event_prefix:prefix,set_cycle:setCycle}});
        try { await this.env.RENDER_VARIANT_WORKFLOW.create({id:instanceId,params}); }
        catch { await this.env.RENDER_VARIANT_WORKFLOW.get(instanceId); }
        return {instanceId};
      });
      const replacement=await step.waitForEvent("set-"+setCycle+"-wait-"+weakest,{type:"terminal-"+weakest+"-"+prefix,timeout:"6 hours"});
      if(replacement.payload?.status!=="RENDER_READY") {
        await step.do("set-"+setCycle+"-replacement-escalation",async()=>setPackStatus(sql,p.packId,"ESCALATION_REQUIRED",{replacement}));
        return {status:"ESCALATION_REQUIRED",replacement};
      }
    }

    return {status:"ESCALATION_REQUIRED"};
  }
}


export class RenderChaosProbeWorkflow extends WorkflowEntrypoint {
  async run(event,step) {
    const sql=db(this.env);
    const probeKey=String(event.payload?.probeKey||"render-v2-live-recovery-v1");
    await step.do("chaos-register",async()=>{
      await sql`
        insert into render_v2_chaos_probes(probe_key,workflow_instance_id,status,details)
        values(${probeKey},${event.instanceId},'RUNNING',${JSON.stringify({workflow_started:true})}::jsonb)
        on conflict(probe_key) do update set
          workflow_instance_id=excluded.workflow_instance_id,
          status='RUNNING',
          updated_at=now(),
          details=render_v2_chaos_probes.details||excluded.details`;
      return {ok:true};
    });

    await step.do("chaos-idempotent-side-effect",async()=>{
      await sql`
        update render_v2_chaos_probes
        set side_effect_count=case when effect_applied then side_effect_count else side_effect_count+1 end,
            effect_applied=true,
            updated_at=now()
        where probe_key=${probeKey}`;
      return {ok:true};
    });

    await step.do("chaos-transient-recovery",{retries:{limit:2,delay:"2 seconds",backoff:"constant"}},async()=>{
      const rows=await sql`
        update render_v2_chaos_probes
        set transient_attempts=transient_attempts+1,
            transient_seen=true,
            updated_at=now()
        where probe_key=${probeKey}
        returning transient_attempts`;
      if(Number(rows[0]?.transient_attempts||0)===1) {
        throw new Error("CHAOS_TRANSIENT_EXPECTED");
      }
      return {attempts:Number(rows[0]?.transient_attempts||0)};
    });

    await step.do("chaos-complete",async()=>{
      await sql`
        update render_v2_chaos_probes
        set status='PASS',completed=true,updated_at=now(),
            details=details||${JSON.stringify({recovery_verified:true,idempotency_verified:true})}::jsonb
        where probe_key=${probeKey}`;
      return {ok:true};
    });
    return {status:"PASS",probe_key:probeKey};
  }
}


export class RenderInputRemediationWorkflow extends WorkflowEntrypoint {
  async run(event,step) {
    const params=event.payload||{};
    const sql=db(this.env);
    await step.do("register-input-remediation",{retries:{limit:2,delay:"2 seconds",backoff:"exponential"}},async()=>{
      await persistWorkflow(sql,{
        prospectId:params.prospectId,
        packId:params.packId,
        type:"INPUT_REMEDIATION",
        instanceId:event.instanceId,
        status:"RUNNING",
        metadata:{remediation_attempt:params.attempt||1}
      });
      return {ok:true};
    });

    try {
      const result=await step.do("remediate-input",{retries:{limit:1,delay:"5 seconds",backoff:"exponential"},timeout:"12 minutes"},async()=>{
        return remediateBlockedPack(this.env,{prospectId:params.prospectId,packId:params.packId});
      });
      await step.do("complete-input-remediation",async()=>{
        await updateWorkflow(sql,event.instanceId,{
          status:"COMPLETED",
          currentStep:result.status==="INPUT_READY"?"INPUT_READY":"INPUT_BLOCKED",
          metadata:{result}
        });
        return {ok:true};
      });
      return result;
    } catch(error) {
      const message=String(error?.message||error||"INPUT_REMEDIATION_FAILED");
      await step.do("fail-input-remediation",async()=>{
        await updateWorkflow(sql,event.instanceId,{
          status:"FAILED",
          currentStep:"INPUT_REMEDIATION_FAILED",
          errorCode:"INPUT_REMEDIATION_FAILED",
          metadata:{error:message}
        });
        return {ok:true};
      });
      return {status:"INPUT_BLOCKED",error:message};
    }
  }
}
