import { QUALITY_CONTRACT_VERSION, EXECUTION_ENGINE_VERSION, COMPILER_VERSION } from "./constants.js";
import { stableStringify, sha256 } from "./utils.js";

export async function selectCertifiedVariant(sql,{packId,variantKey}) {
  const rows=await sql`
    select v.*,r.id as revision_id,r.revision,r.source_hash,r.html_r2_key,r.desktop_r2_key,r.mobile_r2_key
    from render_v2_packs p
    join render_v2_variants v on v.render_pack_id=p.id
    join render_variant_revisions r on r.variant_id=v.id and r.revision=v.certified_revision
    where p.id=${packId}::uuid
      and p.status in ('RENDER_READY','SELECTED')
      and v.variant_key=${variantKey}
      and v.status='RENDER_READY'
      and r.status='RENDER_READY'
    limit 1`;
  if(!rows.length) throw new Error("CERTIFIED_VARIANT_REQUIRED");
  const selected=rows[0];
  await sql`
    update render_v2_packs
    set selected_variant_revision_id=${selected.revision_id}::uuid,
        status='SELECTED',
        metadata=coalesce(metadata,'{}'::jsonb) ||
          jsonb_build_object('selected_variant_key',${variantKey},'selected_at',to_jsonb(now())),
        updated_at=now()
    where id=${packId}::uuid`;
  return selected;
}

