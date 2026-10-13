export { RenderProspectWorkflow, RenderVariantWorkflow } from "./workflows.js";
import { db, packSnapshot } from "./db.js";
import { createShadowInputPack } from "./input-pack.js";
import { EXECUTION_ENGINE_VERSION, QUALITY_CONTRACT_VERSION, MODEL_ROUTE_VERSION, COMPILER_VERSION } from "./constants.js";

function json(data,status=200){ return Response.json(data,{status,headers:{"cache-control":"no-store"}}); }

function authorized(request,env) {
  if(!env.V2_SHADOW_TOKEN) return false;
  const auth=request.headers.get("authorization")||"";
  return auth==="Bearer "+env.V2_SHADOW_TOKEN;
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==="/healthz") {
      return json({
        ok:true,service:"impresax-render-v2-shadow",mode:"SHADOW",
        quality_contract:QUALITY_CONTRACT_VERSION,engine:EXECUTION_ENGINE_VERSION,
        compiler:COMPILER_VERSION,model_routes:MODEL_ROUTE_VERSION,
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
      const instance=await env.RENDER_PROSPECT_WORKFLOW.get(id);
      return json({ok:true,id,status:await instance.status()});
    }

    return json({ok:false,error:"NOT_FOUND"},404);
  }
};
