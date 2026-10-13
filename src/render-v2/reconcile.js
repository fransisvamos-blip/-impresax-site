import { db, persistWorkflow, updateWorkflow } from "./db.js";

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

export async function startOrRecoverParent(env,sql,pack) {
  const instanceId="rpv2-"+pack.id;
  let instance;
  try {
    instance=await env.RENDER_PROSPECT_WORKFLOW.create({
      id:instanceId,
      params:{prospectId:pack.prospect_id,packId:pack.id,inputPackId:pack.input_pack_id}
    });
  } catch {
    instance=await env.RENDER_PROSPECT_WORKFLOW.get(instanceId);
  }
  await persistWorkflow(sql,{
    prospectId:pack.prospect_id,packId:pack.id,type:"PROSPECT",instanceId,status:"QUEUED",
    metadata:{reconciler_started:true,input_pack_id:pack.input_pack_id}
  });
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
