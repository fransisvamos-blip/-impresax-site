export { RenderProspectWorkflow, RenderVariantWorkflow } from "./workflows.js";
import { db, packSnapshot, persistWorkflow } from "./db.js";
import { createShadowInputPack } from "./input-pack.js";
import { EXECUTION_ENGINE_VERSION, QUALITY_CONTRACT_VERSION, MODEL_ROUTE_VERSION, COMPILER_VERSION } from "./constants.js";
import { reconcileV2 } from "./reconcile.js";
import { budgetSnapshot } from "./metrics.js";
import { selectCertifiedVariant, buildReferenceManifest } from "./manifest.js";

function json(data,status=200){ return Response.json(data,{status,headers:{"cache-control":"no-store"}}); }

function authorized(request,env) {
  if(!env.V2_SHADOW_TOKEN) return false;
  const auth=request.headers.get("authorization")||"";
  return auth==="Bearer "+env.V2_SHADOW_TOKEN;
}

function workflowBinding(env,type) {
  return type==="VARIANT" ? env.RENDER_VARIANT_WORKFLOW : env.RENDER_PROSPECT_WORKFLOW;
}

async function writeControlEvent(sql,row,action,payload={}) {
  try {
    await sql`insert into site_events(prospect_id,event_type,entity_type,entity_id,actor,payload)
      values(${row.prospect_id}::uuid,'RENDER_V2_CONTROL','render_workflow_v2',${row.id}::text,'render-v2-shadow',
        ${JSON.stringify({action,...payload,workflow_instance_id:row.workflow_instance_id})}::jsonb)`;
  } catch {}
}

