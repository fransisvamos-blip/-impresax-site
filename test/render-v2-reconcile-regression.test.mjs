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
  assert.match(workflows,/\["ENGINE_CONTRACT_UPGRADE","QUEUE_AUTO_RECOVERY"\]\.includes\(String\(feedback\?\.reason\|\|""\)\)/);
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
