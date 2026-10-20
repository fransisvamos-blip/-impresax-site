import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const reconcile=fs.readFileSync(new URL("../src/render-v2/reconcile.js",import.meta.url),"utf8");
const workflows=fs.readFileSync(new URL("../src/render-v2/workflows.js",import.meta.url),"utf8");
const hero=fs.readFileSync(new URL("../src/render-v2/hero.js",import.meta.url),"utf8");
const ai=fs.readFileSync(new URL("../src/render-v2/ai.js",import.meta.url),"utf8");
const inputPack=fs.readFileSync(new URL("../src/render-v2/input-pack.js",import.meta.url),"utf8");
const rollout=fs.readFileSync(new URL("../src/render-v2/rollout.js",import.meta.url),"utf8");
const remediation=fs.readFileSync(new URL("../src/render-v2/remediation.js",import.meta.url),"utf8");
const concurrency=fs.readFileSync(new URL("../src/render-v2/concurrency.js",import.meta.url),"utf8");
const grammar=fs.readFileSync(new URL("../src/render-v2/design-grammar.js",import.meta.url),"utf8");
const constants=fs.readFileSync(new URL("../src/render-v2/constants.js",import.meta.url),"utf8");
const failurePolicy=fs.readFileSync(new URL("../src/render-v2/failure-policy.js",import.meta.url),"utf8");
const health=fs.readFileSync(new URL("../src/render-v2/health.js",import.meta.url),"utf8");
const index=fs.readFileSync(new URL("../src/render-v2/index.js",import.meta.url),"utf8");
const browser=fs.readFileSync(new URL("../src/render-v2/browser.js",import.meta.url),"utf8");
const compiler=fs.readFileSync(new URL("../src/render-v2/compiler.js",import.meta.url),"utf8");
const showroom=fs.readFileSync(new URL("../src/render-v2/showroom-policy.js",import.meta.url),"utf8");
const r115Shell=fs.readFileSync(new URL("../src/render-v2/r115-shell-css.js",import.meta.url),"utf8");
const r115Sections=fs.readFileSync(new URL("../src/render-v2/r115-sections-css.js",import.meta.url),"utf8");
const r116Flagship=fs.readFileSync(new URL("../src/render-v2/r116-flagship-css.js",import.meta.url),"utf8");

test("exhausted GENERATING packs are eligible for immediate ghost closure",()=>{
  assert.match(
    reconcile,
    /coalesce\(\(p\.metadata->>'auto_recovery_attempt'\)::int,0\)>=3\s+or p\.updated_at < now\(\)-interval '10 minutes'/
  );
  assert.match(reconcile,/ghost_generating_closed:true/);
  assert.match(reconcile,/recovery_exhausted:exhausted/);
});

test("generic auto recovery cannot requeue exhausted packs",()=>{
  assert.match(
    reconcile,
    /p\.status='ESCALATION_REQUIRED'[\s\S]{0,300}auto_recovery_attempt'\)::int,0\)<3/
  );
  const start=reconcile.indexOf("async function recoverEscalatedQueuePack");
  const end=reconcile.indexOf("export async function startOrRecoverParent",start);
  assert.ok(start>=0 && end>start);
  const recovery=reconcile.slice(start,end);
  assert.match(recovery,/if\(priorAttempts>=3\)/);
  assert.match(recovery,/if\(!reuseWave && priorAttempts>=3\)/);
  assert.match(recovery,/reason:"AUTO_RECOVERY_LIMIT",slots_used:0/);
});

test("queue recovery never marks a pack GENERATING when no workflow launched",()=>{
  const start=reconcile.indexOf("async function recoverEscalatedQueuePack");
  const end=reconcile.indexOf("export async function startOrRecoverParent",start);
  assert.ok(start>=0 && end>start);
  const recovery=reconcile.slice(start,end);
  const guard=recovery.indexOf("if(launched.length===0)");
  const mark=recovery.indexOf('await setPackStatus(sql,pack.id,"GENERATING",{',guard);
  assert.ok(guard>=0,"zero-launch guard missing");
  assert.ok(mark>guard,"GENERATING transition must occur after zero-launch guard");
});

test("initial child workflow id is unique per parent run",()=>{
  assert.match(workflows,/parentRunSuffix=String\(event\.instanceId\|\|"parent"\)/);
  assert.match(workflows,/const instanceId="rv2-"\+p\.packId\+"-"\+key\+"-"\+parentRunSuffix/);
  assert.doesNotMatch(workflows,/const instanceId="rv2-"\+p\.packId\+"-"\+key\+"-initial"/);
});

test("generated hero artifact keys are content-addressed",()=>{
  assert.match(workflows,/const imageHash=await sha256\(generated\.bytes\)/);
  assert.match(workflows,/imageHash\.slice\(0,16\)/);
  assert.match(workflows,/const metaHash=await sha256\(metaBytes\)/);
  assert.match(workflows,/metaHash\.slice\(0,16\)/);
});

