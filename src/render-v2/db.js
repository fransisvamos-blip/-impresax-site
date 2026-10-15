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
  const healthyTerminal=["RENDER_READY","SELECTED","IMPLEMENTED"].includes(String(status||""));
  const rows=await sql`
    update render_v2_packs
    set status=${status},
        metadata=(case when ${healthyTerminal} then coalesce(metadata,'{}'::jsonb)-'error' else coalesce(metadata,'{}'::jsonb) end)
                 ||${JSON.stringify(metadata)}::jsonb,
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
      set last_event_at=now(),
          status=case
            when render_workflows_v2.status in ('COMPLETED','FAILED','CANCELLED') then render_workflows_v2.status
            when excluded.status='QUEUED' and render_workflows_v2.status in ('RUNNING','PAUSED') then render_workflows_v2.status
            else excluded.status
          end,
          metadata=render_workflows_v2.metadata||excluded.metadata
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

export async function getContentTruth(sql,packId) {
  const rows=await sql`select * from render_content_truth_v2 where render_pack_id=${packId}::uuid limit 1`;
  return rows[0]||null;
}

export async function persistContentTruth(sql,{packId,inputPackId,result,modelRouteVersion,promptVersion}) {
  const existing=await getContentTruth(sql,packId);
  if(existing) {
    if(existing.content_hash!==result.hash || existing.status!=="COMPLETED") {
      throw new Error("SYSTEM_INVARIANT:CONTENT_TRUTH_IMMUTABILITY_MISMATCH");
    }
    return existing;
  }
  const rows=await sql`
    insert into render_content_truth_v2(
      render_pack_id,input_pack_id,status,payload,content_hash,verification,
      generator_model,reviewer_model,model_route_version,prompt_version
    ) values(
      ${packId}::uuid,${inputPackId}::uuid,'COMPLETED',
      ${JSON.stringify(result.content_truth)}::jsonb,${result.hash},
      ${JSON.stringify(result.verification||{})}::jsonb,
      ${result.generator_model||null},${result.reviewer_model||null},
      ${modelRouteVersion},${promptVersion}
    )
    on conflict(render_pack_id) do nothing
    returning *`;
  if(rows.length) return rows[0];
  const raced=await getContentTruth(sql,packId);
  if(!raced || raced.content_hash!==result.hash) throw new Error("SYSTEM_INVARIANT:CONTENT_TRUTH_CONCURRENT_MISMATCH");
  return raced;
}

export async function getDirectionPlan(sql,packId) {
  const rows=await sql`select * from render_direction_plans_v2 where render_pack_id=${packId}::uuid limit 1`;
  return rows[0]||null;
}

export async function persistDirectionPlan(sql,{packId,inputPackId,result,modelRouteVersion,promptVersion}) {
  const existing=await getDirectionPlan(sql,packId);
  if(existing) {
    if(existing.content_hash!==result.hash || existing.status!=="COMPLETED") {
      throw new Error("SYSTEM_INVARIANT:DIRECTION_PLAN_IMMUTABILITY_MISMATCH");
    }
    return existing;
  }
  const rows=await sql`
    insert into render_direction_plans_v2(
      render_pack_id,input_pack_id,status,creative_strategy,directions,fingerprints,
      diversity_precheck,content_hash,model,model_route_version,prompt_version
    ) values(
      ${packId}::uuid,${inputPackId}::uuid,'COMPLETED',${result.creative_strategy},
      ${JSON.stringify(result.directions)}::jsonb,${JSON.stringify(result.fingerprints)}::jsonb,
      ${JSON.stringify(result.diversity_precheck||{})}::jsonb,${result.hash},${result.model||null},
      ${modelRouteVersion},${promptVersion}
    )
    on conflict(render_pack_id) do nothing
    returning *`;
  if(rows.length) return rows[0];
  const raced=await getDirectionPlan(sql,packId);
  if(!raced || raced.content_hash!==result.hash) throw new Error("SYSTEM_INVARIANT:DIRECTION_PLAN_CONCURRENT_MISMATCH");
  return raced;
}

export async function persistCreativePlan(sql,{packId,inputPackId,plan,modelRouteVersion,promptVersion,hash}) {
  const existing=await sql`select * from render_creative_plans_v2 where render_pack_id=${packId}::uuid limit 1`;
  if(existing.length) {
    if(existing[0].status!=="COMPLETED" || existing[0].content_hash!==hash) {
      throw new Error("SYSTEM_INVARIANT:CREATIVE_PLAN_IMMUTABILITY_MISMATCH");
    }
    return existing[0];
  }

  const rows=await sql`
    insert into render_creative_plans_v2(
      render_pack_id,input_pack_id,status,content_truth_pack,creative_strategy,
      directions,fingerprints,diversity_precheck,model_route_version,prompt_version,
      content_truth_hash,creative_directions_hash,content_hash,completed_at
    ) values(
      ${packId}::uuid,${inputPackId}::uuid,'COMPLETED',
      ${JSON.stringify(plan.content_truth)}::jsonb,${plan.creative_strategy},
      ${JSON.stringify(plan.directions)}::jsonb,${JSON.stringify(plan.fingerprints)}::jsonb,
      ${JSON.stringify(plan.diversity_precheck||{})}::jsonb,${modelRouteVersion},${promptVersion},
      ${plan.content_truth_hash},${plan.creative_directions_hash},${hash},now()
    )
    on conflict(render_pack_id) do nothing
    returning *`;
  if(rows.length) return rows[0];

  const raced=await sql`select * from render_creative_plans_v2 where render_pack_id=${packId}::uuid limit 1`;
  if(!raced.length || raced[0].content_hash!==hash) throw new Error("SYSTEM_INVARIANT:CREATIVE_PLAN_CONCURRENT_MISMATCH");
  return raced[0];
}

export async function createVariants(sql,packId,directions) {
  const out={};
  for(const key of ["A","B","C"]) {
    const fp=directions[key]?.fingerprint||{};
    const rows=await sql`
      insert into render_v2_variants(render_pack_id,variant_key,status,direction_fingerprint)
      values(${packId}::uuid,${key},'PLANNED',${JSON.stringify(fp)}::jsonb)
      on conflict(render_pack_id,variant_key) do nothing
      returning *`;
    let row=rows[0];
    if(!row) {
      const existing=await sql`
        select * from render_v2_variants
        where render_pack_id=${packId}::uuid
          and variant_key=${key}
          and direction_fingerprint=${JSON.stringify(fp)}::jsonb
        limit 1`;
      row=existing[0];
      if(!row) throw new Error("SYSTEM_INVARIANT:VARIANT_DIRECTION_IMMUTABILITY_MISMATCH:"+key);
    }
    out[key]=row;
  }
  return out;
}

export async function allocateRevision(sql,variantId,parentRevisionId=null,allocationKey=null) {
  if(allocationKey) {
    const prior=await sql`select * from render_variant_revisions where allocation_key=${allocationKey} limit 1`;
    if(prior.length) {
      const r=prior[0];
      if(String(r.variant_id)!==String(variantId)) throw new Error("SYSTEM_INVARIANT:REVISION_ALLOCATION_KEY_COLLISION");
      await sql`update render_v2_variants set current_revision=greatest(current_revision,${r.revision}),status=case when status='RENDER_READY' then status else 'GENERATING' end,updated_at=now() where id=${variantId}::uuid`;
      return r;
    }
  }
  const rows=await sql`
    with n as (
      select coalesce(max(revision),0)+1 as revision
      from render_variant_revisions where variant_id=${variantId}::uuid
    )
    insert into render_variant_revisions(variant_id,revision,status,parent_revision_id,allocation_key)
    select ${variantId}::uuid,n.revision,'GENERATING',${parentRevisionId}::uuid,${allocationKey} from n
    on conflict(allocation_key) where allocation_key is not null do nothing
    returning *`;
  let r=rows[0];
  if(!r && allocationKey) {
    const raced=await sql`select * from render_variant_revisions where allocation_key=${allocationKey} limit 1`;
    r=raced[0];
  }
  if(!r) throw new Error("SYSTEM_INVARIANT:REVISION_ALLOCATION_FAILED");
  await sql`update render_v2_variants set current_revision=greatest(current_revision,${r.revision}),status='GENERATING',updated_at=now() where id=${variantId}::uuid`;
  return r;
}

export async function updateRevision(sql,revisionId,{status,renderSpec=null,sourceHash=null,htmlKey=null,desktopKey=null,mobileKey=null,score=null,compilerVersion=null}) {
  const currentRows=await sql`select * from render_variant_revisions where id=${revisionId}::uuid limit 1`;
  const current=currentRows[0];
  if(!current) throw new Error("SYSTEM_INVARIANT:REVISION_NOT_FOUND");
  if(["RENDER_READY","QA_FAILED","SUPERSEDED"].includes(current.status)) {
    const sameStatus=current.status===status;
    const sameSpec=renderSpec===null || JSON.stringify(current.render_spec||{})===JSON.stringify(renderSpec||{});
    const sameSource=sourceHash===null || current.source_hash===sourceHash;
    const sameHtml=htmlKey===null || current.html_r2_key===htmlKey;
    const sameDesktop=desktopKey===null || current.desktop_r2_key===desktopKey;
    const sameMobile=mobileKey===null || current.mobile_r2_key===mobileKey;
    const sameScore=score===null || Number(current.score)===Number(score);
    const sameCompiler=compilerVersion===null || String(current.compiler_version||"")===String(compilerVersion);
    if(sameStatus&&sameSpec&&sameSource&&sameHtml&&sameDesktop&&sameMobile&&sameScore&&sameCompiler) return current;
    throw new Error("SYSTEM_INVARIANT:TERMINAL_VARIANT_REVISION_IMMUTABLE");
  }
  const rows=await sql`
    update render_variant_revisions set
      status=${status},
      render_spec=case when ${renderSpec===null} then render_spec else ${JSON.stringify(renderSpec||{})}::jsonb end,
      source_hash=coalesce(${sourceHash},source_hash),
      html_r2_key=coalesce(${htmlKey},html_r2_key),
      desktop_r2_key=coalesce(${desktopKey},desktop_r2_key),
      mobile_r2_key=coalesce(${mobileKey},mobile_r2_key),
      score=coalesce(${score},score),
      compiler_version=coalesce(${compilerVersion}::text,compiler_version),
      completed_at=case when ${status} in ('PREVIEW_READY','RENDER_READY','QA_FAILED','SUPERSEDED') then now() else completed_at end
    where id=${revisionId}::uuid returning *`;
  return rows[0];
}

export async function ensureBestPreview(sql,variantId,revision) {
  const rows=await sql`
    update render_v2_variants
    set best_preview_revision=coalesce(best_preview_revision,${revision}),
        updated_at=now()
    where id=${variantId}::uuid
    returning *`;
  return rows[0]||null;
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

export async function recordQa(sql,{packId,revisionId=null,type,status,scores={},issues=[],actions=[],artifactHashes={},modelRouteVersion=null,promptVersion=null,idempotencyKey=null}) {
  const key=idempotencyKey || (
    revisionId
      ? "qa:"+type+":"+String(revisionId)
      : type==="CONTENT_TRUTH"
        ? "qa:CONTENT_TRUTH:"+String(packId)+":"+String(artifactHashes?.content_truth_hash||"")
        : "qa:"+type+":"+String(packId)+":"+["A_revision_id","B_revision_id","C_revision_id"].map(k=>String(artifactHashes?.[k]||"")).join(":")
  );
  const rows=await sql`
    insert into render_qa_results_v2(
      render_pack_id,variant_revision_id,qa_type,status,scores,issues,actions,
      artifact_hashes,model_route_version,prompt_version,idempotency_key
    ) values(
      ${packId}::uuid,${revisionId}::uuid,${type},${status},
      ${JSON.stringify(scores)}::jsonb,${JSON.stringify(issues)}::jsonb,
      ${JSON.stringify(actions)}::jsonb,${JSON.stringify(artifactHashes)}::jsonb,
      ${modelRouteVersion},${promptVersion},${key}
    )
    on conflict(idempotency_key) where idempotency_key is not null do nothing
    returning *`;
  if(rows.length) return rows[0];
  const existing=await sql`select * from render_qa_results_v2 where idempotency_key=${key} limit 1`;
  if(!existing.length) throw new Error("SYSTEM_INVARIANT:QA_IDEMPOTENCY_RECOVERY_FAILED");
  if(existing[0].status!==status || JSON.stringify(existing[0].artifact_hashes||{})!==JSON.stringify(artifactHashes||{})) {
    throw new Error("SYSTEM_INVARIANT:QA_IDEMPOTENCY_MISMATCH");
  }
  return existing[0];
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
    )
    on conflict do nothing
    returning *`;
  if(rows.length) return rows[0];
  const existing=await sql`
    select * from render_failures_v2
    where render_pack_id=${packId}::uuid
      and workflow_id is not distinct from ${workflowId}::uuid
      and variant_revision_id is not distinct from ${revisionId}::uuid
      and step=${step}
      and fingerprint=${fingerprint}
      and strategy_version=${strategyVersion}
    order by created_at asc limit 1`;
  if(!existing.length) throw new Error("SYSTEM_INVARIANT:FAILURE_IDEMPOTENCY_RECOVERY_FAILED");
  return existing[0];
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