export async function buildReferenceManifest(sql,packId) {
  const packs=await sql`
    select p.*,i.id input_pack_id,i.input_version,i.content_hash input_hash,i.payload input_payload,
           c.id creative_plan_id,c.content_hash creative_plan_hash,c.content_truth_hash,c.creative_directions_hash,
           c.content_truth_pack,c.directions,c.fingerprints
    from render_v2_packs p
    join render_input_packs i on i.id=p.input_pack_id
    join render_creative_plans_v2 c on c.render_pack_id=p.id
    where p.id=${packId}::uuid and p.status='SELECTED'
    limit 1`;
  if(!packs.length) throw new Error("SELECTED_RENDER_PACK_REQUIRED");
  const pack=packs[0];
  if(!pack.selected_variant_revision_id) throw new Error("SELECTED_VARIANT_REVISION_REQUIRED");

  const selectedRows=await sql`
    select v.id variant_id,v.variant_key,v.certified_revision,r.*
    from render_variant_revisions r
    join render_v2_variants v on v.id=r.variant_id
    where r.id=${pack.selected_variant_revision_id}::uuid
      and v.render_pack_id=${packId}::uuid
      and v.status='RENDER_READY'
      and r.status='RENDER_READY'
    limit 1`;
  if(!selectedRows.length) throw new Error("SELECTED_CERTIFIED_REVISION_REQUIRED");
  const selected=selectedRows[0];

  const artifacts=await sql`
    select artifact_type,r2_key,sha256,mime,bytes
    from render_artifacts_v2
    where variant_revision_id=${selected.id}::uuid
    order by artifact_type`;
  const byType=Object.fromEntries(artifacts.map(x=>[x.artifact_type,x]));
  for(const type of ["SOURCE_HTML","DESKTOP_1440","MOBILE_390"]) {
    if(!byType[type]) throw new Error("REFERENCE_ARTIFACT_REQUIRED:"+type);
  }

  const allVariants=await sql`
    select v.variant_key,v.id,v.current_revision,v.best_preview_revision,v.best_qa_revision,v.certified_revision,v.status,
           r.id certified_revision_id,r.source_hash,r.compiler_version,r.html_r2_key,r.desktop_r2_key,r.mobile_r2_key
    from render_v2_variants v
    join render_variant_revisions r on r.variant_id=v.id and r.revision=v.certified_revision
    where v.render_pack_id=${packId}::uuid
    order by v.variant_key`;
  if(allVariants.length!==3 || allVariants.some(x=>x.status!=="RENDER_READY" || !x.certified_revision)) {
    throw new Error("THREE_CERTIFIED_VARIANTS_REQUIRED");
  }

  const inputArtifacts=await sql`
    select artifact_type,r2_key,sha256,mime,bytes
    from render_artifacts_v2
    where render_pack_id=${packId}::uuid
      and variant_revision_id is null
      and artifact_type like 'INPUT_ASSET_%'
    order by artifact_type`;
  const inputAssetByToken=new Map(inputArtifacts.map(x=>[String(x.artifact_type).replace(/^INPUT_ASSET_/,""),x]));
  const assetManifest=(pack.input_payload?.assets||[]).map(asset=>{
    const stored=inputAssetByToken.get(String(asset.asset_id))||null;
    return {
      asset_id:asset.asset_id,
      role:asset.role,
      source_type:asset.source_type||null,
      source_url:asset.source_url||null,
      commercial_use_status:asset.commercial_use_status||null,
      r2_key:stored?.r2_key||null,
      sha256:stored?.sha256||null,
      mime:stored?.mime||null,
      bytes:stored?.bytes||null
    };
  });

  const truthQaRows=await sql`
    select id,status,scores,issues,actions,artifact_hashes,model_route_version,prompt_version,created_at
    from render_qa_results_v2
    where render_pack_id=${packId}::uuid
      and variant_revision_id is null
      and qa_type='CONTENT_TRUTH'
      and status='PASS'
    order by created_at desc limit 1`;
  if(!truthQaRows.length) throw new Error("CONTENT_TRUTH_QA_PASS_REQUIRED");
  const truthQa=truthQaRows[0];

  const setQaRows=await sql`
    select id,status,scores,issues,actions,artifact_hashes,model_route_version,prompt_version,created_at
    from render_qa_results_v2
    where render_pack_id=${packId}::uuid
      and variant_revision_id is null
      and qa_type='SET_VISUAL'
      and status='PASS'
    order by created_at desc limit 1`;
  if(!setQaRows.length) throw new Error("SET_QA_PASS_REQUIRED");
  const setQa=setQaRows[0];

  const variantQa=await sql`
    select q.id,q.variant_revision_id,q.status,q.scores,q.issues,q.actions,q.artifact_hashes,q.model_route_version,q.prompt_version,q.created_at
    from render_qa_results_v2 q
    where q.render_pack_id=${packId}::uuid
      and q.qa_type='VARIANT_VISUAL'
      and q.status='PASS'
      and q.variant_revision_id in (
        select r.id
        from render_v2_variants v
        join render_variant_revisions r on r.variant_id=v.id and r.revision=v.certified_revision
        where v.render_pack_id=${packId}::uuid
      )
    order by q.created_at asc`;
  if(variantQa.length!==3) throw new Error("THREE_CERTIFIED_VARIANT_QA_RESULTS_REQUIRED");

  const selectedAt=String(pack.metadata?.selected_at||"");
  if(!selectedAt) throw new Error("SELECTED_AT_REQUIRED");

  const manifest={
    manifest_version:"APPROVED_REFERENCE_MANIFEST_V2_SHADOW",
    shadow_only:true,
    selected_at:selectedAt,
    prospect_id:pack.prospect_id,
    render_pack_id:pack.id,
    input_pack:{
      id:pack.input_pack_id,
      version:pack.input_version,
      sha256:pack.input_hash,
      official_identity:pack.input_payload?.official_logo||{},
      identity_mode:pack.input_payload?.identity_mode||null,
      source_references:pack.input_payload?.source_references||[],
      brand_dna:pack.input_payload?.brand_dna||{},
      verified_services:pack.input_payload?.verified_services||"",
      verified_contacts:pack.input_payload?.verified_contacts||"",
      asset_mode:pack.input_payload?.asset_mode||null,
      assets:assetManifest
    },
    creative_plan:{
      id:pack.creative_plan_id,
      sha256:pack.creative_plan_hash,
      content_truth_sha256:pack.content_truth_hash,
      creative_directions_sha256:pack.creative_directions_hash,
      content_truth_pack:pack.content_truth_pack,
      directions:pack.directions,
      fingerprints:pack.fingerprints
    },
    certified_variants:allVariants.map(v=>({
      variant_id:v.id,
      variant_key:v.variant_key,
      revision:v.certified_revision,
      revision_id:v.certified_revision_id,
      source_hash:v.source_hash,
      compiler_version:v.compiler_version,
      source_html_r2_key:v.html_r2_key,
      desktop_r2_key:v.desktop_r2_key,
      mobile_r2_key:v.mobile_r2_key
    })),
    selected_variant:{
      id:selected.variant_id,
      key:selected.variant_key,
      revision_id:selected.id,
      revision:selected.revision,
      render_spec:selected.render_spec,
      source_hash:selected.source_hash,
      compiler_version:selected.compiler_version
    },
    source_html:{r2_key:byType.SOURCE_HTML.r2_key,sha256:byType.SOURCE_HTML.sha256},
    desktop_reference:{r2_key:byType.DESKTOP_1440.r2_key,sha256:byType.DESKTOP_1440.sha256},
    mobile_reference:{r2_key:byType.MOBILE_390.r2_key,sha256:byType.MOBILE_390.sha256},
    qa_evidence:{
      content_truth:truthQa,
      set_qa:setQa,
      variant_qa:variantQa
    },
    quality_contract_version:QUALITY_CONTRACT_VERSION,
    execution_engine_version:EXECUTION_ENGINE_VERSION,
    compiler_version:COMPILER_VERSION
  };
  return {...manifest,manifest_hash:await sha256(stableStringify(manifest))};
}
