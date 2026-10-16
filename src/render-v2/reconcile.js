import { db, persistWorkflow, updateWorkflow, setPackStatus, setVariantStatus } from "./db.js";
import { renderConcurrencyState, activeVariantWorkflowRows, unstartedInitialVariants } from "./concurrency.js";
import { prospectCircuitState, packCircuitOverridePending, consumePackCircuitOverride } from "./circuit.js";
import { QUALITY_CONTRACT_VERSION, EXECUTION_ENGINE_VERSION, MODEL_ROUTE_VERSION, COMPILER_VERSION } from "./constants.js";
const QUALITY_UPGRADE_MAX_ATTEMPTS=3;

function platformStatus(value) {
  const raw=typeof value==="string" ? value : value?.status;
  return String(raw||"unknown").toLowerCase();
}

function dbStatus(platform) {
  if(platform==="complete") return "COMPLETED";
  if(platform==="errored") return "FAILED";
  if(platform==="terminated") return "CANCELLED";
  if(platform==="paused"||platform==="waitingforpause") return "PAUSED";
  if(platform==="queued") return "QUEUED";
  return "RUNNING";
}

function bindingFor(env,type) {
  return type==="VARIANT" ? env.RENDER_VARIANT_WORKFLOW : env.RENDER_PROSPECT_WORKFLOW;
}

function workflowEpochTag(value) {
  const raw=String(value||"").trim();
  const ms=Date.parse(raw);
  if(Number.isFinite(ms)) return "t"+Math.trunc(ms).toString(36);
  let h=2166136261;
  for(let i=0;i<raw.length;i++) {
    h^=raw.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return raw ? "h"+(h>>>0).toString(36) : "base";
}

async function enforceProspectCircuitBreakers(env,sql) {
  const rows=await sql`
    select w.workflow_instance_id,w.render_pack_id,w.variant_id,w.metadata,
           p.prospect_id,pr.retry_count,pr.max_retries,pr.error,pr.current_step
    from render_workflows_v2 w
    join render_v2_packs p on p.id=w.render_pack_id
    join prospects pr on pr.id=p.prospect_id
    where w.workflow_type='VARIANT'
      and w.status in ('QUEUED','RUNNING','PAUSED')
      and (
        pr.retry_count>=pr.max_retries
        or pr.error='GENERATION_CIRCUIT_BREAKER'
        or pr.current_step='GENERATION_HOLD'
      )
      and coalesce((w.metadata->>'circuit_breaker_override')::boolean,false)=false`;
  const terminated=[];
  for(const row of rows) {
    try {
      const instance=await env.RENDER_VARIANT_WORKFLOW.get(row.workflow_instance_id);
      await instance.terminate({rollback:false});
    } catch {}
    await updateWorkflow(sql,row.workflow_instance_id,{
      status:"CANCELLED",
      currentStep:"CIRCUIT_BREAKER_HOLD",
      errorCode:"GENERATION_CIRCUIT_BREAKER",
      metadata:{circuit_breaker_enforced:true,circuit_breaker_enforced_at:new Date().toISOString()}
    });
    if(row.variant_id) {
      await setVariantStatus(sql,row.variant_id,{status:"ESCALATION_REQUIRED"});
    }
    await setPackStatus(sql,row.render_pack_id,"ESCALATION_REQUIRED",{
      circuit_breaker_enforced:true,
      circuit_breaker_enforced_at:new Date().toISOString()
    });
    terminated.push(row.workflow_instance_id);
  }
  return terminated;
}

async function enforceGlobalVariantConcurrency(env,sql) {
  const state=await renderConcurrencyState(sql);
  const rows=await activeVariantWorkflowRows(sql);
  const live=[];

  for(const row of rows) {
    try {
      const instance=await env.RENDER_VARIANT_WORKFLOW.get(row.workflow_instance_id);
      const current=await instance.status();
      const pstatus=platformStatus(current);
      const mapped=dbStatus(pstatus);
      if(!["QUEUED","RUNNING","PAUSED"].includes(mapped)) {
        await updateWorkflow(sql,row.workflow_instance_id,{
          status:mapped,
          currentStep:null,
          errorCode:pstatus==="errored"?"PLATFORM_WORKFLOW_ERRORED":null,
          metadata:{platform_status:pstatus,concurrency_reconciled_at:new Date().toISOString()}
        });
        continue;
      }
      live.push({...row,instance,platform_status:pstatus});
    } catch(error) {
      await updateWorkflow(sql,row.workflow_instance_id,{
        status:"FAILED",
        currentStep:"CONCURRENCY_STATUS_FAILED",
        errorCode:"PLATFORM_STATUS_UNAVAILABLE",
        metadata:{concurrency_status_error:String(error?.message||error)}
      });
    }
  }

  const keep=live.slice(0,state.limit);
  const excess=live.slice(state.limit);
  const affectedPacks=new Set();

  for(const row of excess) {
    try { await row.instance.terminate({rollback:false}); } catch {}
    await updateWorkflow(sql,row.workflow_instance_id,{
      status:"CANCELLED",
      currentStep:"CONCURRENCY_DEFERRED",
      errorCode:null,
      metadata:{
        concurrency_deferred:true,
        concurrency_limit:state.limit,
        deferred_at:new Date().toISOString()
      }
    });
    affectedPacks.add(row.render_pack_id);
  }

  for(const packId of affectedPacks) {
    const rows2=await sql`
      select
        (select count(*)::int from render_workflows_v2 w
         where w.render_pack_id=${packId}::uuid
           and w.workflow_type='VARIANT'
           and w.status in ('QUEUED','RUNNING','PAUSED')) active_variants,
        (select count(*)::int from render_v2_variants v
         where v.render_pack_id=${packId}::uuid
           and not (v.status='RENDER_READY' and v.certified_revision is not null)) pending_variants`;
    const x=rows2[0]||{};
    if(Number(x.active_variants||0)===0 && Number(x.pending_variants||0)>0) {
      await setPackStatus(sql,packId,"ESCALATION_REQUIRED",{
        concurrency_deferred:true,
        concurrency_limit:state.limit,
        concurrency_deferred_at:new Date().toISOString()
      });
    }
  }

  return {
    limit:state.limit,
    active_before:live.length,
    kept:keep.map(x=>x.workflow_instance_id),
    cancelled:excess.map(x=>x.workflow_instance_id),
    slots:Math.max(0,state.limit-keep.length)
  };
}

async function fillUnstartedInitialVariants(env,sql,availableSlots) {
  let slots=Math.max(0,Number(availableSlots||0));
  const launched=[];
  if(slots<=0) return {launched,slots};

  const pending=await unstartedInitialVariants(sql,30);
  for(const row of pending) {
    if(slots<=0) break;
    const instanceId="rv2-"+row.render_pack_id+"-"+row.variant_key+"-initial";
    await persistWorkflow(sql,{
      prospectId:row.prospect_id,
      packId:row.render_pack_id,
      variantId:row.variant_id,
      type:"VARIANT",
      instanceId,
      status:"QUEUED",
      metadata:{variant_key:row.variant_key,event_prefix:"initial",concurrency_scheduled:true}
    });
    const params={
      prospectId:row.prospect_id,
      packId:row.render_pack_id,
      inputPackId:row.input_pack_id,
      variantId:row.variant_id,
      variantKey:row.variant_key,
      parentInstanceId:row.parent_instance_id,
      eventPrefix:"initial"
    };
    try { await env.RENDER_VARIANT_WORKFLOW.create({id:instanceId,params}); }
    catch { await env.RENDER_VARIANT_WORKFLOW.get(instanceId); }
    await setPackStatus(sql,row.render_pack_id,"GENERATING",{
      variant_spawn_pending:true,
      deferred_concurrency_released_at:new Date().toISOString()
    });
    launched.push({pack_id:row.render_pack_id,variant_key:row.variant_key,instance_id:instanceId});
    slots--;
  }
  return {launched,slots};
}


function contractSlug(value) {
  return String(value||"quality").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,42);
}


