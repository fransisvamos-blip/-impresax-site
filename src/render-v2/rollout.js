import { db, persistWorkflow, setPackStatus } from "./db.js";
import { createShadowInputPack } from "./input-pack.js";

export const GOLDEN_CASES=[
  {code:"CZ-063",expected:"PASS"},
  {code:"CZ-031",expected:"PASS"},
  {code:"CZ-209",expected:"PASS"},
  {code:"CZ-210",expected:"PASS"},
  {code:"CZ-097",expected:"PASS"},
  {code:"CZ-183",expected:"INPUT_BLOCKED"},
  {code:"CZ-089",expected:"INPUT_BLOCKED"},
  {code:"CZ-013",expected:"INPUT_BLOCKED"},
  {code:"CZ-016",expected:"INPUT_BLOCKED"},
  {code:"CZ-098",expected:"INPUT_BLOCKED"},
  {code:"CZ-042",expected:"INPUT_BLOCKED"},
  {code:"CZ-142",expected:"INPUT_BLOCKED"}
];

const ACTIVE_PACK_STATUSES=["PLANNING","GENERATING","PREVIEW_PARTIAL","PREVIEW_READY","QA_RUNNING","REWORK"];
const TERMINAL_PACK_STATUSES=["RENDER_READY","SELECTED","IMPLEMENTED","INPUT_BLOCKED","ESCALATION_REQUIRED","CANCELLED"];

function n(v){ return Number(v||0); }

async function rolloutRow(sql) {
  const rows=await sql`select * from render_v2_rollout_state where id=1 limit 1`;
  if(rows.length) return rows[0];
  const inserted=await sql`
    insert into render_v2_rollout_state(id,phase,queue_enabled,max_concurrency)
    values(1,'PILOT',false,3)
    returning *`;
  return inserted[0];
}

async function packGate(sql,packId) {
  const rows=await sql`
    select p.id,p.status,p.created_at,p.preview_ready_at,p.render_ready_at,p.metrics,p.metadata,
      (select count(*)::int from render_v2_variants v where v.render_pack_id=p.id) variant_count,
      (select count(*)::int from render_v2_variants v where v.render_pack_id=p.id and v.status='RENDER_READY' and v.certified_revision is not null) variants_ready,
      (select count(*)::int from render_qa_results_v2 q where q.render_pack_id=p.id and q.qa_type='SET_VISUAL' and q.status='PASS') set_qa_passes,
      (select count(*)::int from render_qa_results_v2 q
       join render_variant_revisions r on r.id=q.variant_revision_id
       where q.render_pack_id=p.id and q.qa_type='VARIANT_VISUAL'
         and (
           r.desktop_r2_key is null or r.mobile_r2_key is null
           or not exists (select 1 from render_artifacts_v2 a where a.variant_revision_id=r.id and a.artifact_type='DESKTOP_1440')
           or not exists (select 1 from render_artifacts_v2 a where a.variant_revision_id=r.id and a.artifact_type='MOBILE_390')
         )) qa_without_preview,
      (select count(*)::int from render_variant_revisions r
       join render_v2_variants v on v.id=r.variant_id
       where v.render_pack_id=p.id
         and r.created_at >= coalesce((p.metadata->>'budget_epoch_reset_at')::timestamptz,p.created_at)) epoch_revisions,
      (select count(*)::int from render_failures_v2 f
       where f.render_pack_id=p.id
         and f.created_at >= coalesce((p.metadata->>'budget_epoch_reset_at')::timestamptz,p.created_at)) epoch_failures,
      (select count(*)::int from render_workflows_v2 w
       where w.render_pack_id=p.id and w.status in ('QUEUED','RUNNING','PAUSED')) active_workflows
    from render_v2_packs p where p.id=${packId}::uuid limit 1`;
  const g=rows[0]||null;
  if(!g) return null;
  const threeDistinct=n(g.variant_count)===3;
  const allVariantsReady=n(g.variants_ready)===3;
  const setQaPass=n(g.set_qa_passes)>=1;
  const previewBeforeQa=n(g.qa_without_preview)===0;
  const boundedEpoch=n(g.epoch_revisions)<=18 && n(g.epoch_failures)<=18;
  return {
    ...g,
    invariants:{
      three_distinct_variants:threeDistinct,
      all_variants_ready:allVariantsReady,
      set_qa_pass:setQaPass,
      preview_before_deep_qa:previewBeforeQa,
      bounded_epoch:boundedEpoch,
      epoch_revisions:n(g.epoch_revisions),
      epoch_failures:n(g.epoch_failures)
    },
    pass:g.status==="RENDER_READY" && threeDistinct && allVariantsReady && setQaPass && previewBeforeQa && boundedEpoch
  };
}

