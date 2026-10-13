import { neon } from "@neondatabase/serverless";
import { EXECUTION_ENGINE_VERSION } from "./constants.js";

export function db(env) {
  if(!env.OPS_DATABASE_URL) throw new Error("OPS_DATABASE_URL_NOT_CONFIGURED");
  return neon(env.OPS_DATABASE_URL);
}

export async function getProspect(sql, ref) {
  const value=String(ref||"").trim();
  const rows=await sql`
    select id,business_name,vertical,city,country,website_url,logo,brand_dna,source_data,legacy_ids,priority,rank
    from prospects
    where id::text=${value}
       or coalesce(legacy_ids->>'id_prospect',source_data->>'id_prospect')=${value}
    limit 1`;
  if(!rows.length) throw new Error("INPUT_BLOCKED:PROSPECT_NOT_FOUND");
  return rows[0];
}

export async function findActiveV2Pack(sql, prospectId) {
  const rows=await sql`
    select * from render_v2_packs
    where prospect_id=${prospectId}::uuid
      and status not in ('CANCELLED','SUPERSEDED','APPROVED')
    order by created_at desc limit 1`;
  return rows[0]||null;
}

export async function getInputPack(sql, id) {
  const rows=await sql`select * from render_input_packs where id=${id}::uuid limit 1`;
  if(!rows.length) throw new Error("INPUT_BLOCKED:INPUT_PACK_NOT_FOUND");
  return rows[0];
}

export async function getV2Pack(sql,id) {
  const rows=await sql`select * from render_v2_packs where id=${id}::uuid limit 1`;
  if(!rows.length) throw new Error("RENDER_V2_PACK_NOT_FOUND");
  return rows[0];
}

export async function setPackStatus(sql,packId,status,metadata={}) {
  const rows=await sql`
    update render_v2_packs
    set status=${status},
        metadata=coalesce(metadata,'{}'::jsonb)||${JSON.stringify(metadata)}::jsonb,
        preview_ready_at=case when ${status}='PREVIEW_READY' then coalesce(preview_ready_at,now()) else preview_ready_at end,
        render_ready_at=case when ${status}='RENDER_READY' then coalesce(render_ready_at,now()) else render_ready_at end,
        updated_at=now()
    where id=${packId}::uuid
    returning *`;
  return rows[0]||null;
}

export async function persistWorkflow(sql,{prospectId,packId,variantId=null,revisionId=null,type,instanceId,status="QUEUED",metadata={}}) {
  const rows=await sql`
    insert into render_workflows_v2(
      prospect_id,render_pack_id,variant_id,variant_revision_id,workflow_type,
      workflow_instance_id,execution_engine_version,status,metadata,started_at,last_event_at
    ) values(
      ${prospectId}::uuid,${packId}::uuid,${variantId}::uuid,${revisionId}::uuid,${type},
      ${instanceId},${EXECUTION_ENGINE_VERSION},${status},${JSON.stringify(metadata)}::jsonb,
      case when ${status}='RUNNING' then now() else null end,now()
    )
    on conflict(workflow_instance_id) do update
      set last_event_at=now(),status=excluded.status,metadata=render_workflows_v2.metadata||excluded.metadata
    returning *`;
  return rows[0];
}

export async function updateWorkflow(sql,instanceId,{status,currentStep=null,errorCode=null,attempt=null,metadata={}}) {
  const rows=await sql`
    update render_workflows_v2
    set status=${status},
        current_step=coalesce(${currentStep},current_step),
        error_code=${errorCode},
        attempt=coalesce(${attempt},attempt),
        metadata=coalesce(metadata,'{}'::jsonb)||${JSON.stringify(metadata)}::jsonb,
        last_event_at=now(),
        started_at=case when ${status}='RUNNING' then coalesce(started_at,now()) else started_at end,
        completed_at=case when ${status} in ('COMPLETED','FAILED','CANCELLED') then now() else completed_at end
    where workflow_instance_id=${instanceId}
    returning *`;
  return rows[0]||null;
}

export async function persistCreativePlan(sql,{packId,inputPackId,plan,modelRouteVersion,promptVersion,hash}) {
  const rows=await sql`
    insert into render_creative_plans_v2(
      render_pack_id,input_pack_id,status,content_truth_pack,creative_strategy,
      directions,fingerprints,diversity_precheck,model_route_version,prompt_version,content_hash,completed_at
    ) values(
      ${packId}::uuid,${inputPackId}::uuid,'COMPLETED',
      ${JSON.stringify(plan.content_truth)}::jsonb,${plan.creative_strategy},
      ${JSON.stringify(plan.directions)}::jsonb,${JSON.stringify(plan.fingerprints)}::jsonb,
      ${JSON.stringify(plan.diversity_precheck||{})}::jsonb,${modelRouteVersion},${promptVersion},${hash},now()
    )
    on conflict(render_pack_id) do update set
      status='COMPLETED',
      content_truth_pack=excluded.content_truth_pack,
      creative_strategy=excluded.creative_strategy,
      directions=excluded.directions,
      fingerprints=excluded.fingerprints,
      diversity_precheck=excluded.diversity_precheck,
      model_route_version=excluded.model_route_version,
      prompt_version=excluded.prompt_version,
      content_hash=excluded.content_hash,
      completed_at=now()
    returning *`;
  return rows[0];
}