async function preemptLowerPriorityRecoveryForQualityUpgrade(env,sql) {
  const state=await renderConcurrencyState(sql);
  if(state.slots>=state.limit) return {preempted:[],slots_added:0,target:null};

  const targets=await sql`
    select p.id,pr.rank,pr.business_name
    from render_v2_packs p
    join prospects pr on pr.id=p.prospect_id
    where p.shadow_mode=true
      and p.approved_reference=false
      and p.selected_variant_revision_id is null
      and (
        (pr.retry_count<pr.max_retries and coalesce(pr.error,'')<>'GENERATION_CIRCUIT_BREAKER' and coalesce(pr.current_step,'')<>'GENERATION_HOLD')
        or coalesce((p.metadata->>'generation_circuit_breaker_override_pending')::boolean,false)=true
      )
      and (
        (
          p.status='RENDER_READY'
          and p.quality_contract_version<>${QUALITY_CONTRACT_VERSION}
          and (select count(*) from render_v2_variants v
               where v.render_pack_id=p.id and v.status='RENDER_READY' and v.certified_revision is not null)=3
        )
        or
        (
          p.status in ('GENERATING','ESCALATION_REQUIRED','REWORK','PREVIEW_PARTIAL','PREVIEW_READY','QA_RUNNING')
          and p.quality_contract_version=${QUALITY_CONTRACT_VERSION}
          and p.metadata->>'quality_upgrade_to'=${QUALITY_CONTRACT_VERSION}
        )
      )
    order by
      case when p.metadata->>'quality_upgrade_to'=${QUALITY_CONTRACT_VERSION} then 0 else 1 end,
      pr.rank asc nulls last,p.priority asc,p.render_ready_at asc nulls first
    limit 1`;
  if(!targets.length) return {preempted:[],slots_added:0,target:null};

  const target=targets[0];
  const targetRank=Number(target.rank ?? 2147483647);
  const desiredSlots=Math.min(3,state.limit);
  let need=Math.max(0,desiredSlots-state.slots);
  if(need<=0) return {preempted:[],slots_added:0,target};

  const lower=await sql`
    select w.workflow_instance_id,w.render_pack_id,w.variant_id,w.metadata,
           pr.rank,pr.business_name
    from render_workflows_v2 w
    join render_v2_packs p on p.id=w.render_pack_id
    join prospects pr on pr.id=p.prospect_id
    where w.workflow_type='VARIANT'
      and w.status in ('QUEUED','RUNNING','PAUSED')
      and coalesce((w.metadata->>'auto_recovery')::boolean,false)=true
      and coalesce(pr.rank,2147483647)>${targetRank}
    order by pr.rank desc nulls first,w.created_at desc`;

  const preempted=[];
  const affected=new Map();
  for(const row of lower) {
    if(need<=0) break;
    try {
      const instance=await env.RENDER_VARIANT_WORKFLOW.get(row.workflow_instance_id);
      await instance.terminate({rollback:false});
    } catch {}
    await updateWorkflow(sql,row.workflow_instance_id,{
      status:"CANCELLED",
      currentStep:"PRIORITY_PREEMPTED",
      errorCode:null,
      metadata:{
        priority_preempted:true,
        priority_preempted_at:new Date().toISOString(),
        preempted_for_pack_id:target.id,
        preempted_for_rank:target.rank
      }
    });
    preempted.push({
      workflow_instance_id:row.workflow_instance_id,
      pack_id:row.render_pack_id,
      business_name:row.business_name,
      rank:row.rank
    });
    const attempt=Number(row.metadata?.auto_recovery_attempt||0);
    const existing=affected.get(row.render_pack_id)||{attempt,business_name:row.business_name,rank:row.rank};
    existing.attempt=Math.max(existing.attempt,attempt);
    affected.set(row.render_pack_id,existing);
    need--;
  }

  for(const [packId,info] of affected.entries()) {
    const activeRows=await sql`
      select count(*)::int n
      from render_workflows_v2
      where render_pack_id=${packId}::uuid
        and workflow_type='VARIANT'
        and status in ('QUEUED','RUNNING','PAUSED')`;
    if(Number(activeRows[0]?.n||0)===0) {
      const restoredAttempt=Math.max(0,Number(info.attempt||0)-1);
      await sql`
        update render_v2_packs
        set status='ESCALATION_REQUIRED',
            metadata=(coalesce(metadata,'{}'::jsonb)
              || jsonb_build_object(
                'auto_recovery_attempt',${restoredAttempt},
                'priority_preempted_at',to_jsonb(now()),
                'priority_preempted_for_pack_id',${target.id}::text,
                'priority_preempted_for_rank',${String(target.rank??"")}::text,
                'priority_preemption_retry_restored',true
              )),
            updated_at=now()
        where id=${packId}::uuid`;
    }
  }

  return {
    target:{pack_id:target.id,business_name:target.business_name,rank:target.rank},
    preempted,
    slots_added:preempted.length
  };
}

