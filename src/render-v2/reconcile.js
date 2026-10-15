import { db, persistWorkflow, updateWorkflow, setPackStatus } from "./db.js";

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

async function recoverEscalatedQueuePack(env,sql,pack) {
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

  const attempts=Number(pack.metadata?.auto_recovery_attempt||0);
  if(attempts>=3) return {pack_id:pack.id,started:false,reason:"AUTO_RECOVERY_LIMIT"};

  const attempt=attempts+1;
  const runKey="auto-r"+attempt;

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
    return {pack_id:pack.id,started:true,type:"PROSPECT",instance_id:instanceId,status:await instance.status()};
  }

  const pending=variants.filter(v=>!(v.status==="RENDER_READY" && v.certified_revision));
  const launched=[];
  for(const variant of pending) {
    const instanceId="rv2-"+pack.id+"-"+variant.variant_key+"-"+runKey;
    await persistWorkflow(sql,{
      prospectId:pack.prospect_id,packId:pack.id,variantId:variant.id,type:"VARIANT",
      instanceId,status:"QUEUED",
      metadata:{variant_key:variant.variant_key,event_prefix:runKey,auto_recovery:true,auto_recovery_attempt:attempt}
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
  await setPackStatus(sql,pack.id,"GENERATING",{auto_recovery_attempt:attempt,auto_recovery_run_key:runKey});
  return {pack_id:pack.id,started:true,type:"VARIANT_SET",attempt,launched};
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

  const orphanPacks=await sql`
    select p.id,p.prospect_id,p.input_pack_id
    from render_v2_packs p
    join render_input_packs i on i.id=p.input_pack_id
    where p.shadow_mode=true
      and p.status='INPUT_READY'
      and i.certification_status='PASS'
      and not exists (
        select 1 from render_workflows_v2 w
        where w.render_pack_id=p.id and w.workflow_type='PROSPECT'
      )
    order by p.priority,p.created_at
    limit 10`;

  for(const pack of orphanPacks) {
    try { summary.started.push(await startOrRecoverParent(env,sql,pack)); }
    catch(error) { summary.errors.push({pack_id:pack.id,error:String(error?.message||error)}); }
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

  const rollout=await sql`select queue_enabled from render_v2_rollout_state where id=1 limit 1`;
  if(rollout[0]?.queue_enabled===true) {
    const escalated=await sql`
      select p.*
      from render_v2_packs p
      where p.shadow_mode=true
        and p.status='ESCALATION_REQUIRED'
        and coalesce((p.metadata->>'auto_recovery_attempt')::int,0)<3
        and not exists (
          select 1 from render_workflows_v2 w
          where w.render_pack_id=p.id and w.status in ('QUEUED','RUNNING','PAUSED')
        )
      order by p.updated_at
      limit 5`;
    for(const pack of escalated) {
      try {
        const recovered=await recoverEscalatedQueuePack(env,sql,pack);
        if(recovered.started) summary.started.push(recovered);
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
  return summary;
}