async function zeroCreativeSpend(sql,packId) {
  const rows=await sql`
    select
      coalesce((p.metrics->>'ai_calls')::int,0) ai_calls,
      coalesce((p.metrics->>'prior_epoch_ai_calls')::int,0) prior_ai_calls,
      (select count(*)::int from render_v2_variants v where v.render_pack_id=p.id) variants,
      (select count(*)::int from render_creative_plans_v2 c where c.render_pack_id=p.id) creative_plans,
      (select count(*)::int from render_direction_plans_v2 d where d.render_pack_id=p.id) direction_plans
    from render_v2_packs p where p.id=${packId}::uuid limit 1`;
  const x=rows[0]||{};
  return {
    ai_calls:n(x.ai_calls)+n(x.prior_ai_calls),
    variants:n(x.variants),
    creative_plans:n(x.creative_plans),
    direction_plans:n(x.direction_plans),
    pass:n(x.ai_calls)+n(x.prior_ai_calls)===0 && n(x.variants)===0 && n(x.creative_plans)===0 && n(x.direction_plans)===0
  };
}

async function latestParent(sql,packId) {
  const rows=await sql`
    select * from render_workflows_v2
    where render_pack_id=${packId}::uuid and workflow_type='PROSPECT'
    order by created_at desc limit 1`;
  return rows[0]||null;
}

async function startParent(env,sql,pack,{reason="ROLLOUT",forceNew=false}={}) {
  const prior=await latestParent(sql,pack.id);
  if(prior && ["QUEUED","RUNNING","PAUSED"].includes(prior.status)) {
    return {started:false,instance_id:prior.workflow_instance_id,status:prior.status};
  }
  if(!forceNew && prior && prior.status==="COMPLETED") {
    return {started:false,instance_id:prior.workflow_instance_id,status:prior.status};
  }
  const seq=await sql`
    select count(*)::int n from render_workflows_v2
    where render_pack_id=${pack.id}::uuid and workflow_type='PROSPECT'`;
  const suffix=n(seq[0]?.n)+1;
  const instanceId=suffix===1 ? "rpv2-"+pack.id : "rpv2-"+reason.toLowerCase()+"-"+pack.id+"-"+suffix;
  await persistWorkflow(sql,{
    prospectId:pack.prospect_id,packId:pack.id,type:"PROSPECT",instanceId,status:"QUEUED",
    metadata:{input_pack_id:pack.input_pack_id,rollout_reason:reason}
  });
  const instance=await env.RENDER_PROSPECT_WORKFLOW.create({
    id:instanceId,
    params:{prospectId:pack.prospect_id,packId:pack.id,inputPackId:pack.input_pack_id}
  });
  return {started:true,instance_id:instanceId,status:await instance.status()};
}

async function maybeStartFinalizer(env,sql,pack,gate) {
  if(!gate || n(gate.variants_ready)!==3 || n(gate.set_qa_passes)>0) return null;
  const rows=await sql`
    select count(*)::int total,
           count(*) filter (where status in ('QUEUED','RUNNING','PAUSED'))::int active
    from render_workflows_v2
    where render_pack_id=${pack.id}::uuid
      and workflow_type='PROSPECT'
      and coalesce((metadata->>'rollout_finalizer')::boolean,false)=true`;
  if(n(rows[0]?.active)>0 || n(rows[0]?.total)>=5) return null;
  const attempt=n(rows[0]?.total)+1;
  const instanceId="rpv2-finalize-"+pack.id+"-"+attempt;
  await persistWorkflow(sql,{
    prospectId:pack.prospect_id,packId:pack.id,type:"PROSPECT",instanceId,status:"QUEUED",
    metadata:{input_pack_id:pack.input_pack_id,rollout_finalizer:true,finalizer_attempt:attempt}
  });
  const instance=await env.RENDER_PROSPECT_WORKFLOW.create({
    id:instanceId,
    params:{prospectId:pack.prospect_id,packId:pack.id,inputPackId:pack.input_pack_id}
  });
  return {instance_id:instanceId,status:await instance.status(),attempt};
}

async function upsertGolden(sql,{code,expected,packId=null,actual=null,status,validation={}}) {
  const completed=status.startsWith("PASS_")||status.startsWith("FAIL_");
  const rows=await sql`
    insert into render_v2_golden_cases(code,expected_input,pack_id,actual_input,status,validation,started_at,completed_at,updated_at)
    values(${code},${expected},${packId}::uuid,${actual},${status},${JSON.stringify(validation)}::jsonb,now(),
      ${completed?new Date().toISOString():null}::timestamptz,now())
    on conflict(code) do update set
      expected_input=excluded.expected_input,
      pack_id=coalesce(excluded.pack_id,render_v2_golden_cases.pack_id),
      actual_input=excluded.actual_input,
      status=excluded.status,
      validation=excluded.validation,
      started_at=coalesce(render_v2_golden_cases.started_at,excluded.started_at),
      completed_at=case when excluded.completed_at is not null then excluded.completed_at else render_v2_golden_cases.completed_at end,
      updated_at=now()
    returning *`;
  return rows[0];
}