async function upgradeLegacyReadyPack(env,sql,availableSlots) {
  let slots=Math.max(0,Number(availableSlots||0));
  if(slots<=0) return {started:false,reason:"CONCURRENCY_CAP",slots_used:0};

  const rows=await sql`
    select p.*,pr.rank,pr.business_name,pr.retry_count,pr.max_retries,pr.error as prospect_error,pr.current_step as prospect_current_step
    from render_v2_packs p
    join prospects pr on pr.id=p.prospect_id
    where p.shadow_mode=true
      and p.approved_reference=false
      and p.selected_variant_revision_id is null
      and (
        (
          p.status='RENDER_READY'
          and p.quality_contract_version<>${QUALITY_CONTRACT_VERSION}
          and (select count(*) from render_v2_variants v
               where v.render_pack_id=p.id and v.status='RENDER_READY' and v.certified_revision is not null)=3
        )
        or
        (
          p.status in ('GENERATING','ESCALATION_REQUIRED','REWORK','PREVIEW_PARTIAL','PREVIEW_READY','QA_RUNNING')
          and p.quality_contract_version=${QUALITY_CONTRACT_VERSION}
          and p.metadata->>'quality_upgrade_to'=${QUALITY_CONTRACT_VERSION}
        )
      )
    order by
      case when p.metadata->>'quality_upgrade_to'=${QUALITY_CONTRACT_VERSION} then 0 else 1 end,
      pr.rank asc nulls last,p.priority asc,p.render_ready_at asc nulls first
    limit 1`;
  if(!rows.length) return {started:false,reason:"NO_LEGACY_READY_PACK",slots_used:0};

  const pack=rows[0];
  const qualityCircuitOpen=
    Number(pack.retry_count||0)>=Number(pack.max_retries||3) ||
    String(pack.prospect_error||"")==="GENERATION_CIRCUIT_BREAKER" ||
    String(pack.prospect_current_step||"")==="GENERATION_HOLD";
  const qualityOverridePending=qualityCircuitOpen
    ? await packCircuitOverridePending(sql,pack.id)
    : false;
  if(qualityCircuitOpen && !qualityOverridePending) {
    return {started:false,reason:"PROSPECT_CIRCUIT_BREAKER",pack_id:pack.id,slots_used:0};
  }
  let qualityCircuitOverride=false;

  const variants=await sql`
    select v.*,
           r.id certified_revision_id,
           r.compiler_version certified_compiler_version,
           exists(
             select 1 from render_workflows_v2 w
             where w.variant_id=v.id
               and w.workflow_type='VARIANT'
               and w.status in ('QUEUED','RUNNING','PAUSED')
           ) active_variant_workflow,
           (select count(*)::int
              from render_workflows_v2 qw
             where qw.variant_id=v.id
               and qw.workflow_type='VARIANT'
               and coalesce((qw.metadata->>'quality_contract_upgrade')::boolean,false)=true
           ) quality_attempts
    from render_v2_variants v
    left join render_variant_revisions r on r.variant_id=v.id and r.revision=v.certified_revision
    where v.render_pack_id=${pack.id}::uuid
    order by v.variant_key`;
  if(variants.length!==3) return {started:false,reason:"THREE_VARIANTS_REQUIRED",pack_id:pack.id,slots_used:0};

  const firstUpgrade=String(pack.metadata?.quality_upgrade_to||"")!==QUALITY_CONTRACT_VERSION;
  const previousContract=firstUpgrade?pack.quality_contract_version:(pack.metadata?.quality_upgrade_from||pack.quality_contract_version);
  const runKey=contractSlug(QUALITY_CONTRACT_VERSION);

  if(firstUpgrade) {
    if(variants.some(v=>!v.certified_revision_id)) {
      return {started:false,reason:"THREE_CERTIFIED_VARIANTS_REQUIRED",pack_id:pack.id,slots_used:0};
    }
    await sql`
      update render_v2_packs
      set status='GENERATING',
          quality_contract_version=${QUALITY_CONTRACT_VERSION}::text,
          execution_engine_version=${EXECUTION_ENGINE_VERSION}::text,
          model_route_version=${MODEL_ROUTE_VERSION}::text,
          render_ready_at=null,
          metrics=
            (coalesce(metrics,'{}'::jsonb)-'ai_calls'-'browser_captures'-'budget_epoch'-'previous_budget_epoch')
            || jsonb_build_object(
              'ai_calls',0,
              'browser_captures',0,
              'prior_epoch_ai_calls',coalesce((metrics->>'prior_epoch_ai_calls')::int,0)+coalesce((metrics->>'ai_calls')::int,0),
              'prior_epoch_browser_captures',coalesce((metrics->>'prior_epoch_browser_captures')::int,0)+coalesce((metrics->>'browser_captures')::int,0),
              'budget_epoch',${runKey}::text,
              'previous_budget_epoch',coalesce(metrics->>'budget_epoch','')
            ),
          metadata=(coalesce(metadata,'{}'::jsonb)-'error')
            || jsonb_build_object(
              'quality_upgrade_from',${previousContract}::text,
              'quality_upgrade_to',${QUALITY_CONTRACT_VERSION}::text,
              'quality_upgrade_started_at',to_jsonb(now()),
              'quality_upgrade_mode','STAGED_GLOBAL_CONCURRENCY'
            ),
          updated_at=now()
      where id=${pack.id}::uuid`;
  }

  const launched=[];
  const exhaustedKeys=[];
  for(const variant of variants) {
    if(slots<=0) break;
    const alreadyCurrent=
      variant.status==="RENDER_READY" &&
      variant.certified_revision_id &&
      String(variant.certified_compiler_version||"")===COMPILER_VERSION;
    if(alreadyCurrent || variant.active_variant_workflow) continue;

    const key=String(variant.variant_key);
    const priorAttempts=Number(variant.quality_attempts||0);
    const retryResetAt=String(pack.metadata?.quality_upgrade_retry_reset_at||"").trim();
    let effectiveAttempts=priorAttempts;
    if(retryResetAt) {
      const rows=await sql`
        select count(*)::int n
        from render_workflows_v2 qw
        where qw.variant_id=${variant.id}::uuid
          and qw.workflow_type='VARIANT'
          and coalesce((qw.metadata->>'quality_contract_upgrade')::boolean,false)=true
          and qw.created_at > ${retryResetAt}::timestamptz`;
      effectiveAttempts=Number(rows[0]?.n||0);
    }
    if(effectiveAttempts>=QUALITY_UPGRADE_MAX_ATTEMPTS) {
      exhaustedKeys.push(String(variant.variant_key));
      await setVariantStatus(sql,variant.id,{status:"ESCALATION_REQUIRED"});
      continue;
    }
    const attempt=effectiveAttempts+1;
    const retryEpoch=workflowEpochTag(retryResetAt||pack.updated_at||pack.created_at);
    const instanceId="rv2-"+pack.id+"-"+key+"-quality-"+runKey+"-"+attempt+"-"+retryEpoch;
    if(qualityCircuitOpen && launched.length>0) break;
    await setVariantStatus(sql,variant.id,{status:"GENERATING"});
    const reserved=await persistWorkflow(sql,{
      prospectId:pack.prospect_id,
      packId:pack.id,
      variantId:variant.id,
      type:"VARIANT",
      instanceId,
      status:"QUEUED",
      metadata:{
        variant_key:key,
        event_prefix:"quality-"+runKey,
        quality_contract_upgrade:true,
        quality_upgrade_attempt:attempt,
        quality_retry_epoch:retryEpoch,
        previous_quality_contract:previousContract,
        quality_contract_version:QUALITY_CONTRACT_VERSION,
        circuit_breaker_override_reserved:qualityCircuitOpen
      }
    });
    if(["COMPLETED","FAILED","CANCELLED"].includes(String(reserved?.status||""))) {
      await setVariantStatus(sql,variant.id,{status:"ESCALATION_REQUIRED"});
      continue;
    }
    if(qualityCircuitOpen) {
      qualityCircuitOverride=await consumePackCircuitOverride(sql,pack.id,"PREMIUM_HOME_QUALITY_RECOVERY");
      if(!qualityCircuitOverride) {
        await updateWorkflow(sql,instanceId,{
          status:"CANCELLED",
          currentStep:"CIRCUIT_OVERRIDE_NOT_AVAILABLE",
          errorCode:"GENERATION_CIRCUIT_BREAKER"
        });
        await setVariantStatus(sql,variant.id,{status:"ESCALATION_REQUIRED"});
        break;
      }
      await updateWorkflow(sql,instanceId,{
        status:"QUEUED",
        currentStep:"CIRCUIT_OVERRIDE_RESERVED",
        errorCode:null,
        metadata:{circuit_breaker_override:true,circuit_breaker_override_reserved:false}
      });
    }
    const params={
      prospectId:pack.prospect_id,
      packId:pack.id,
      inputPackId:pack.input_pack_id,
      variantId:variant.id,
      variantKey:key,
      parentInstanceId:null,
      eventPrefix:"quality-"+runKey,
      parentRevisionId:variant.certified_revision_id,
      initialFeedback:{
        reason:"ENGINE_CONTRACT_UPGRADE",
        issues:["Previous certified output predates the premium full-home contract."],
        actions:[
          "Preserve verified content, official identity and the approved visual direction.",
          "Rebuild the page as a complete premium homepage from header to footer.",
          "Hero must include headline, body and two designed actions.",
          "Use a premium integrated menu/header, substantial positioning, services and trust sections, strong commercial bridge, final CTA and premium footer.",
          "Reuse the already-approved HERO_VISUAL when it still passes the hero contract.",
          "Pass all deterministic premium-home DOM gates and all V3 visual QA scores at 8 or higher."
        ]
      }
    };
    try { await env.RENDER_VARIANT_WORKFLOW.create({id:instanceId,params}); }
    catch { await env.RENDER_VARIANT_WORKFLOW.get(instanceId); }
    if(pack.status!=="GENERATING" && launched.length===0) {
      await setPackStatus(sql,pack.id,"GENERATING",{
        quality_upgrade_to:QUALITY_CONTRACT_VERSION,
        quality_upgrade_mode:"STAGED_GLOBAL_CONCURRENCY"
      });
    }
    launched.push({
      variant_key:key,
      instance_id:instanceId,
      parent_revision_id:variant.certified_revision_id,
      attempt
    });
    slots--;
  }

  const remaining=variants.filter(v=>{
    const current=v.status==="RENDER_READY" &&
      v.certified_revision_id &&
      String(v.certified_compiler_version||"")===COMPILER_VERSION;
    return !current;
  }).length;

  if(!launched.length) {
    const activeRemaining=variants.filter(v=>{
      const current=v.status==="RENDER_READY" &&
        v.certified_revision_id &&
        String(v.certified_compiler_version||"")===COMPILER_VERSION;
      return !current && v.active_variant_workflow;
    }).length;
    const terminalExhausted=remaining>0 && activeRemaining===0 && exhaustedKeys.length>=remaining;
    if(terminalExhausted) {
      await setPackStatus(sql,pack.id,"ESCALATION_REQUIRED",{
        quality_upgrade_exhausted:true,
        quality_upgrade_exhausted_at:new Date().toISOString(),
        quality_upgrade_exhausted_variants:exhaustedKeys,
        ghost_generating_prevented:true
      });
      await sql`
        update prospects
        set render_status='ESCALATION_REQUIRED',
            current_step='QUALITY_RECOVERY_EXHAUSTED',
            error='V2_QUALITY_RECOVERY_EXHAUSTED',
            next_action='CABINA_RENDERING_REVIEW',
            updated_at=now()
        where id=${pack.prospect_id}::uuid
          and pipeline_status='RENDERING'`;
      return {
        started:false,
        reason:"QUALITY_UPGRADE_EXHAUSTED",
        pack_id:pack.id,
        slots_used:0,
        remaining,
        exhausted_variants:exhaustedKeys
      };
    }
    return {
      started:false,
      reason:remaining===0?"QUALITY_UPGRADE_VARIANTS_COMPLETE":"QUALITY_UPGRADE_WAITING",
      pack_id:pack.id,
      slots_used:0,
      remaining
    };
  }

  return {
    started:true,
    type:"QUALITY_CONTRACT_UPGRADE",
    pack_id:pack.id,
    prospect_id:pack.prospect_id,
    business_name:pack.business_name,
    rank:pack.rank,
    from:previousContract,
    to:QUALITY_CONTRACT_VERSION,
    launched,
    slots_used:launched.length,
    remaining
  };
}