test("hero retries use attempt-specific deterministic seeds",()=>{
  assert.match(workflows,/generationAttempt:attempt/);
  assert.match(workflows,/generationCycle:cycle/);
  assert.match(hero,/const deterministicSeed=Math\.abs\(/);
  assert.match(hero,/\(attempt\*7919\)/);
  assert.match(hero,/form\.append\("seed",String\(deterministicSeed\)\)/);
});

test("general contractors have an infrastructure-specific hero grammar",()=>{
  assert.match(hero,/function isGeneralContractorInfrastructureContext/);
  assert.match(hero,/civil, industrial, hospital\/institutional construction/);
  assert.match(hero,/Absolutely no luxury residential interior/);
});

test("remediated contacts require verified provenance",()=>{
  assert.match(inputPack,/VERIFIED_CONTACT_PROVENANCE_REQUIRED/);
  assert.match(inputPack,/V2_FIRST_PARTY_VERIFIED/);
  assert.match(inputPack,/contact_verification_evidence/);
});

test("manual launch surfaces respect the generation circuit breaker",()=>{
  const circuitChecks=(index.match(/GENERATION_CIRCUIT_BREAKER/g)||[]).length;
  assert.ok(circuitChecks>=3,"start, targeted relaunch and whole-pack relaunch must all gate on circuit state");
  assert.match(index,/const circuitState=await prospectCircuitState\(sql,pack\.prospect_id\)/);
  assert.match(index,/const contractCircuit=await prospectCircuitState\(sql,pack\.prospect_id\)/);
  assert.match(index,/const startCircuit=await prospectCircuitState\(sql,created\.pack\.prospect_id\)/);
});

test("targeted circuit override is consumed only after workflow creation",()=>{
  const createAt=index.indexOf("instance=await env.RENDER_VARIANT_WORKFLOW.create({id:instanceId,params})");
  const consumeAt=index.indexOf('consumePackCircuitOverride(sql,packId,"TARGETED_RELAUNCH:"+runKey)');
  assert.ok(createAt>=0 && consumeAt>createAt,"override must be consumed after successful workflow creation");
  assert.match(index,/WORKFLOW_CREATE_FAILED/);
  assert.match(index,/CIRCUIT_OVERRIDE_CONSUME_FAILED/);
});

test("obsolete escalations are rebuilt instead of recycled",()=>{
  assert.match(inputPack,/superseded_by_contract_upgrade/);
  assert.match(inputPack,/superseded_to_quality_contract/);
  assert.match(inputPack,/status='SUPERSEDED'/);
  assert.match(inputPack,/status in \('QUEUED','RUNNING','PAUSED'\)/);
});

test("queue admits obsolete escalation packs for Premium V3 migration",()=>{
  assert.match(rollout,/rp\.status='ESCALATION_REQUIRED'/);
  assert.match(rollout,/QUALITY_CONTRACT_VERSION/);
  assert.match(rollout,/EXECUTION_ENGINE_VERSION/);
});

test("generic page imagery issues do not trigger hero repair",()=>{
  assert.match(workflows,/const explicitHero=/);
  assert.match(workflows,/const focalCrop=/);
  assert.doesNotMatch(workflows,/\/hero\|imagery\|image\|crop\|focal\|generic\|stock\|synthetic\|ai\[- \]\?feel\//);
});

test("structured AI calls have bounded per-attempt deadlines",()=>{
  assert.match(ai,/function withAiDeadline/);
  assert.match(ai,/AI_PROVIDER_CALL_TIMEOUT/);
  assert.match(ai,/V2_AI_CALL_TIMEOUT_MS/);
  assert.match(ai,/105000/);
});

test("queue finalizes current certified sets while active",()=>{
  assert.match(rollout,/finalizersStarted/);
  assert.match(rollout,/maybeStartFinalizer\(env,sql,pack,gate\)/);
  assert.match(rollout,/q\.artifact_hashes->>'A_revision_id'/);
  assert.match(rollout,/q\.artifact_hashes->>'B_revision_id'/);
  assert.match(rollout,/q\.artifact_hashes->>'C_revision_id'/);
  assert.match(rollout,/p\.quality_contract_version=\$\{QUALITY_CONTRACT_VERSION\}/);
  assert.match(rollout,/p\.execution_engine_version=\$\{EXECUTION_ENGINE_VERSION\}/);
});

test("remediation budget is scoped to the current policy version",()=>{
  assert.match(constants,/REMEDIATION_POLICY_VERSION/);
  assert.match(remediation,/sameRemediationPolicy/);
  assert.match(remediation,/v2_remediation_policy_version:REMEDIATION_POLICY_VERSION/);
  assert.match(rollout,/v2_remediation_policy_version/);
  assert.match(rollout,/remediationPolicyTag/);
  assert.match(rollout,/remediation_policy_version:REMEDIATION_POLICY_VERSION/);
});

test("fully deferred initial packs stay PLANNING until a variant starts",()=>{
  assert.match(workflows,/variant_spawn_pending:true/);
  assert.match(workflows,/deferred_concurrency:true/);
  assert.match(workflows,/setPackStatus\(sql,p\.packId,"PLANNING"/);
  assert.match(concurrency,/p\.status in \('PLANNING','GENERATING'/);
  assert.match(reconcile,/INITIAL_VARIANTS_DEFERRED_CONCURRENCY/);
  assert.match(reconcile,/deferred_concurrency_released_at/);
});

test("unverified content refs sanitize to deterministic verified fallback",()=>{
  assert.match(ai,/source_sanitized:true/);
  assert.match(ai,/source_gate_issues:sourceGate\.issues/);
  assert.match(ai,/buildVerifiedFallbackTruth\(inputPayload\)/);
  assert.doesNotMatch(ai,/if\(!sourceGate\.pass\) throw new Error\("CONTENT_TRUTH_SOURCE_INVALID/);
});

test("RENDER_READY is atomically bound to the exact current certified QA set",()=>{
  assert.match(workflows,/ATOMIC_CURRENT_SET_GATE_FAILED/);
  assert.match(workflows,/q\.artifact_hashes->>'A_revision_id'=c\.a_revision_id/);
  assert.match(workflows,/q\.artifact_hashes->>'B_revision_id'=c\.b_revision_id/);
  assert.match(workflows,/q\.artifact_hashes->>'C_revision_id'=c\.c_revision_id/);
  assert.match(workflows,/variant_visual_qa_passed'/);
  assert.match(workflows,/MINIMUM_VARIANTS_PER_PACK/);
  assert.match(workflows,/final_gate_atomic',true/);
  assert.match(workflows,/scores->>'set_quality'/);
  assert.match(workflows,/r\.compiler_version=\$\{COMPILER_VERSION\}/);
});

test("SET QA cache self-heals from authoritative current-set rows",()=>{
  assert.match(reconcile,/syncCurrentSetQaCaches/);
  assert.match(reconcile,/q\.artifact_hashes->>'A_revision_id'=c\.a_revision_id/);
  assert.match(reconcile,/q\.artifact_hashes->>'B_revision_id'=c\.b_revision_id/);
  assert.match(reconcile,/q\.artifact_hashes->>'C_revision_id'=c\.c_revision_id/);
  assert.match(reconcile,/set_qa_cache_reconciled/);
  assert.match(reconcile,/summary\.set_qa_cache_sync/);
});

test("zero-photo Premium V3 provider failures use deterministic failover",()=>{
  assert.match(workflows,/const providerFailoverDomain=/);
  assert.match(workflows,/context\.heroOnly \|\| deterministicRecovery/);
  assert.match(workflows,/provider_failover:true/);
  assert.match(workflows,/buildZeroPhotoPremiumSpec/);
});

test("terminal provider escalation closes variant state",()=>{
  assert.match(workflows,/setVariantStatus\(sql,params\.variantId,\{status:"ESCALATION_REQUIRED"\}\)/);
  assert.match(workflows,/AI_PROVIDER_ESCALATION/);
});

test("quality upgrade selector skips packs with no launchable variants",()=>{
  const start=reconcile.indexOf("async function upgradeLegacyReadyPack");
  const end=reconcile.indexOf("async function startPackFinalizer",start);
  assert.ok(start>=0 && end>start);
  const upgrade=reconcile.slice(start,end);
  assert.match(upgrade,/and exists \(\s*select 1\s*from render_v2_variants lv/);
  assert.match(upgrade,/law\.status in \('QUEUED','RUNNING','PAUSED'\)/);
  assert.match(upgrade,/coalesce\(lr\.compiler_version,''\)=\$\{COMPILER_VERSION\}/);
});

test("exhausted remediation becomes explicit evidence-required state",()=>{
  assert.match(remediation,/remediation_exhausted:exhausted/);
  assert.match(remediation,/INPUT_EVIDENCE_REQUIRED/);
  assert.match(remediation,/V2_INPUT_EVIDENCE_EXHAUSTED/);
  assert.match(remediation,/SOURCE_ENRICHMENT_REQUIRED/);
});

test("zero-photo queue recovery takes deterministic path before provider call",()=>{
  assert.match(workflows,/ENGINE_CONTRACT_UPGRADE/);
  assert.match(workflows,/QUEUE_AUTO_RECOVERY/);
  assert.match(workflows,/PILOT_LAYOUT_MICROPOLISH_REUSE_HERO/);
  assert.match(workflows,/buildZeroPhotoPremiumSpec/);
});

test("terminal variant workflow normalizes stale GENERATING state",()=>{
  assert.match(reconcile,/TERMINAL_VARIANT_WORKFLOW_STATE_NORMALIZATION/);
  assert.match(reconcile,/tw\.status in \('FAILED','CANCELLED'\)/);
  assert.match(reconcile,/setVariantStatus\(sql,v\.id,\{status:"ESCALATION_REQUIRED"\}\)/);
});

test("legacy upgrades yield to higher-priority V3 escalations",()=>{
  const start=reconcile.indexOf("async function upgradeLegacyReadyPack");
  const end=reconcile.indexOf("async function startPackFinalizer",start);
  assert.ok(start>=0 && end>start);
  const upgrade=reconcile.slice(start,end);
  assert.match(upgrade,/hp\.status='ESCALATION_REQUIRED'/);
  assert.match(upgrade,/hpr\.rank < pr\.rank/);
  assert.match(upgrade,/hp\.quality_contract_version=\$\{QUALITY_CONTRACT_VERSION\}/);
  assert.match(upgrade,/hp\.execution_engine_version=\$\{EXECUTION_ENGINE_VERSION\}/);
});

test("hard budget exhaustion is not a system invariant",()=>{
  assert.match(failurePolicy,/failure_domain="BUDGET"; failure_code="HARD_BUDGET_EXCEEDED"; retryable=false/);
  assert.doesNotMatch(failurePolicy,/hard_budget_exceeded[\s\S]{0,120}failure_domain="SYSTEM_INVARIANT"/);
});

test("deterministic A/B grammar carries verified content through bridge",()=>{
  assert.match(grammar,/ixg-bridge__evidence-row/);
  assert.match(grammar,/aBridgeEvidenceRows/);
  assert.doesNotMatch(grammar,/ixg-bridge__device[^\n]*aria-hidden/);
  assert.match(grammar,/ixb-bridge__copy/);
  assert.match(grammar,/copyToken\("POSITIONING_BODY"\)/);
  assert.match(grammar,/\.ix-v2-nav a\{color:#f4f1ea;font-size:15px/);
});

test("legacy migration yields to higher-priority INPUT_READY when a full set can start",()=>{
  const start=reconcile.indexOf("async function upgradeLegacyReadyPack");
  const end=reconcile.indexOf("async function startPackFinalizer",start);
  assert.ok(start>=0 && end>start);
  const upgrade=reconcile.slice(start,end);
  assert.match(upgrade,/ip\.status='INPUT_READY'/);
  assert.match(upgrade,/iip\.certification_status='PASS'/);
  assert.match(upgrade,/ipr\.rank < pr\.rank/);
  assert.match(upgrade,/\$\{slots\}::int>=3/);
});

test("prospect rendering fields mirror authoritative pack state",()=>{
  assert.match(reconcile,/async function syncProspectRenderProjection/);
  assert.match(reconcile,/when status='RENDER_READY' then 'CABINA_RENDER_REVIEW'/);
  assert.match(reconcile,/when status='GENERATING' then 'RENDER_V2_GENERATING'/);
  assert.match(reconcile,/when status='INPUT_READY' then 'RENDER_QUEUE_WAIT'/);
  assert.match(reconcile,/V2_INPUT_EVIDENCE_EXHAUSTED/);
  assert.match(reconcile,/summary\.prospect_projection_sync=await syncProspectRenderProjection\(sql\)/);
  assert.doesNotMatch(reconcile,/syncProspectRenderProjection[\s\S]{0,2200}set pipeline_status=/);
});

test("escalated recovery stages one wave across available slots",()=>{
  const start=reconcile.indexOf("async function recoverEscalatedQueuePack");
  const end=reconcile.indexOf("export async function startOrRecoverParent",start);
  assert.ok(start>=0 && end>start);
  const recovery=reconcile.slice(start,end);
  assert.match(recovery,/auto_recovery_partial_open/);
  assert.match(recovery,/VARIANT_SET_STAGED/);
  assert.match(recovery,/launchable\.slice\(0,maxLaunch\)/);
  assert.match(recovery,/metadata->>'event_prefix'=\$\{runKey\}/);
  assert.match(recovery,/RECOVERY_WAVE_IN_PROGRESS/);
});

test("reconciler fills and closes staged recovery waves",()=>{
  assert.match(reconcile,/STAGED_RECOVERY_WAVE_TERMINAL/);
  assert.match(reconcile,/partialRecoveryPacks/);
  assert.match(reconcile,/staged_auto_recovery:true/);
  assert.match(reconcile,/auto_recovery_wave_last_launch_at/);
});

test("active recovery variant state follows workflow lifecycle",()=>{
  assert.match(reconcile,/await setVariantStatus\(sql,variant\.id,\{status:"GENERATING"\}\)/);
  assert.match(reconcile,/RECOVERY_WORKFLOW_CREATE_FAILED/);
  assert.match(reconcile,/await setVariantStatus\(sql,variant\.id,\{status:"ESCALATION_REQUIRED"\}\)/);
  assert.match(reconcile,/validActiveVariantStates=new Set\(\["GENERATING","PREVIEW_READY","QA_RUNNING","REWORK"\]\)/);
  assert.match(reconcile,/!validActiveVariantStates\.has\(String\(row\.variant_status\|\|""\)\)/);
});

test("construction hero grammar forbids empty sky dominance",()=>{
  assert.match(hero,/function isConstructionContext/);
  assert.match(hero,/roughly 65–80% of the frame/);
  assert.match(hero,/sky to about 20% or less/);
  assert.match(hero,/never let blank sky dominate/);
  assert.match(hero,/390px portrait crop remains dense and credible/);
});

test("fallback service titles remain verbatim-grounded",()=>{
  assert.match(ai,/function verifiedServiceTitle/);
  assert.match(ai,/text\.split\(\/\\s\*\(\?:\\\/\|:\|—\|–\)\\s\*\//);
  assert.doesNotMatch(ai,/title:text\.length<=72\?text:\("Servizio "\+\(i\+1\)\)/);
  assert.match(ai,/title:verifiedServiceTitle\(text\)/);
});

test("single verified service renders as intentional feature",()=>{
  assert.match(grammar,/serviceTitles\.length===1\?" ixb-service-row--feature":""/);
  assert.match(grammar,/\.ixb-service-row--feature\{min-height:360px/);
  assert.match(grammar,/\.ixb-service-row--feature\{min-height:0;grid-template-columns:1fr/);
});

test("execution sanitizes legacy service placeholders and duplicate trust intro",()=>{
  assert.match(ai,/\^servizi\?o\\s\*\\d\+\$\/i/);
  assert.match(ai,/verifiedServiceTitle\(body\)\|\|title/);
  assert.match(ai,/const trustNorms=new Set\(trustTexts\.map\(norm\)\)/);
  assert.match(ai,/rawTrustIntro && !trustNorms\.has\(norm\(rawTrustIntro\)\)/);
  assert.doesNotMatch(ai,/"Dati verificati"/);
  assert.match(ai,/"Perché scegliere noi"/);
  assert.match(ai,/filterHomepageTrustPoints/);
});

test("healthz exposes authoritative operational invariants",()=>{
  assert.match(health,/export async function operationalInvariantSnapshot/);
  assert.match(health,/invalid_v3_ready/);
  assert.match(health,/duplicate_active_variant_workflows/);
  assert.match(health,/ghost_generating/);
  assert.match(health,/partial_wave_incoherent/);
  assert.match(health,/exhausted_input_projection_stale/);
  assert.match(health,/ready_projection_stale/);
  assert.match(health,/v\.status in \('GENERATING','PREVIEW_READY','QA_RUNNING','REWORK'\)/);
  assert.match(index,/operational_ok:operational_invariants\?\.operational_ok===true/);
  assert.match(index,/operational_invariants/);
});

test("exhausted V3 quality upgrades cannot block legacy migration",()=>{
  const start=reconcile.indexOf("async function upgradeLegacyReadyPack");
  const end=reconcile.indexOf("async function startPackFinalizer",start);
  assert.ok(start>=0 && end>start);
  const upgrade=reconcile.slice(start,end);
  assert.match(upgrade,/quality_upgrade_exhausted/);
  assert.match(upgrade,/p\.metadata->>'quality_upgrade_exhausted'/);
  assert.match(upgrade,/quality_upgrade_exhausted[\s\S]{0,120}false/);
});


test("R107 makes full-bleed in-image hero overlay global",()=>{
  assert.match(grammar,/IMPRESAX_RENDER_STANDARD_R107_PREMIUM_OVERLAY_HERO_ULTRA_VISUAL_V1/);
  assert.match(grammar,/ixm-hero__media/);
  assert.match(grammar,/ixb-hero__media/);
  assert.match(grammar,/ixc-hero__media/);
  assert.match(grammar,/hero_copy_overlay_allowed:true/);
  assert.match(grammar,/hero_text_over_image_required:true/);
  assert.match(grammar,/mobile_overlay_forbidden:false/);
  assert.match(grammar,/data-hero-text-over-image="required"/);
  assert.match(grammar,/R107 — premium overlay hero \+ ultra-visual refinement/);
});

test("render profile is pack scoped and injected without mutating certified input payload",()=>{
  assert.match(workflows,/select metadata from render_v2_packs where id=\$\{params\.packId\}::uuid/);
  assert.match(workflows,/const packMetadata=packRows\[0\]\?\.metadata\|\|\{\}/);
  assert.match(workflows,/String\(packMetadata\.render_profile\|\|""\)\.trim\(\)/);
  assert.match(workflows,/logoFirstBrandProfile=packMetadata\.logo_first_brand_profile\|\|null/);
  assert.match(workflows,/\.\.\.input\.payload/);
  assert.match(workflows,/brand_gate_mode:"LOGO_FIRST_V1"/);
});


test("health accepts intentional isolated pilot mode",()=>{
  assert.match(health,/pilot_single_prospect/);
  assert.match(health,/operating_mode:pilotMode\?"PILOT_SINGLE_PROSPECT"/);
  assert.match(health,/operational_ok:\(queueReady\|\|pilotMode\)/);
});


test("R107 Master retrofit may reuse only a certified reusable hero",()=>{
  assert.match(workflows,/const r107Retrofit=/);
  assert.match(workflows,/if\(structuralRework \|\| r107Retrofit\)/);
  assert.match(workflows,/latestReusableHeroAsset\(sql,params\.packId,params\.variantKey\)/);
  assert.match(workflows,/R107_RETROFIT_REUSABLE_HERO_REQUIRED/);
  assert.match(workflows,/r107_retrofit_reuse:r107Retrofit/);
});

test("ImpresaX master hero prompt forbids blank copy space",()=>{
  assert.match(hero,/IMPRESAX MASTER FULL-BLEED CONTRACT/);
  assert.match(hero,/ZERO blank copy panels/);
  assert.match(hero,/Do NOT reserve a blank side for text/);
  assert.match(hero,/photographic detail underneath the future text area/);
});


test("ImpresaX raw hero QA rewards full photographic density",()=>{
  assert.match(ai,/IMPRESAX MASTER FULL-BLEED QA/);
  assert.match(ai,/do NOT require blank or clean negative space/);
  assert.match(ai,/HTML copy readability is handled later by a CSS gradient overlay/);
  assert.match(ai,/HARD FAIL blank gray\/flat copy panels/);
});


test("ImpresaX master rework cannot regress to split hero",()=>{
  assert.match(ai,/IMPRESAX MASTER HERO CONTRACT/);
  assert.match(ai,/ENTIRE hero background edge-to-edge/);
  assert.match(ai,/MUST be overlaid inside the photographic field/);
  assert.match(ai,/never move hero copy below\/beside the image/);
  assert.match(ai,/never convert the hero to a split layout/);
});

test("ImpresaX master bridge and mobile nav remain distinct",()=>{
  assert.match(grammar,/copyToken\("BRIDGE_TITLE"\)/);
  assert.match(grammar,/copyToken\("BRIDGE_BODY"\)/);
  assert.match(grammar,/justify-content:flex-start!important/);
  assert.match(grammar,/overflow-x:auto!important/);
  assert.match(grammar,/font-size:10px!important/);
  assert.match(ai,/do not reuse \{\{copy:POSITIONING_BODY\}\} in bridge/);
});

test("ImpresaX pilot headline is derived from verified service titles",()=>{
  assert.match(ai,/const masterHeadlinePart=/);
  assert.match(ai,/vendita\\s\+all\['’\]ingrosso/);
  assert.match(ai,/lavorazione\\s\+e\\s\+trasformazione/);
  assert.match(ai,/render_profile\|\|""\)===\"IMPRESAX_MASTER_V1\"/);
  assert.match(ai,/serviceTitles\.slice\(0,2\)/);
});


test("ImpresaX master preserves official logo without synthetic plaques",()=>{
  assert.match(grammar,/\.ix-v2-brand\{position:relative;background:transparent!important/);
  assert.match(grammar,/\.ix-v2-footer-identity\{display:inline-flex!important;width:max-content!important;min-height:0!important;background:transparent!important/);
  assert.match(grammar,/\.ix-v2-footer-logo\{display:block!important;max-height:54px!important/);
});

test("ImpresaX pilot logo has no synthetic white box and mobile nav can breathe",()=>{
  assert.match(grammar,/\.ix-v2-brand\{[^}]*background:transparent!important/);
  assert.match(grammar,/\.ix-v2-footer-identity\{[^}]*background:transparent!important/);
  assert.match(grammar,/justify-content:flex-start!important;gap:22px!important;overflow-x:auto!important/);
  assert.match(grammar,/flex:0 0 auto!important/);
  assert.doesNotMatch(grammar,/\.ix-v2-brand\{[^}]*background:#f7f6f2!important/);
});

test("ImpresaX pilot editorial positioning derives only from verified service evidence",()=>{
  assert.match(ai,/materiali per l’edilizia/);
  assert.match(ai,/const masterPositioningTitle=/);
  assert.match(ai,/body\.match\(\/\\bper\\s\+\(\.\+\?\)\[\.\]\?\$\/i\)/);
  assert.match(ai,/const masterPositioningBody=/);
  assert.match(ai,/String\(serviceBodies\[0\]\|\|""\)\.trim\(\)/);
});

test("DEDIL pilot final polish improves mobile tap targets and positioning balance",()=>{
  assert.match(grammar,/min-height:36px!important;padding:0 3px!important/);
  assert.match(grammar,/\.ixg-positioning__body\{position:relative;padding-top:18px!important;border-top:1px solid rgba\(17,17,17,.18\)!important\}/);
  assert.match(grammar,/\.ixg-positioning__body:after/);
});

test("pilot layout micropolish can lock exact pre-QA hero SHA",()=>{
  assert.match(workflows,/async function reusableHeroAssetBySha/);
  assert.match(workflows,/PILOT_LAYOUT_MICROPOLISH_REUSE_HERO/);
  assert.match(workflows,/pilot_reuse_hero_sha256/);
  assert.match(workflows,/PILOT_LOCKED_HERO_NOT_FOUND_OR_NOT_PREQA_PASS/);
  assert.match(workflows,/AI_GENERATED_EDITORIAL_LOCKED_PREQA_PASS/);
  assert.match(workflows,/q\.artifact_hashes->>'hero_sha256'=a\.sha256/);
});

test("locked pilot hero and structural rework use deterministic premium layout",()=>{
  assert.match(workflows,/PILOT_LAYOUT_MICROPOLISH_REUSE_HERO/);
  assert.match(workflows,/STRUCTURAL_DIVERGENCE_REWORK/);
  assert.match(workflows,/const structuralDeterministic=/);
  assert.match(workflows,/context\.heroOnly/);
  assert.match(workflows,/buildZeroPhotoPremiumSpec/);
});


test("logo-first master profile drives visual system from official logo",()=>{
  assert.match(workflows,/logo_first_brand_profile/);
  assert.match(workflows,/brand_gate_mode:"LOGO_FIRST_V1"/);
  assert.match(grammar,/logoFirstBrandProfile/);
  assert.match(grammar,/LOGO_FIRST_MASTER_V1/);
  assert.match(grammar,/HORIZONTAL_SPEED_LINES_ECHOING_LOGO_D|repeating-linear-gradient/);
  assert.match(grammar,/border-radius:2px!important/);
  assert.match(grammar,/font-family:Arial,Helvetica,sans-serif!important/);
});

test("logo-first master approval requires 9 of 10 desirability gates",()=>{
  assert.match(constants,/logo_integration_quality/);
  assert.match(constants,/hero_full_bleed_quality/);
  assert.match(constants,/wow_effect/);
  assert.match(constants,/preview_sales_power/);
  assert.match(ai,/masterGateFloor>=9/);
  assert.match(ai,/prospect_desire/);
  assert.match(ai,/preview_sales_power/);
});

test("single-prospect pilot hard-locks rollout and reconciler",()=>{
  assert.match(rollout,/function pilotMasterLocked/);
  assert.match(rollout,/awaiting:"APPROVED_MASTER_REFERENCE"/);
  assert.match(rollout,/phase='PILOT_SINGLE_PROSPECT'/);
  assert.match(reconcile,/pilot_awaiting_cabina_approval/);
  assert.match(reconcile,/global_queue:false/);
  assert.match(reconcile,/awaiting:"APPROVED_MASTER_REFERENCE"/);
});


test("logo-first wow rebuild uses integrated light shell and industrial premium sections",()=>{
  assert.match(grammar,/background:rgba\(248,248,246,.96\)!important/);
  assert.match(grammar,/min-height:clamp\(680px,70vw,880px\)!important/);
  assert.match(grammar,/max-width:13\.5ch!important/);
  assert.match(grammar,/counter-reset:ixservice!important/);
  assert.match(grammar,/counter-increment:ixservice!important/);
  assert.match(grammar,/background:var\(--ix-brand-primary\)!important;\n color:#fff!important/);
  assert.match(grammar,/\.ix-v2-footer\{[\s\S]{0,180}background:var\(--ix-brand-paper\)!important/);
});


test("premium pilot requires iconography and graphic richness",()=>{
  assert.match(grammar,/ixg-service__icon/);
  assert.match(grammar,/ixm-graphic-band/);
  assert.match(grammar,/ixg-trust:before/);
  assert.match(grammar,/ixm-bridge__copy:after/);
  assert.match(constants,/iconography_quality/);
  assert.match(constants,/graphic_support_quality/);
  assert.match(constants,/trust_visual_quality/);
  assert.match(constants,/client_wow_effect/);
  assert.match(ai,/PREMIUM SECTION GATE/);
  assert.match(ai,/CLIENT WOW GATE/);
  assert.match(ai,/section_premium_quality/);
  assert.match(ai,/commercial_desirability/);
});


test("logo-first partner proof remains a separate branded section and editorial ledgers remain available",()=>{
  assert.match(ai,/out\["PARTNER_"\+partnerOutIndex\]/);
  assert.match(ai,/PARTNER_SECTION_TITLE/);
  assert.match(grammar,/ixg-partner-proof/);
  assert.match(grammar,/ixg-partner-logo/);
  assert.match(grammar,/grid-template-columns:160px minmax\(0,1fr\)!important/);
  assert.match(grammar,/grid-template-columns:1fr!important;\n gap:0!important;\n border-top:1px solid rgba\(255,255,255,.18\)!important/);
  assert.doesNotMatch(grammar,/content:"01"/);
});


test("Cabina-locked hero is exposed to QA and not rejected for editorial preference alone",()=>{
  assert.match(workflows,/pilotHeroLocked=packMetadata\.pilot_reuse_hero_locked===true/);
  assert.match(workflows,/pilot_hero_locked:true/);
  assert.match(ai,/const pilotHeroLocked=inputPayload\?\.pilot_hero_locked===true/);
  assert.match(ai,/CABINA-LOCKED HERO/);
  assert.match(ai,/lockedHeroPreference/);
  assert.match(ai,/k===\"hero_desirability\"/);
});

test("structural rework reuses certified hero and never requests a fresh AI hero",()=>{
  assert.match(workflows,/STRUCTURAL_REWORK_REUSABLE_HERO_REQUIRED/);
  assert.match(workflows,/structural_rework_reuse:structuralRework/);
  assert.match(workflows,/cabina_precomputed_hero_sha256_by_variant/);
  assert.match(workflows,/feedback\?\.reason==="HERO_VISUAL_REPAIR"[\s\S]{0,260}context\.packMetadata\?\.structural_divergence_rework_required!==true[\s\S]{0,180}context\.r107Retrofit!==true/);
});

test("mobile text identity cannot force header overflow",()=>{
  assert.match(compiler,/grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(compiler,/\.ix-v2-brand\{[^}]*min-width:0/);
  assert.match(compiler,/\.ix-v2-wordmark\{[^}]*overflow-wrap:anywhere/);
  assert.match(compiler,/\.ix-v2-brand\{max-width:min\(58vw,220px\)\}/);
});

test("R113 detail craftsmanship locks alignment imagery trust background and demo partner capacity",()=>{
  assert.match(constants,/R113_DETAIL_CRAFTSMANSHIP_V1/);
  assert.match(grammar,/data-service-index-rail=\\"locked\\"/);
  assert.match(grammar,/SERVICE_MATERIALS_VISUAL/);
  assert.match(grammar,/SERVICE_REBAR_VISUAL/);
  assert.match(grammar,/data-trust-background/);
  assert.match(grammar,/data-demo-partner-slot=\\"true\\"/);
  assert.match(compiler,/R113_SERVICE_DETAIL_GRID_ALIGNMENT_REQUIRED/);
  assert.match(compiler,/R113_FEATURE_1_CONTEXT_IMAGE_REQUIRED/);
  assert.match(compiler,/R113_FEATURE_2_CONTEXT_IMAGE_REQUIRED/);
  assert.match(compiler,/R113_TRUST_BACKGROUND_IMAGE_REQUIRED/);
  assert.match(compiler,/R113_PARTNER_DEMO_CAPACITY_REQUIRED/);
});

test("R116 partner facsimiles and repeated imagery receive distinct art direction",()=>{
  assert.match(r116Flagship,/content:"SLOT DEMO"!important/);
  assert.match(r116Flagship,/\.ixg-partner-card--demo \.ixg-demo-partner-lines\{display:none!important\}/);
  assert.match(r116Flagship,/object-position:44% 58%!important/);
  assert.match(r116Flagship,/object-position:82% 48%!important/);
  assert.match(r116Flagship,/transform:scale\(1\.11\)!important/);
});

test("R116 final art direction removes legacy band and upgrades shell bridge",()=>{
  assert.match(r116Flagship,/\.ixm-graphic-band\{display:none!important\}/);
  assert.match(r116Flagship,/\.ix-v2-header\{[\s\S]*position:absolute!important/);
  assert.match(r116Flagship,/\.ixg-bridge\[data-r116-set-piece="bridge"\]/);
  assert.match(r116Flagship,/font-size:clamp\(64px,7vw,110px\)/);
  assert.match(r116Flagship,/\.ixg-feature--one \.ixg-feature__stage:before,[\s\S]*display:none!important/);
  assert.match(r116Flagship,/\.ix-v2-nav\{display:none!important\}/);
});

test("R116 mobile flagship containment and overflow diagnostics stay enforced",()=>{
  assert.match(browser,/overflow_elements/);
  assert.match(browser,/x\.right>root\.clientWidth\+2 \|\| x\.left<-2/);
  assert.match(r116Flagship,/\.ixf-hero__inner,.ixf-positioning__grid/);
  assert.match(r116Flagship,/min-width:0!important;max-width:100%!important/);
  assert.match(r116Flagship,/\.ixg-actions\{max-width:100%!important;flex-wrap:wrap!important\}/);
  assert.doesNotMatch(r116Flagship,/html,body\{[^}]*overflow-x:hidden/);
});

test("R116 pilot kick cannot route full redesign through precomputed mode",()=>{
  assert.match(index,/const structuralRedesign=\/STRUCTURAL_DIVERGENCE_REWORK\|FULL_FLAGSHIP_REDESIGN\|FULL_REDESIGN\/i/);
  assert.match(index,/cabina_precomputed:!structuralRedesign/);
  assert.match(index,/structural_redesign:structuralRedesign/);
  assert.match(index,/Rebuild the page composition under the active flagship architecture standard/);
});

test("R116 flagship QA floors are blocking at 9.7-9.8",()=>{
  assert.match(ai,/flagship_presence:9\.8/);
  assert.match(ai,/section_identity:9\.8/);
  assert.match(ai,/editorial_composition:9\.8/);
  assert.match(ai,/luxury_simplicity:9\.7/);
  assert.match(ai,/fifteen_k_credibility:9\.8/);
  assert.match(ai,/flagship_gate_floor/);
  assert.match(ai,/R116 FLAGSHIP PRESENCE/);
  assert.match(ai,/R116 15K CREDIBILITY/);
});

test("R116 flagship architecture blocks template-grade regressions",()=>{
  assert.match(constants,/R116_FLAGSHIP_PREMIUM_ARCHITECTURE_V1/);
  assert.match(grammar,/data-r116-flagship=\\"true\\"/);
  assert.match(grammar,/data-r116-set-piece/);
  assert.match(grammar,/ixf-hero__meta-rail/);
  assert.match(grammar,/ixf-positioning__proof-rail/);
  assert.match(grammar,/flagship_architecture_standard/);
  assert.match(grammar,/R116_FLAGSHIP_PREMIUM_ARCHITECTURE_V1/);
  assert.match(compiler,/R116_FLAGSHIP_SET_PIECES_REQUIRED/);
  assert.match(compiler,/R116_POSITIONING_PROOF_RAIL_REQUIRED/);
  assert.match(compiler,/R116_CINEMATIC_HERO_CSS_REQUIRED/);
  assert.match(compiler,/R116_FINAL_CTA_SCALE_SHIFT_REQUIRED/);
  assert.match(r116Flagship,/R116 FLAGSHIP PREMIUM ARCHITECTURE/);
  assert.match(r116Flagship,/\.ixf-hero__inner/);
  assert.match(r116Flagship,/\.ixf-positioning__grid/);
  assert.match(r116Flagship,/\.ixf-services/);
  assert.match(r116Flagship,/\.ixg-feature--one/);
  assert.match(r116Flagship,/\.ixg-feature--two/);
  assert.match(r116Flagship,/\.ixg-trust-section/);
  assert.match(r116Flagship,/\.ixg-partner-proof__grid/);
  assert.match(r116Flagship,/\.ix-v2-footer-grid/);
});

test("R115 premium finishing differentiates services features shell CTAs and footer",()=>{
  assert.match(constants,/R115_PREMIUM_SECTION_IDENTITY_FINISHING_V1/);
  assert.match(grammar,/data-service-composition=\\"paired-editorial-with-media\\"/);
  assert.match(grammar,/const featureLayout=slot===1\?"cinematic-materials":"technical-rebar"/);
  assert.match(grammar,/data-feature-layout/);
  assert.match(grammar,/data-trust-finish=\\"premium-editorial\\"/);
  assert.match(grammar,/data-cta-premium=\\"true\\"/);
  assert.match(grammar,/R115_SHELL_CSS\+R115_SECTIONS_CSS/);
  assert.match(compiler,/R115_SERVICE_FEATURE_LOCALITY_FILLER_FORBIDDEN/);
  assert.match(compiler,/R115_PREMIUM_HEADER_SHELL_REQUIRED/);
  assert.match(compiler,/R115_PREMIUM_FOOTER_COMPOSITION_REQUIRED/);
  assert.match(r115Shell,/premium shell, CTA and footer finishing/);
  assert.match(r115Sections,/premium section identity/);
  assert.match(r115Sections,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(r115Sections,/ixg-feature--two .*grid-column:1/i);
});

test("R112 browser QA treats SVG hero fallback as resolution-independent",()=>{
  assert.match(browser,/hero_image_is_vector/);
  assert.match(browser,/!diag\.hero_image_is_vector[\s\S]{0,120}hero_image_resolution_ratio/);
});

test("R112 preserves real hero identity by upscaling raster before vector fallback",()=>{
  assert.match(workflows,/createR112UpscaledHeroAsset/);
  assert.match(workflows,/upscaleR107Hero/);
  assert.match(workflows,/hero-resolution-raster-upscale/);
  assert.match(workflows,/R112_DETERMINISTIC_RASTER_UPSCALE/);
  assert.match(workflows,/fallbackMode="RASTER_UPSCALE"/);
  assert.match(workflows,/VECTOR_LAST_RESORT/);
});

test("R112 zero-AI hero resolution failures retain vector art as last-resort fallback",()=>{
  assert.match(workflows,/HERO_SOURCE_RESOLUTION_TOO_LOW/);
  assert.match(workflows,/hero-resolution-raster-upscale/);
  assert.match(workflows,/hero-resolution-vector-fallback/);
  assert.match(workflows,/createR107DeterministicGraphicHeroAsset\(this\.env,sql/);
  assert.match(workflows,/DETERMINISTIC_HERO_RESOLUTION_FALLBACK/);
  assert.match(workflows,/VECTOR_LAST_RESORT/);
  assert.match(workflows,/hero_resolution_fallback:true/);
});

test("R112 zero-AI queue always stays on deterministic planning, generation and Cabina review",()=>{
  assert.match(workflows,/const deterministicPlanning=zeroAiDeterministicMode/);
  assert.match(workflows,/zeroAiQueueDeterministic=EXTERNAL_AI_CALLS_ALLOWED!==true[\s\S]{0,180}RENDER_GENERATION_MODE==="CHATGPT_CABINA_ZERO_EXTRA_AI"/);
  assert.match(workflows,/if\(zeroAiQueueDeterministic \|\| contractUpgradeDeterministic/);
  assert.match(workflows,/generated\?\.deterministic===true[\s\S]{0,180}context\.packMetadata\?\.structural_divergence_rework_required/);
  assert.match(workflows,/IMPRESAX_RENDER_STANDARD_R\(\?:107\|108\|109\|110\|111\|112\)_/);
});

test("operational rollout tick reconciles before queue rollout",()=>{
  const route=index.indexOf('url.pathname==="/shadow/rollout/tick"');
  assert.ok(route>=0);
  const block=index.slice(route,route+2600);
  const reconcileAt=block.indexOf("reconcileV2(env)");
  const rolloutAt=block.indexOf("tickRollout(env)");
  assert.ok(reconcileAt>=0 && rolloutAt>reconcileAt);
  assert.match(block,/operational_tick_last_at/);
});

test("zero-AI structural rework stops at Cabina visual review before provider QA",()=>{
  const marker=workflows.indexOf("const structuralZeroAiReview=");
  const qaCall=workflows.indexOf("runVisualQa(this.env",marker);
  assert.ok(marker>=0);
  assert.ok(qaCall>marker);
  const block=workflows.slice(marker,qaCall);
  assert.match(block,/EXTERNAL_AI_CALLS_ALLOWED!==true/);
  assert.match(block,/CABINA_DETERMINISTIC/);
  assert.match(block,/CABINA_VISUAL_REVIEW/);
  assert.match(block,/return \{/);
});

test("structural hot-swap terminates stale active workflows before concurrency accounting",()=>{
  assert.match(reconcile,/async function cancelSupersededStructuralRework/);
  assert.match(reconcile,/ENGINE_HOT_SWAP/);
  assert.match(reconcile,/structural_rework_cancel_before/);
  const hotSwap=reconcile.indexOf("summary.engine_hot_swap_cancelled=await cancelSupersededStructuralRework");
  const concurrency=reconcile.indexOf("summary.concurrency=await enforceGlobalVariantConcurrency");
  assert.ok(hotSwap>=0 && concurrency>hotSwap);
});


test("variant C bridge is a real media grid on desktop and mobile", () => {
  assert.match(grammar, /Variant C bridge grid guard/);
  assert.match(grammar, /grid-template-columns:10px minmax\(0,\.72fr\) minmax\(320px,1fr\)!important/);
  assert.match(grammar, /\.ixc-bridge__copy\{grid-column:2!important;grid-row:1!important\}/);
  assert.match(grammar, /\.ixc-bridge \.ixg-section-visual--two\{grid-column:3!important;grid-row:1!important/);
  assert.match(grammar, /grid-row:1 \/ span 2!important/);
  assert.match(grammar, /\.ixc-bridge \.ixg-section-visual--two\{grid-column:2!important;grid-row:2!important/);
  assert.match(grammar, /const cBridgeBody=Object\.prototype\.hasOwnProperty\.call\(copyManifest,"BRIDGE_BODY"\)/);
});


test("Cabina visual-review hold blocks every automatic recovery path", () => {
  assert.match(reconcile, /pack\?\.metadata\?\.cabina_visual_review_hold===true/);
  assert.match(reconcile, /reason:"CABINA_VISUAL_REVIEW_HOLD"/);
  const guards=(reconcile.match(/cabina_visual_review_hold/g)||[]).length;
  assert.ok(guards>=6, "expected Cabina hold guard across recovery selectors");
});


test("Cabina visual-review hold also blocks finalizer and pack certification", () => {
  assert.match(rollout, /cabinaVisualReviewHold=g\.metadata\?\.cabina_visual_review_hold===true/);
  assert.match(rollout, /cabina_visual_review_hold_clear:!cabinaVisualReviewHold/);
  assert.match(rollout, /maybeStartFinalizer[\s\S]*cabina_visual_review_hold===true/);
  assert.match(rollout, /coalesce\(\(p\.metadata->>'cabina_visual_review_hold'\)::boolean,false\)=false/);
  assert.match(workflows, /cabina-finalization-hold-check/);
  assert.match(workflows, /CABINA_VISUAL_REVIEW_HOLD/);
  assert.match(workflows, /cabina-hold-before-certify/);
});


test("health heartbeat falls back to rollout last_tick_at and heartbeat writes avoid null binds", () => {
  assert.match(health, /coalesce\(r\.last_tick_at,'epoch'::timestamptz\)/);
  assert.match(health, /last_reconcile_at:x\.metadata\?\.operational_tick_last_at\|\|x\.metadata\?\.scheduled_reconcile_last_at\|\|x\.last_tick_at\|\|null/);
  assert.match(index, /scheduled_reconcile_last_error}',to_jsonb\(\$\{reconcileError\|\|""\}::text\),true/);
  assert.match(index, /operational_tick_last_error}',to_jsonb\(\$\{reconcileError\|\|""\}::text\),true/);
});


test("health separates all-variant visual readiness from winner-only R106 Master gate", () => {
  assert.match(health, /q\.qa_type='VARIANT_VISUAL'[\s\S]*?mobile_quality/);
  assert.match(health, /v\.variant_key=coalesce\(p\.metadata->>'winner_variant','A'\)/);
  assert.match(health, /q\.qa_type='CABINA_VISUAL'/);
  assert.match(health, /commissioned_experience_quality'[\s\S]*?>=9\.8/);
  assert.match(health, /master_candidate_visual_passes<>1/);
});


test("R107 capture is 2x high-resolution and geometrically verifies hero overlay",()=>{
  assert.match(constants,/RENDER_DEVICE_SCALE_FACTOR = 2/);
  assert.match(constants,/RENDER_JPEG_QUALITY = 96/);
  assert.match(browser,/deviceScaleFactor:RENDER_DEVICE_SCALE_FACTOR/);
  assert.match(browser,/quality:RENDER_JPEG_QUALITY/);
  assert.match(browser,/hero_text_over_image:Boolean\(overlaps\(h1Rect,imageRect\)\)/);
  assert.match(browser,/hero_copy_over_image:Boolean\(overlaps\(ledeRect,imageRect\)\)/);
  assert.match(browser,/hero_cta_over_image:Boolean\(overlaps\(actionsRect,imageRect\)\)/);
  assert.match(browser,/HERO_H1_NOT_OVER_IMAGE/);
  assert.match(browser,/HERO_COPY_NOT_OVER_IMAGE/);
  assert.match(browser,/HERO_CTA_NOT_OVER_IMAGE/);
});

test("R107 contract upgrade is fully deterministic and reuses certified hero for every profile",()=>{
  assert.match(workflows,/const r107Retrofit=/);
  assert.match(workflows,/R107_RETROFIT_REUSABLE_HERO_REQUIRED/);
  assert.match(workflows,/r107_retrofit_reuse:r107Retrofit/);
  assert.doesNotMatch(workflows,/ENGINE_CONTRACT_UPGRADE" && !masterProfile/);
  assert.match(workflows,/const contractUpgradeDeterministic=/);
  assert.match(workflows,/context\.r107Retrofit===true/);
  assert.match(workflows,/if\(zeroAiQueueDeterministic \|\| contractUpgradeDeterministic \|\| \(cycle===1/);
  assert.match(workflows,/feedback\?\.reason==="HERO_VISUAL_REPAIR"[\s\S]{0,320}context\.r107Retrofit!==true/);
  assert.match(reconcile,/R107 premium overlay-hero ultra-visual contract/);
  assert.match(reconcile,/2x device density and premium JPEG quality/);
});

test("R107 compiler inherits previous quality gates and adds ultra-visual gate",()=>{
  assert.match(compiler,/R\(\?:89\|90\|93\|94\|106\|107\)_/);
  assert.match(compiler,/r107UltraVisualPolicy/);
  assert.match(compiler,/r107UltraVisualViolations/);
});


test("R107 high-resolution treatment applies to all visible raster imagery before capture",()=>{
  assert.match(browser,/runtimeImageTreatment=await page\.evaluate/);
  assert.match(browser,/page\.evaluate\(async\(renderScale\)=>/);
  assert.match(browser,/rect\.width\*renderScale/);
  assert.match(browser,/},RENDER_DEVICE_SCALE_FACTOR\);/);
  assert.match(browser,/imageSmoothingQuality="high"/);
  assert.match(browser,/canvas\.toDataURL\("image\/jpeg",0\.96\)/);
  assert.match(browser,/runtime_high_res_treated_images/);
  assert.match(browser,/HERO_SOURCE_RESOLUTION_TOO_LOW/);
  assert.match(browser,/deviceScaleFactor:RENDER_DEVICE_SCALE_FACTOR/);
  assert.match(constants,/RENDER_DEVICE_SCALE_FACTOR = 2/);
  assert.match(constants,/RENDER_JPEG_QUALITY = 96/);
});


test("R107 retrofit stays deterministic and zero-AI during recovery", () => {
  assert.match(workflows, /const r107Retrofit=/);
  assert.match(workflows, /context\.r107Retrofit===true/);
  assert.match(workflows, /SYSTEM_INVARIANT:R107_RETROFIT_REUSABLE_HERO_REQUIRED/);
  assert.match(workflows, /const contractUpgradeDeterministic=[\s\S]*context\.r107Retrofit===true/);
  assert.match(reconcile, /const r107Recovery=/);
  assert.match(reconcile, /const deterministicRecovery=structuralRecovery \|\| r107Recovery/);
  assert.match(reconcile, /r107_retrofit:r107Recovery/);
  assert.match(reconcile, /r107Recovery \? \{[\s\S]*reason:"ENGINE_CONTRACT_UPGRADE"/);
});


test("R107 Cabina preview holds only the complete A/B/C set before external visual QA",()=>{
  const marker=workflows.indexOf("const structuralZeroAiReview=");
  const qaCall=workflows.indexOf("runVisualQa(this.env",marker);
  const block=workflows.slice(marker,qaCall);
  assert.match(block,/context\.r107Retrofit===true/);
  assert.match(block,/setPackStatus\(sql,params\.packId,"PREVIEW_READY"/);
  assert.match(block,/cabina_visual_review_hold:completePreviewSet/);
  assert.match(block,/completePreviewSet\?"CABINA_VISUAL_REVIEW":"R107_PREVIEW_SET_IN_PROGRESS"/);
});


test("R107 premium guards prevent phantom metric panels and low-contrast footer identity",()=>{
  assert.match(grammar,/grid-template-columns:repeat\(auto-fit,minmax\(260px,1fr\)\)!important/);
  assert.match(grammar,/\.ix-v2-footer-identity\{[\s\S]*background:#f7f6f2!important/);
  assert.match(grammar,/\.ix-v2-footer-logo\{[\s\S]*mix-blend-mode:multiply!important/);
});


test("R107 remediation discovers same-origin first-party editorial images", () => {
  assert.match(remediation, /function firstPartyImageCandidates\(docs,prospect\)/);
  assert.match(remediation, /SAME_ORIGIN_OFFICIAL_SITE_IMAGE/);
  assert.match(remediation, /commercial_use_status:"FIRST_PARTY_REFERENCE"/);
  assert.match(remediation, /first_party_images:\[/);
  assert.match(remediation, /first_party_image_evidence:firstPartyImages/);
  assert.match(remediation, /logo\|favicon\|icon\|sprite\|avatar/);
});


test("R107 zero-photo packs use deterministic vector artwork instead of AI or fake photos", () => {
  assert.match(workflows, /createR107DeterministicGraphicHeroAsset/);
  assert.match(workflows, /R107_DETERMINISTIC_VECTOR_ARTWORK/);
  assert.match(workflows, /ai_generated:false/);
  assert.match(workflows, /mime:"image\/svg\+xml"/);
  assert.match(workflows, /graphicFirstR107/);
  assert.match(workflows, /sectionTokens\.length<MIN_SECTION_VISUALS && !graphicFirstR107/);
  assert.match(workflows, /if\(EXTERNAL_AI_CALLS_ALLOWED===false\)/);
  assert.match(workflows, /source\.mime==="image\/svg\+xml"\?"svg"/);
});


test("best remediated first-party image becomes the hero candidate", () => {
  assert.match(remediation, /role:index===0\?"hero":"editorial"/);
  assert.match(workflows, /if\(!reusable && r107Retrofit\)/);
});


test("R107 certified inputs plan truth and A/B/C directions deterministically without Cabina precompute", () => {
  assert.match(workflows, /async function deterministicR107Truth\(inputPayload=\{\}\)/);
  assert.match(workflows, /async function deterministicR107Directions\(inputPayload=\{\},assetTokens=\[\]\)/);
  assert.match(workflows, /R107_DETERMINISTIC_TRUTH/);
  assert.match(workflows, /R107_DETERMINISTIC_DIRECTION_PLANNER/);
  assert.match(workflows, /const deterministicPlanning=zeroAiDeterministicMode/);
  assert.match(workflows, /content-truth-deterministic/);
  assert.match(workflows, /creative-directions-deterministic/);
  assert.doesNotMatch(workflows, /if\(!EXTERNAL_AI_CALLS_ALLOWED && \(!storedTruth \|\| !storedDirections\)\)/);
});


test("R107 deterministic copy sanitizer blocks internal policy text and generic navigation services", () => {
  assert.match(workflows, /const internalCopy=\/\\b\(\?:usare\\s\+solo/);
  assert.match(workflows, /const genericService=\/\^\(\?:attività/);
  assert.match(workflows, /const explicitTrust=verifiedList\(inputPayload\.verified_trust\|\|""\)/);
  assert.doesNotMatch(workflows, /inputPayload\.verified_trust\|\|inputPayload\?\.brand_dna\?\.trust_signals/);
  assert.match(showroom, /segnali di fiducia/);
  assert.match(showroom, /fonti verificate/);
  assert.match(workflows, /FIRST_PARTY_DISCOVERY_REQUIRED/);
  assert.match(workflows, /REMEDIATION_POLICY_VERSION/);
});

test("R107 Cabina visual-review hold waits for the complete single-concept preview set",()=>{
  assert.match(workflows,/count\(\*\) filter \(where status in \('PREVIEW_READY','RENDER_READY'\)\)::int preview_ready/);
  assert.match(workflows,/Number\(setState\[0\]\?\.total\|\|0\)===VARIANT_KEYS\.length/);
  assert.match(workflows,/Number\(setState\[0\]\?\.preview_ready\|\|0\)===VARIANT_KEYS\.length/);
  assert.match(workflows,/cabina_visual_review_hold:completePreviewSet/);
  assert.match(workflows,/R107_PREVIEW_SET_IN_PROGRESS/);
});

