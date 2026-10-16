import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const reconcile=fs.readFileSync(new URL("../src/render-v2/reconcile.js",import.meta.url),"utf8");
const workflows=fs.readFileSync(new URL("../src/render-v2/workflows.js",import.meta.url),"utf8");
const hero=fs.readFileSync(new URL("../src/render-v2/hero.js",import.meta.url),"utf8");
const inputPack=fs.readFileSync(new URL("../src/render-v2/input-pack.js",import.meta.url),"utf8");

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
  assert.match(reconcile,/if\(attempts>=3\) \{/);
  assert.match(reconcile,/reason:"AUTO_RECOVERY_LIMIT",slots_used:0/);
});

test("queue recovery never marks a pack GENERATING when no workflow launched",()=>{
  const guard=reconcile.indexOf("if(launched.length===0)");
  const mark=reconcile.indexOf('await setPackStatus(sql,pack.id,"GENERATING",{auto_recovery_attempt:attempt,auto_recovery_run_key:runKey});',guard);
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