export default {
  async scheduled(controller,env,ctx) {
    ctx.waitUntil((async()=>{
      await reconcileV2(env).catch(()=>null);
      const ref=String(env.V2_SHADOW_AUTOSTART||"").trim();
      if(!ref || !env.RENDER_PROSPECT_WORKFLOW) return;
      try {
        const created=await createShadowInputPack(env,ref);
        if(!created.input_pack || created.input_pack.certification_status!=="PASS") return;
        if(!["INPUT_READY","PLANNING","GENERATING","PREVIEW_PARTIAL","PREVIEW_READY","QA_RUNNING","REWORK"].includes(String(created.pack.status||""))) return;
        const instanceId="rpv2-"+created.pack.id;
        try {
          await env.RENDER_PROSPECT_WORKFLOW.create({
            id:instanceId,
            params:{prospectId:created.pack.prospect_id,packId:created.pack.id,inputPackId:created.input_pack.id}
          });
        } catch {
          // Idempotent: an existing workflow with this deterministic ID is expected on later cron ticks.
        }
      } catch {
        // Reconciler/health surfaces typed failures; cron must never create an uncontrolled retry loop.
      }
    })());
  },

  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==="/healthz") {
      let database_connected=false;
      try {
        const sql=db(env);
        const ping=await sql`select 1 as ok`;
        database_connected=Number(ping[0]?.ok||0)===1;
      } catch {}
      return json({
        ok:true,service:"impresax-render-v2-shadow",mode:"SHADOW",
        quality_contract:QUALITY_CONTRACT_VERSION,engine:EXECUTION_ENGINE_VERSION,
        compiler:COMPILER_VERSION,model_routes:MODEL_ROUTE_VERSION,
        database_connected,
        bindings:{ai:Boolean(env.AI),browser:Boolean(env.BROWSER),r2:Boolean(env.RENDER_ARTIFACTS),db:Boolean(env.OPS_DATABASE_URL),parent_workflow:Boolean(env.RENDER_PROSPECT_WORKFLOW),variant_workflow:Boolean(env.RENDER_VARIANT_WORKFLOW)}
      });
    }
    if(!authorized(request,env)) return json({ok:false,error:"UNAUTHORIZED"},401);

    if(request.method==="POST" && url.pathname==="/shadow/start") {
      const body=await request.json().catch(()=>({}));
      const ref=body.prospect_id||body.prospect_code;
      if(!ref) return json({ok:false,error:"prospect_id_or_code_required"},400);
      const created=await createShadowInputPack(env,ref);
      if(!created.input_pack) return json({ok:false,error:"INPUT_PACK_NOT_CREATED"},500);
      if(created.input_pack.certification_status!=="PASS") {
        return json({ok:false,status:"INPUT_BLOCKED",pack_id:created.pack.id,issues:created.input_pack.certification_issues},409);
      }
      const instanceId="rpv2-"+created.pack.id;
      const sql=db(env);
      await persistWorkflow(sql,{
        prospectId:created.pack.prospect_id,packId:created.pack.id,type:"PROSPECT",
        instanceId,status:"QUEUED",metadata:{input_pack_id:created.input_pack.id,api_started:true}
      });
      let instance;
      try {
        instance=await env.RENDER_PROSPECT_WORKFLOW.create({
          id:instanceId,
          params:{prospectId:created.pack.prospect_id,packId:created.pack.id,inputPackId:created.input_pack.id}
        });
      } catch {
        instance=await env.RENDER_PROSPECT_WORKFLOW.get(instanceId);
      }
      return json({ok:true,created:created.created,pack_id:created.pack.id,input_pack_id:created.input_pack.id,workflow_instance_id:instanceId,workflow_status:await instance.status()},202);
    }

    if(request.method==="GET" && url.pathname==="/shadow/dashboard") {
      const sql=db(env);
      const rows=await sql`
        select c.*,
          (select count(*)::int from render_failures_v2 f where f.render_pack_id=c.render_pack_id and f.resolved_at is null) open_failures,
          (select count(*)::int from render_variant_revisions r join render_v2_variants v on v.id=r.variant_id where v.render_pack_id=c.render_pack_id) revision_count,
          (select count(*)::int from render_artifacts_v2 a where a.render_pack_id=c.render_pack_id) artifact_count,
          (select count(*)::int from render_qa_results_v2 q where q.render_pack_id=c.render_pack_id and q.status='PASS') qa_pass_count,
          (select max(w.last_event_at) from render_workflows_v2 w where w.render_pack_id=c.render_pack_id) workflow_last_event_at
        from render_v2_control_room c
        where c.render_pack_id is not null
        order by c.rank nulls last,c.updated_at desc
        limit 100`;
      return json({ok:true,mode:"SHADOW",engine:EXECUTION_ENGINE_VERSION,rows});
    }

    if(request.method==="GET" && url.pathname.startsWith("/shadow/benchmark/")) {
      const packId=url.pathname.split("/").pop();
      const sql=db(env);
      const packs=await sql`
        select id,prospect_id,status,created_at,preview_ready_at,render_ready_at,metrics,metadata
        from render_v2_packs where id=${packId}::uuid limit 1`;
      if(!packs.length) return json({ok:false,error:"RENDER_V2_PACK_NOT_FOUND"},404);
      const pack=packs[0];
      const counts=await sql`
        select
          (select count(*)::int from render_variant_revisions r join render_v2_variants v on v.id=r.variant_id where v.render_pack_id=${packId}::uuid) revisions,
          (select count(*)::int from render_failures_v2 where render_pack_id=${packId}::uuid) failures,
          (select count(*)::int from render_qa_results_v2 where render_pack_id=${packId}::uuid and qa_type='VARIANT_VISUAL' and status='PASS') variant_qa_passes,
          (select count(*)::int from render_qa_results_v2 where render_pack_id=${packId}::uuid and qa_type='SET_VISUAL' and status='PASS') set_qa_passes,
          (select count(*)::int from render_artifacts_v2 where render_pack_id=${packId}::uuid) artifacts`;
      const c=counts[0]||{};
      const created=new Date(pack.created_at).getTime();
      const preview=pack.preview_ready_at?new Date(pack.preview_ready_at).getTime():null;
      const ready=pack.render_ready_at?new Date(pack.render_ready_at).getTime():null;
      return json({
        ok:true,pack_id:packId,status:pack.status,
        time_to_preview_ms:preview===null?null:Math.max(0,preview-created),
        time_to_render_ready_ms:ready===null?null:Math.max(0,ready-created),
        revisions:Number(c.revisions||0),failures:Number(c.failures||0),
        variant_qa_passes:Number(c.variant_qa_passes||0),set_qa_passes:Number(c.set_qa_passes||0),
        artifacts:Number(c.artifacts||0),budget:await budgetSnapshot(sql,packId,env),
        metrics:pack.metrics||{}
      });
    }

    if(request.method==="GET" && url.pathname.startsWith("/shadow/status/")) {
      const packId=url.pathname.split("/").pop();
      const sql=db(env);
      const state=await packSnapshot(sql,packId);
      const qa=await sql`select * from render_qa_results_v2 where render_pack_id=${packId}::uuid order by created_at desc limit 30`;
      const artifacts=await sql`select id,variant_revision_id,artifact_type,r2_key,sha256,mime,bytes,created_at from render_artifacts_v2 where render_pack_id=${packId}::uuid order by created_at desc`;
      return json({ok:true,...state,qa,artifacts});
    }

    if(request.method==="GET" && url.pathname.startsWith("/shadow/workflow/")) {
      const id=url.pathname.split("/").pop();
      const sql=db(env);
      const rows=await sql`select workflow_type from render_workflows_v2 where workflow_instance_id=${id} limit 1`;
      if(!rows.length) return json({ok:false,error:"WORKFLOW_NOT_FOUND"},404);
      const instance=await workflowBinding(env,rows[0].workflow_type).get(id);
      return json({ok:true,id,workflow_type:rows[0].workflow_type,status:await instance.status()});
    }

    if(request.method==="POST" && url.pathname==="/shadow/select") {
      const body=await request.json().catch(()=>({}));
      const packId=String(body.pack_id||"").trim();
      const variantKey=String(body.variant_key||"").toUpperCase();
      if(!packId || !["A","B","C"].includes(variantKey)) return json({ok:false,error:"pack_id_and_variant_key_required"},400);
      const sql=db(env);
      try {
        const selected=await selectCertifiedVariant(sql,{packId,variantKey});
        return json({ok:true,pack_id:packId,variant_key:variantKey,selected_variant_revision_id:selected.revision_id});
      } catch(error) {
        return json({ok:false,error:String(error?.message||error)},409);
      }
    }

    if(request.method==="GET" && url.pathname.startsWith("/shadow/reference-manifest/")) {
      const packId=url.pathname.split("/").pop();
      const sql=db(env);
      try {
        return json({ok:true,manifest:await buildReferenceManifest(sql,packId)});
      } catch(error) {
        return json({ok:false,error:String(error?.message||error)},409);
      }
    }

    if(request.method==="POST" && url.pathname==="/shadow/reconcile") {
      return json({ok:true,summary:await reconcileV2(env)});
    }

    if(request.method==="POST" && url.pathname==="/shadow/control") {
      const body=await request.json().catch(()=>({}));
      const instanceId=String(body.workflow_instance_id||"").trim();
      const action=String(body.action||"").toLowerCase();
      if(!instanceId || !["pause","resume","restart","terminate"].includes(action)) {
        return json({ok:false,error:"workflow_instance_id_and_valid_action_required"},400);
      }
      const sql=db(env);
      const rows=await sql`select * from render_workflows_v2 where workflow_instance_id=${instanceId} limit 1`;
      if(!rows.length) return json({ok:false,error:"WORKFLOW_NOT_FOUND"},404);
      const row=rows[0];
      const instance=await workflowBinding(env,row.workflow_type).get(instanceId);

      if(action==="pause") {
        await instance.pause();
        await sql`update render_workflows_v2 set status='PAUSED',last_event_at=now(),metadata=metadata||${JSON.stringify({human_control:"pause"})}::jsonb where id=${row.id}::uuid`;
      } else if(action==="resume") {
        await instance.resume();
        await sql`update render_workflows_v2 set status='RUNNING',last_event_at=now(),metadata=metadata||${JSON.stringify({human_control:"resume"})}::jsonb where id=${row.id}::uuid`;
      } else if(action==="restart") {
        const fromName=String(body.from_step||"").trim();
        if(fromName) {
          await instance.restart({from:{name:fromName,count:Number(body.count||1),type:["do","sleep","waitForEvent"].includes(body.step_type)?body.step_type:"do"}});
        } else {
          await instance.restart();
        }
        await sql`update render_workflows_v2 set status='RUNNING',last_event_at=now(),attempt=attempt+1,metadata=metadata||${JSON.stringify({human_control:"restart",from_step:body.from_step||null})}::jsonb where id=${row.id}::uuid`;
      } else if(action==="terminate") {
        await instance.terminate({rollback:body.rollback===true});
        await sql`update render_workflows_v2 set status='CANCELLED',completed_at=now(),last_event_at=now(),metadata=metadata||${JSON.stringify({human_control:"terminate",rollback:body.rollback===true})}::jsonb where id=${row.id}::uuid`;
      }
      await writeControlEvent(sql,row,action,{from_step:body.from_step||null,rollback:body.rollback===true});
      return json({ok:true,workflow_instance_id:instanceId,action,status:await instance.status()});
    }

    if(request.method==="GET" && url.pathname.startsWith("/shadow/artifact/")) {
      const artifactId=url.pathname.split("/").pop();
      const sql=db(env);
      const rows=await sql`select * from render_artifacts_v2 where id=${artifactId}::uuid limit 1`;
      if(!rows.length) return json({ok:false,error:"ARTIFACT_NOT_FOUND"},404);
      const artifact=rows[0];
      const object=await env.RENDER_ARTIFACTS.get(artifact.r2_key);
      if(!object) return json({ok:false,error:"R2_ARTIFACT_NOT_FOUND"},404);
      return new Response(object.body,{status:200,headers:{
        "content-type":artifact.mime,
        "cache-control":"private, no-store",
        "x-content-type-options":"nosniff",
        "x-render-artifact-sha256":artifact.sha256
      }});
    }

    if(request.method==="GET" && url.pathname.startsWith("/shadow/budget/")) {
      const packId=url.pathname.split("/").pop();
      const sql=db(env);
      return json({ok:true,pack_id:packId,budget:await budgetSnapshot(sql,packId,env)});
    }

    return json({ok:false,error:"NOT_FOUND"},404);
  }
};
