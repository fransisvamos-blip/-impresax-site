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
  assert.match(workflows,/variant_visual_qa_passed',3/);
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
  assert.match(ai,/"Dati verificati"/);
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


test("ImpresaX master pilot uses full-bleed in-image hero overlay",()=>{
  assert.match(grammar,/IMPRESAX_MASTER_V1/);
  assert.match(grammar,/ixm-hero__media/);
  assert.match(grammar,/ixm-hero__veil/);
  assert.match(grammar,/position:absolute;inset:0;margin:0;width:100%;height:100%/);
  assert.match(grammar,/Verified headline\/body\/CTAs intentionally overlaid inside the photographic hero field/);
  assert.match(grammar,/hero_copy_overlay_allowed:impresaxMasterProfile/);
  assert.match(grammar,/mobile_overlay_forbidden:!impresaxMasterProfile/);
});

test("render profile is pack scoped and injected without mutating certified input payload",()=>{
  assert.match(workflows,/select metadata from render_v2_packs where id=\$\{params\.packId\}::uuid/);
  assert.match(workflows,/const packMetadata=packRows\[0\]\?\.metadata\|\|\{\}/);
  assert.match(workflows,/String\(packMetadata\.render_profile\|\|""\)\.trim\(\)/);
  assert.match(workflows,/\{\.\.\.input\.payload,render_profile:renderProfile\}/);
});


test("health accepts intentional isolated pilot mode",()=>{
  assert.match(health,/pilot_single_prospect/);
  assert.match(health,/operating_mode:pilotMode\?"PILOT_SINGLE_PROSPECT"/);
  assert.match(health,/operational_ok:\(queueReady\|\|pilotMode\)/);
});


test("ImpresaX master never reuses split-era hero assets",()=>{
  assert.match(workflows,/const masterProfile=String\(context\.inputPayload\?\.render_profile\|\|""\)==="IMPRESAX_MASTER_V1"/);
  assert.match(workflows,/ENGINE_CONTRACT_UPGRADE" && !masterProfile/);
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

test("locked pilot hero also uses deterministic Premium V3 layout",()=>{
  assert.match(workflows,/PILOT_LAYOUT_MICROPOLISH_REUSE_HERO/);
  assert.match(workflows,/context\.heroOnly && cycle===1/);
  assert.match(workflows,/buildZeroPhotoPremiumSpec/);
});