async function startPackFinalizer(env,sql,pack,attempt) {
  const instanceId="rpv2-finalize-"+pack.id+"-"+attempt;
  await persistWorkflow(sql,{
    prospectId:pack.prospect_id,packId:pack.id,type:"PROSPECT",instanceId,status:"QUEUED",
    metadata:{finalizer:true,rollout_finalizer:true,finalizer_attempt:attempt,input_pack_id:pack.input_pack_id}
  });
  const instance=await env.RENDER_PROSPECT_WORKFLOW.create({
    id:instanceId,
    params:{prospectId:pack.prospect_id,packId:pack.id,inputPackId:pack.input_pack_id,finalizer:true}
  });
  return {pack_id:pack.id,instance_id:instanceId,status:await instance.status(),finalizer_attempt:attempt};
}

async function recoverEscalatedQueuePack(env,sql,pack,availableSlots) {
  const circuitState=await prospectCircuitState(sql,pack.prospect_id);
  const recoveryOverridePending=circuitState.open
    ? await packCircuitOverridePending(sql,pack.id)
    : false;
  if(circuitState.open && !recoveryOverridePending) {
    return {pack_id:pack.id,started:false,reason:"PROSPECT_CIRCUIT_BREAKER",slots_used:0};
  }
  let circuitOverride=false;

  const variants=await sql`
    select v.*,
      (select w.status from render_workflows_v2 w where w.variant_id=v.id and w.workflow_type='VARIANT'
       order by w.created_at desc limit 1) latest_workflow_status
    from render_v2_variants v
    where v.render_pack_id=${pack.id}::uuid
    order by v.variant_key`;

  if(variants.some(v=>["QUEUED","RUNNING","PAUSED"].includes(String(v.latest_workflow_status||"")))) {
    return {pack_id:pack.id,started:false,reason:"ACTIVE_WORKFLOW"};
  }

  const requiredCapacityBeforeRecovery=variants.length
    ? variants.filter(v=>!(v.status==="RENDER_READY" && v.certified_revision)).length
    : 3;
  if(Number(availableSlots||0)<requiredCapacityBeforeRecovery) {
    return {
      pack_id:pack.id,started:false,reason:"CONCURRENCY_CAP",
      required_slots:requiredCapacityBeforeRecovery,available_slots:Number(availableSlots||0),slots_used:0
    };
  }

  const attempts=Number(pack.metadata?.auto_recovery_attempt||0);
  if(attempts>=3) {
    const exhaustedAt=new Date().toISOString();
    await setPackStatus(sql,pack.id,"ESCALATION_REQUIRED",{
      auto_recovery_exhausted:true,
      auto_recovery_exhausted_at:pack.metadata?.auto_recovery_exhausted_at||exhaustedAt,
      recovery_exhausted:true,
      recovery_exhausted_at:pack.metadata?.recovery_exhausted_at||exhaustedAt,
      ghost_generating_closed:true,
      ghost_generating_closed_at:exhaustedAt,
      ghost_state_close_reason:"AUTO_RECOVERY_LIMIT_REACHED_NO_ACTIVE_WORKFLOW"
    });
    return {pack_id:pack.id,started:false,reason:"AUTO_RECOVERY_LIMIT",slots_used:0};
  }

  const attempt=attempts+1;
  const recoveryEpoch=workflowEpochTag(pack.updated_at||pack.metadata?.stale_generating_reconciled_at||pack.created_at);
  const runKey="auto-r"+attempt+"-"+recoveryEpoch;

  await sql`
    update render_v2_packs
    set metrics=
      (coalesce(metrics,'{}'::jsonb)-'ai_calls'-'browser_captures'-'budget_epoch'-'previous_budget_epoch')
      || jsonb_build_object(
        'ai_calls',0,'browser_captures',0,
        'prior_epoch_ai_calls',coalesce((metrics->>'prior_epoch_ai_calls')::int,0)+coalesce((metrics->>'ai_calls')::int,0),
        'prior_epoch_browser_captures',coalesce((metrics->>'prior_epoch_browser_captures')::int,0)+coalesce((metrics->>'browser_captures')::int,0),
        'budget_epoch',${runKey}::text,
        'previous_budget_epoch',coalesce(metrics->>'budget_epoch','')
      ),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'auto_recovery_attempt',${attempt}::int,
        'auto_recovery_run_key',${runKey}::text,
        'budget_epoch_reset_at',now(),
        'budget_epoch_reason','QUEUE_AUTO_RECOVERY'
      ),
      updated_at=now()
    where id=${pack.id}::uuid`;

  if(!variants.length) {
    if(circuitState.open) {
      circuitOverride=await consumePackCircuitOverride(sql,pack.id,"QUEUE_AUTO_RECOVERY_OVERRIDE");
      if(!circuitOverride) return {pack_id:pack.id,started:false,reason:"PROSPECT_CIRCUIT_BREAKER",slots_used:0};
    }
    const instanceId="rpv2-auto-"+pack.id+"-"+attempt;
    await persistWorkflow(sql,{
      prospectId:pack.prospect_id,packId:pack.id,type:"PROSPECT",instanceId,status:"QUEUED",
      metadata:{input_pack_id:pack.input_pack_id,auto_recovery:true,auto_recovery_attempt:attempt}
    });
    const instance=await env.RENDER_PROSPECT_WORKFLOW.create({
      id:instanceId,
      params:{prospectId:pack.prospect_id,packId:pack.id,inputPackId:pack.input_pack_id}
    });
    await setPackStatus(sql,pack.id,"PLANNING",{auto_recovery_attempt:attempt});
    return {pack_id:pack.id,started:true,type:"PROSPECT",instance_id:instanceId,status:await instance.status(),slots_used:3};
  }

  const pending=variants.filter(v=>!(v.status==="RENDER_READY" && v.certified_revision));
  const slots=Math.max(0,Number(availableSlots||0));
  const required=variants.length ? pending.length : 3;
  if(required===0) return {pack_id:pack.id,started:false,reason:"ALL_VARIANTS_READY",slots_used:0};
  if(slots<required) {
    return {pack_id:pack.id,started:false,reason:"CONCURRENCY_CAP",required_slots:required,available_slots:slots,slots_used:0};
  }
  const launched=[];
  for(const variant of pending) {
    if(circuitState.open) {
      if(launched.length>0) break;
      circuitOverride=await consumePackCircuitOverride(sql,pack.id,"QUEUE_AUTO_RECOVERY_OVERRIDE");
      if(!circuitOverride) break;
    }
    const instanceId="rv2-"+pack.id+"-"+variant.variant_key+"-"+runKey;
    await persistWorkflow(sql,{
      prospectId:pack.prospect_id,packId:pack.id,variantId:variant.id,type:"VARIANT",
      instanceId,status:"QUEUED",
      metadata:{variant_key:variant.variant_key,event_prefix:runKey,auto_recovery:true,auto_recovery_attempt:attempt,circuit_breaker_override:circuitOverride}
    });
    const instance=await env.RENDER_VARIANT_WORKFLOW.create({
      id:instanceId,
      params:{
        prospectId:pack.prospect_id,packId:pack.id,inputPackId:pack.input_pack_id,
        variantId:variant.id,variantKey:variant.variant_key,parentInstanceId:"rpv2-"+pack.id,eventPrefix:runKey,
        initialFeedback:{
          reason:"QUEUE_AUTO_RECOVERY",
          issues:["Typed failure recovery on the current V2 execution contract."],
          actions:["Preserve verified content and identity.","Retry only the uncertified variant.","Use the executable deterministic grammar when in ZERO_PHOTO_PREMIUM mode."]
        }
      }
    });
    launched.push({variant_key:variant.variant_key,instance_id:instanceId,status:await instance.status()});
  }
  if(launched.length===0) {
    const blockedAt=new Date().toISOString();
    await setPackStatus(sql,pack.id,"ESCALATION_REQUIRED",{
      recovery_launch_blocked:true,
      recovery_launch_blocked_at:blockedAt,
      recovery_launch_blocked_reason:circuitState.open&&!circuitOverride?"GENERATION_CIRCUIT_BREAKER":"NO_WORKFLOW_LAUNCHED",
      ghost_generating_prevented:true
    });
    return {
      pack_id:pack.id,
      started:false,
      reason:circuitState.open&&!circuitOverride?"PROSPECT_CIRCUIT_BREAKER":"NO_WORKFLOW_LAUNCHED",
      attempt,
      slots_used:0
    };
  }
  await setPackStatus(sql,pack.id,"GENERATING",{auto_recovery_attempt:attempt,auto_recovery_run_key:runKey});
  return {pack_id:pack.id,started:true,type:"VARIANT_SET",attempt,launched,slots_used:launched.length};
}