async function tickGolden(env,sql,state,pilotCreated,pilotGate) {
  const results=[];
  const pilotStatus=pilotGate?.pass?"PASS_RENDERED":"RUNNING";
  results.push(await upsertGolden(sql,{
    code:"CZ-063",expected:"PASS",packId:pilotCreated.pack.id,actual:"PASS",
    status:pilotStatus,validation:pilotGate||{}
  }));
  if(!pilotGate?.pass) return {complete:false,results};

  await sql`
    update render_v2_rollout_state
    set phase='GOLDEN',pilot_pack_id=${pilotCreated.pack.id}::uuid,
        pilot_passed_at=coalesce(pilot_passed_at,now()),
        golden_started_at=coalesce(golden_started_at,now()),
        updated_at=now()
    where id=1`;

  const active=await sql`
    select count(*)::int n from render_v2_packs
    where shadow_mode=true and status=any(${ACTIVE_PACK_STATUSES})`;
  let slots=Math.max(0,n(state.max_concurrency)-n(active[0]?.n));

  for(const test of GOLDEN_CASES.filter(x=>x.code!=="CZ-063")) {
    const created=await createShadowInputPack(env,test.code);
    const inputPass=created.input_pack?.certification_status==="PASS";
    if(test.expected==="INPUT_BLOCKED") {
      if(inputPass) {
        results.push(await upsertGolden(sql,{
          code:test.code,expected:test.expected,packId:created.pack.id,actual:"PASS",
          status:"FAIL_INPUT_MISMATCH",validation:{issues:created.input_pack?.certification_issues||[]}
        }));
      } else {
        const zero=await zeroCreativeSpend(sql,created.pack.id);
        results.push(await upsertGolden(sql,{
          code:test.code,expected:test.expected,packId:created.pack.id,actual:"INPUT_BLOCKED",
          status:zero.pass?"PASS_BLOCKED":"FAIL_BLOCKED_SPEND",validation:zero
        }));
      }
      continue;
    }

    if(!inputPass) {
      results.push(await upsertGolden(sql,{
        code:test.code,expected:test.expected,packId:created.pack.id,actual:"INPUT_BLOCKED",
        status:"FAIL_INPUT_MISMATCH",validation:{issues:created.input_pack?.certification_issues||[]}
      }));
      continue;
    }

    const gate=await packGate(sql,created.pack.id);
    if(gate?.pass) {
      results.push(await upsertGolden(sql,{
        code:test.code,expected:test.expected,packId:created.pack.id,actual:"PASS",
        status:"PASS_RENDERED",validation:gate
      }));
      continue;
    }

    if(n(gate?.variants_ready)===3 && n(gate?.set_qa_passes)===0) {
      await maybeStartFinalizer(env,sql,created.pack,gate);
    } else if(slots>0 && !TERMINAL_PACK_STATUSES.includes(String(created.pack.status||""))) {
      const parent=await startParent(env,sql,created.pack,{reason:"GOLDEN",forceNew:false});
      if(parent.started) slots--;
    } else if(slots>0 && created.pack.status==="ESCALATION_REQUIRED") {
      const parent=await startParent(env,sql,created.pack,{reason:"GOLDEN_RECOVERY",forceNew:true});
      if(parent.started) slots--;
    }
    results.push(await upsertGolden(sql,{
      code:test.code,expected:test.expected,packId:created.pack.id,actual:"PASS",
      status:"RUNNING",validation:gate||{}
    }));
  }

  const rows=await sql`select code,status from render_v2_golden_cases order by code`;
  const byCode=new Map(rows.map(x=>[x.code,x.status]));
  const allPresent=GOLDEN_CASES.every(x=>byCode.has(x.code));
  const allPass=allPresent && GOLDEN_CASES.every(x=>String(byCode.get(x.code)||"").startsWith("PASS_"));
  if(allPass) {
    await sql`
      update render_v2_rollout_state
      set phase='CHAOS',golden_passed_at=coalesce(golden_passed_at,now()),
          chaos_started_at=coalesce(chaos_started_at,now()),updated_at=now()
      where id=1`;
  }
  return {complete:allPass,results};
}