export async function createVariants(sql,packId,directions) {
  const out={};
  for(const key of ["A","B","C"]) {
    const fp=directions[key]?.fingerprint||{};
    const rows=await sql`
      insert into render_v2_variants(render_pack_id,variant_key,status,direction_fingerprint)
      values(${packId}::uuid,${key},'PLANNED',${JSON.stringify(fp)}::jsonb)
      on conflict(render_pack_id,variant_key) do update set
        direction_fingerprint=excluded.direction_fingerprint,updated_at=now()
      returning *`;
    out[key]=rows[0];
  }
  return out;
}

export async function allocateRevision(sql,variantId,parentRevisionId=null) {
  const rows=await sql`
    with n as (
      select coalesce(max(revision),0)+1 as revision
      from render_variant_revisions where variant_id=${variantId}::uuid
    )
    insert into render_variant_revisions(variant_id,revision,status,parent_revision_id)
    select ${variantId}::uuid,n.revision,'GENERATING',${parentRevisionId}::uuid from n
    returning *`;
  const r=rows[0];
  await sql`update render_v2_variants set current_revision=${r.revision},status='GENERATING',updated_at=now() where id=${variantId}::uuid`;
  return r;
}

export async function updateRevision(sql,revisionId,{status,renderSpec=null,sourceHash=null,htmlKey=null,desktopKey=null,mobileKey=null,score=null}) {
  const rows=await sql`
    update render_variant_revisions set
      status=${status},
      render_spec=case when ${renderSpec===null} then render_spec else ${JSON.stringify(renderSpec||{})}::jsonb end,
      source_hash=coalesce(${sourceHash},source_hash),
      html_r2_key=coalesce(${htmlKey},html_r2_key),
      desktop_r2_key=coalesce(${desktopKey},desktop_r2_key),
      mobile_r2_key=coalesce(${mobileKey},mobile_r2_key),
      score=coalesce(${score},score),
      completed_at=case when ${status} in ('PREVIEW_READY','RENDER_READY','QA_FAILED','SUPERSEDED') then now() else completed_at end
    where id=${revisionId}::uuid returning *`;
  return rows[0];
}

export async function setVariantStatus(sql,variantId,{status,bestPreview=null,bestQa=null,certified=null}) {
  const rows=await sql`
    update render_v2_variants set
      status=${status},
      best_preview_revision=coalesce(${bestPreview},best_preview_revision),
      best_qa_revision=coalesce(${bestQa},best_qa_revision),
      certified_revision=coalesce(${certified},certified_revision),
      updated_at=now()
    where id=${variantId}::uuid returning *`;
  return rows[0];
}

export async function recordQa(sql,{packId,revisionId=null,type,status,scores={},issues=[],actions=[],artifactHashes={},modelRouteVersion=null,promptVersion=null}) {
  const rows=await sql`
    insert into render_qa_results_v2(
      render_pack_id,variant_revision_id,qa_type,status,scores,issues,actions,
      artifact_hashes,model_route_version,prompt_version
    ) values(
      ${packId}::uuid,${revisionId}::uuid,${type},${status},
      ${JSON.stringify(scores)}::jsonb,${JSON.stringify(issues)}::jsonb,
      ${JSON.stringify(actions)}::jsonb,${JSON.stringify(artifactHashes)}::jsonb,
      ${modelRouteVersion},${promptVersion}
    ) returning *`;
  return rows[0];
}

export async function recordFailure(sql,{packId,workflowId=null,revisionId=null,step,failure,fingerprint,strategyVersion,attempt=1,details={}}) {
  const rows=await sql`
    insert into render_failures_v2(
      render_pack_id,workflow_id,variant_revision_id,step,failure_domain,failure_code,
      fingerprint,retryable,strategy_version,attempt,details
    ) values(
      ${packId}::uuid,${workflowId}::uuid,${revisionId}::uuid,${step},
      ${failure.failure_domain},${failure.failure_code},${fingerprint},${failure.retryable},
      ${strategyVersion},${attempt},${JSON.stringify({...details,message:failure.message})}::jsonb
    ) returning *`;
  return rows[0];
}

export async function countFailureFingerprint(sql,packId,fingerprint) {
  const rows=await sql`select count(*)::int as n from render_failures_v2 where render_pack_id=${packId}::uuid and fingerprint=${fingerprint}`;
  return Number(rows[0]?.n||0);
}

export async function packSnapshot(sql,packId) {
  const packs=await sql`select * from render_v2_packs where id=${packId}::uuid limit 1`;
  const variants=await sql`select * from render_v2_variants where render_pack_id=${packId}::uuid order by variant_key`;
  const workflows=await sql`select * from render_workflows_v2 where render_pack_id=${packId}::uuid order by created_at desc`;
  const failures=await sql`select * from render_failures_v2 where render_pack_id=${packId}::uuid order by created_at desc limit 30`;
  return {pack:packs[0]||null,variants,workflows,failures};
}