export async function startOrRecoverParent(env,sql,pack) {
  const instanceId="rpv2-"+pack.id;
  await persistWorkflow(sql,{
    prospectId:pack.prospect_id,packId:pack.id,type:"PROSPECT",instanceId,status:"QUEUED",
    metadata:{reconciler_started:true,input_pack_id:pack.input_pack_id}
  });
  let instance;
  try {
    instance=await env.RENDER_PROSPECT_WORKFLOW.create({
      id:instanceId,
      params:{prospectId:pack.prospect_id,packId:pack.id,inputPackId:pack.input_pack_id}
    });
  } catch {
    instance=await env.RENDER_PROSPECT_WORKFLOW.get(instanceId);
  }
  return {instance_id:instanceId,status:await instance.status()};
}

export async function reconcileV2(env) {
  const sql=db(env);
  const summary={started:[],reconciled:[],errors:[]};
  summary.circuit_breaker_terminated=await enforceProspectCircuitBreakers(env,sql);
  summary.concurrency=await enforceGlobalVariantConcurrency(env,sql);
  let renderSlots=summary.concurrency.slots;

  const priorityPreemption=await preemptLowerPriorityRecoveryForQualityUpgrade(env,sql);
  if(priorityPreemption.preempted.length) {
    summary.reconciled.push({
      reason:"QUALITY_UPGRADE_PRIORITY_PREEMPTION",
      target:priorityPreemption.target,
      preempted:priorityPreemption.preempted
    });
    renderSlots=(await renderConcurrencyState(sql)).slots;
  }

  if(renderSlots>0) {
    try {
      const upgrade=await upgradeLegacyReadyPack(env,sql,renderSlots);
      if(upgrade.started) {
        summary.started.push(upgrade);
        renderSlots=Math.max(0,renderSlots-Number(upgrade.slots_used||0));
      }
    } catch(error) {
      const message=String(error?.stack||error?.message||error).slice(0,4000);
      summary.errors.push({quality_contract_upgrade:true,error:message});
      try {
        await sql`
          update render_v2_rollout_state
          set metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
                'quality_upgrade_last_error',${message},
                'quality_upgrade_last_error_at',to_jsonb(now())
              ),
              updated_at=now()
          where id=1`;
      } catch {}
    }
  }

  const deferredPlanning=await sql`
    select p.id
    from render_v2_packs p
    where p.shadow_mode=true
      and p.status='GENERATING'
      and exists (
        select 1 from render_workflows_v2 pw
        where pw.render_pack_id=p.id
          and pw.workflow_type='PROSPECT'
          and pw.status in ('QUEUED','RUNNING','PAUSED')
          and coalesce((pw.metadata->>'finalizer')::boolean,false)=false
          and coalesce((pw.metadata->>'rollout_finalizer')::boolean,false)=false
      )
      and not exists (
        select 1 from render_workflows_v2 vw
        where vw.render_pack_id=p.id
          and vw.workflow_type='VARIANT'
          and vw.status in ('QUEUED','RUNNING','PAUSED')
      )
      and exists (
        select 1 from render_v2_variants v
        where v.render_pack_id=p.id
          and not (v.status='RENDER_READY' and v.certified_revision is not null)
          and not exists (
            select 1 from render_workflows_v2 anyvw
            where anyvw.variant_id=v.id and anyvw.workflow_type='VARIANT'
          )
      )
    order by p.updated_at
    limit 20`;
  for(const row of deferredPlanning) {
    await setPackStatus(sql,row.id,"PLANNING",{
      deferred_concurrency:true,
      variant_spawn_pending:true,
      deferred_concurrency_normalized_at:new Date().toISOString()
    });
    summary.reconciled.push({pack_id:row.id,from_status:"GENERATING",to_status:"PLANNING",reason:"INITIAL_VARIANTS_DEFERRED_CONCURRENCY"});
  }

  const initialFill=await fillUnstartedInitialVariants(env,sql,renderSlots);
  if(initialFill.launched.length) summary.started.push(...initialFill.launched);
  renderSlots=initialFill.slots;

  const orphanPacks=await sql`
    select p.id,p.prospect_id,p.input_pack_id
    from render_v2_packs p
    join render_input_packs i on i.id=p.input_pack_id
    join prospects pr on pr.id=p.prospect_id
    where p.shadow_mode=true
      and p.status='INPUT_READY'
      and i.certification_status='PASS'
      and pr.retry_count<pr.max_retries
      and coalesce(pr.error,'')<>'GENERATION_CIRCUIT_BREAKER'
      and coalesce(pr.current_step,'')<>'GENERATION_HOLD'
      and not exists (
        select 1 from render_workflows_v2 w
        where w.render_pack_id=p.id and w.workflow_type='PROSPECT'
      )
    order by p.priority,p.created_at
    limit 10`;

  for(const pack of orphanPacks) {
    if(renderSlots<3) break;
    try {
      const started=await startOrRecoverParent(env,sql,pack);
      summary.started.push(started);
      renderSlots=Math.max(0,renderSlots-3);
    } catch(error) {
      summary.errors.push({pack_id:pack.id,error:String(error?.message||error)});
    }
  }

  const finalizable=await sql`
    select p.id,p.prospect_id,p.input_pack_id,
           (select count(*)::int from render_workflows_v2 fw
            where fw.render_pack_id=p.id and fw.workflow_type='PROSPECT'
              and (
                coalesce((fw.metadata->>'finalizer')::boolean,false)=true
                or coalesce((fw.metadata->>'rollout_finalizer')::boolean,false)=true
                or fw.workflow_instance_id like 'rpv2-finalize-'||p.id::text||'-%'
              )) finalizer_count,
           (select coalesce(max(
              case
                when (fw.metadata->>'finalizer_attempt') ~ '^[0-9]+$'
                  then (fw.metadata->>'finalizer_attempt')::int
                else null
              end
            ),0)::int
            from render_workflows_v2 fw
            where fw.render_pack_id=p.id and fw.workflow_type='PROSPECT'
              and (
                coalesce((fw.metadata->>'finalizer')::boolean,false)=true
                or coalesce((fw.metadata->>'rollout_finalizer')::boolean,false)=true
                or fw.workflow_instance_id like 'rpv2-finalize-'||p.id::text||'-%'
              )) finalizer_max_attempt,
           (select count(*)::int from render_workflows_v2 fw
            where fw.render_pack_id=p.id and fw.workflow_type='PROSPECT'
              and (
                coalesce((fw.metadata->>'finalizer')::boolean,false)=true
                or coalesce((fw.metadata->>'rollout_finalizer')::boolean,false)=true
                or fw.workflow_instance_id like 'rpv2-finalize-'||p.id::text||'-%'
              )
              and fw.status in ('QUEUED','RUNNING','PAUSED')) active_finalizers
    from render_v2_packs p
    where p.shadow_mode=true
      and p.status not in ('RENDER_READY','SELECTED','IMPLEMENTED','CANCELLED')
      and (select count(*) from render_v2_variants v where v.render_pack_id=p.id)=3
      and (select count(*) from render_v2_variants v
           where v.render_pack_id=p.id and v.status='RENDER_READY' and v.certified_revision is not null)=3
      and (
        p.quality_contract_version<>${QUALITY_CONTRACT_VERSION}
        or
        (select count(*) from render_v2_variants v
          join render_variant_revisions r on r.variant_id=v.id and r.revision=v.certified_revision
          where v.render_pack_id=p.id
            and v.status='RENDER_READY'
            and r.compiler_version=${COMPILER_VERSION})=3
      )
    order by p.updated_at
    limit 10`;
  for(const pack of finalizable) {
    const maxAttempt=Number(pack.finalizer_max_attempt||0);
    if(Number(pack.active_finalizers||0)>0 || maxAttempt>=8) continue;
    try {
      const result=await startPackFinalizer(env,sql,pack,maxAttempt+1);
      summary.started.push(result);
    } catch(error) {
      summary.errors.push({pack_id:pack.id,finalizer:true,error:String(error?.message||error)});
    }
  }

  const rollout=await sql`select queue_enabled,max_concurrency from render_v2_rollout_state where id=1 limit 1`;
  if(rollout[0]?.queue_enabled===true) {
    const staleGenerating=await sql`
      select p.id,p.prospect_id,p.input_pack_id,p.metadata,p.updated_at
      from render_v2_packs p
      where p.shadow_mode=true
        and p.status='GENERATING'
        and (
          coalesce((p.metadata->>'auto_recovery_attempt')::int,0)>=3
          or p.updated_at < now()-interval '10 minutes'
        )
        and (select count(*) from render_v2_variants v where v.render_pack_id=p.id and v.status='RENDER_READY' and v.certified_revision is not null)<3
        and not exists (
          select 1 from render_workflows_v2 w
          where w.render_pack_id=p.id
            and w.status in ('QUEUED','RUNNING','PAUSED')
        )
      order by p.updated_at
      limit 10`;
    for(const pack of staleGenerating) {
      const recoveryAttempts=Number(pack.metadata?.auto_recovery_attempt||0);
      const exhausted=recoveryAttempts>=3;
      const closedAt=new Date().toISOString();
      await setPackStatus(sql,pack.id,"ESCALATION_REQUIRED",{
        stale_generating_reconciled_at:closedAt,
        stale_generating_previous_status:"GENERATING",
        auto_recovery_exhausted:exhausted,
        auto_recovery_exhausted_at:exhausted?closedAt:null,
        recovery_exhausted:exhausted,
        recovery_exhausted_at:exhausted?closedAt:null,
        ghost_generating_closed:true,
        ghost_generating_closed_at:closedAt,
        ghost_state_close_reason:exhausted?"AUTO_RECOVERY_LIMIT_REACHED_NO_ACTIVE_WORKFLOW":"NO_ACTIVE_WORKFLOW"
      });
      if(exhausted) {
        await sql`
          update prospects
          set render_status='ESCALATION_REQUIRED',
              current_step='AUTO_RECOVERY_EXHAUSTED',
              error='V2_AUTO_RECOVERY_EXHAUSTED',
              next_action='CABINA_RENDERING_REVIEW',
              updated_at=now()
          where id=${pack.prospect_id}::uuid
            and pipeline_status='RENDERING'`;
      }
      summary.reconciled.push({
        pack_id:pack.id,
        from_status:"GENERATING",
        to_status:"ESCALATION_REQUIRED",
        reason:exhausted?"AUTO_RECOVERY_EXHAUSTED":"NO_ACTIVE_WORKFLOW",
        auto_recovery_attempt:recoveryAttempts
      });
    }

    const escalated=await sql`
      select p.*
      from render_v2_packs p
      join prospects pr on pr.id=p.prospect_id
      where p.shadow_mode=true
        and p.status='ESCALATION_REQUIRED'
        and coalesce((p.metadata->>'auto_recovery_attempt')::int,0)<3
        and (
          (pr.retry_count<pr.max_retries and coalesce(pr.error,'')<>'GENERATION_CIRCUIT_BREAKER' and coalesce(pr.current_step,'')<>'GENERATION_HOLD')
          or coalesce((p.metadata->>'generation_circuit_breaker_override_pending')::boolean,false)=true
        )
        and not exists (
          select 1 from render_workflows_v2 w
          where w.render_pack_id=p.id and w.status in ('QUEUED','RUNNING','PAUSED')
        )
      order by p.updated_at
      limit 5`;
    for(const pack of escalated) {
      if(renderSlots<=0) break;
      try {
        const recovered=await recoverEscalatedQueuePack(env,sql,pack,renderSlots);
        if(recovered.started) {
          summary.started.push(recovered);
          renderSlots=Math.max(0,renderSlots-Number(recovered.slots_used||0));
        } else if(recovered.reason==="CONCURRENCY_CAP") {
          summary.reconciled.push({pack_id:pack.id,status:"DEFERRED",reason:"CONCURRENCY_CAP",available_slots:renderSlots});
        }
      } catch(error) {
        summary.errors.push({pack_id:pack.id,auto_recovery:true,error:String(error?.message||error)});
      }
    }
  }

  const workflows=await sql`
    select workflow_instance_id,workflow_type,status
    from render_workflows_v2
    where status in ('QUEUED','RUNNING','PAUSED')
    order by last_event_at asc
    limit 50`;

  for(const row of workflows) {
    try {
      const instance=await bindingFor(env,row.workflow_type).get(row.workflow_instance_id);
      const current=await instance.status();
      const pstatus=platformStatus(current);
      const mapped=dbStatus(pstatus);
      await updateWorkflow(sql,row.workflow_instance_id,{
        status:mapped,
        currentStep:null,
        errorCode:pstatus==="errored" ? "PLATFORM_WORKFLOW_ERRORED" : null,
        metadata:{platform_status:pstatus,reconciled_at:new Date().toISOString()}
      });
      summary.reconciled.push({instance_id:row.workflow_instance_id,platform_status:pstatus,db_status:mapped});
    } catch(error) {
      summary.errors.push({instance_id:row.workflow_instance_id,error:String(error?.message||error)});
    }
  }
  summary.concurrency_after=await renderConcurrencyState(sql);
  return summary;
}