async function tickChaos(env,sql) {
  const probeKey="render-v2-live-recovery-v1";
  const rows=await sql`select * from render_v2_chaos_probes where probe_key=${probeKey} limit 1`;
  const probe=rows[0]||null;
  if(probe?.completed) {
    const pass=n(probe.side_effect_count)===1 && n(probe.transient_attempts)>=2 && probe.transient_seen===true && probe.status==="PASS";
    if(pass) {
      await sql`
        update render_v2_rollout_state
        set phase='QUEUE_READY',chaos_passed_at=coalesce(chaos_passed_at,now()),
            queue_enabled=true,updated_at=now()
        where id=1`;
    }
    return {pass,probe};
  }

  if(!probe) {
    const instanceId="rv2-chaos-"+probeKey;
    await sql`
      insert into render_v2_chaos_probes(probe_key,workflow_instance_id,status,details)
      values(${probeKey},${instanceId},'QUEUED',${JSON.stringify({purpose:"LIVE_RETRY_IDEMPOTENCY_RECOVERY"})}::jsonb)
      on conflict(probe_key) do nothing`;
    const instance=await env.RENDER_CHAOS_WORKFLOW.create({id:instanceId,params:{probeKey}});
    return {pass:false,started:true,instance_id:instanceId,status:await instance.status()};
  }

  return {pass:false,probe};
}

async function drainQueue(env,sql,state) {
  if(!state.queue_enabled) return {enabled:false,started:[],blocked:[]};
  const active=await sql`
    select count(*)::int n from render_v2_packs
    where shadow_mode=true and status=any(${ACTIVE_PACK_STATUSES})`;
  let slots=Math.max(0,n(state.max_concurrency)-n(active[0]?.n));
  if(slots<=0) return {enabled:true,started:[],blocked:[],slots:0};

  const prospects=await sql`
    select p.id,p.rank,p.business_name
    from prospects p
    where p.rank is not null and p.rank<=50
      and not exists (select 1 from render_v2_packs rp where rp.prospect_id=p.id)
    order by p.rank
    limit 30`;

  const started=[],blocked=[];
  for(const prospect of prospects) {
    if(slots<=0) break;
    const created=await createShadowInputPack(env,prospect.id);
    if(created.input_pack?.certification_status!=="PASS") {
      blocked.push({prospect_id:prospect.id,rank:prospect.rank,name:prospect.business_name,issues:created.input_pack?.certification_issues||[]});
      continue;
    }
    const parent=await startParent(env,sql,created.pack,{reason:"QUEUE"});
    if(parent.started) {
      slots--;
      started.push({prospect_id:prospect.id,rank:prospect.rank,name:prospect.business_name,pack_id:created.pack.id,workflow_instance_id:parent.instance_id});
    }
  }
  return {enabled:true,started,blocked,slots};
}

export async function rolloutStatus(env) {
  const sql=db(env);
  const state=await rolloutRow(sql);
  const golden=await sql`select * from render_v2_golden_cases order by code`;
  const chaos=await sql`select * from render_v2_chaos_probes order by created_at desc limit 5`;
  return {state,golden,chaos};
}

export async function tickRollout(env) {
  const sql=db(env);
  let state=await rolloutRow(sql);
  await sql`update render_v2_rollout_state set last_tick_at=now(),updated_at=now() where id=1`;

  if(state.queue_enabled) {
    const queue=await drainQueue(env,sql,state);
    return {phase:state.phase,queue_enabled:true,queue};
  }

  const pilot=await createShadowInputPack(env,"CZ-063");
  const pilotGate=await packGate(sql,pilot.pack.id);
  await sql`
    update render_v2_rollout_state
    set pilot_pack_id=${pilot.pack.id}::uuid,
        metadata=metadata||${JSON.stringify({pilot_gate_checked_at:new Date().toISOString()})}::jsonb,
        updated_at=now()
    where id=1`;

  if(!pilotGate?.pass) {
    if(n(pilotGate?.variants_ready)===3 && n(pilotGate?.set_qa_passes)===0) {
      await maybeStartFinalizer(env,sql,pilot.pack,pilotGate);
    }
    return {phase:"PILOT",pilot_pack_id:pilot.pack.id,pilot:pilotGate};
  }

  state=await rolloutRow(sql);
  const golden=await tickGolden(env,sql,state,pilot,pilotGate);
  if(!golden.complete) return {phase:"GOLDEN",pilot:pilotGate,golden};

  const chaos=await tickChaos(env,sql);
  state=await rolloutRow(sql);
  if(!chaos.pass) return {phase:"CHAOS",golden_complete:true,chaos};

  state=await rolloutRow(sql);
  const queue=await drainQueue(env,sql,state);
  return {phase:"QUEUE_READY",golden_complete:true,chaos,queue};
}
