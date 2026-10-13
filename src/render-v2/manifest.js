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
           c.id creative_plan_id,c.content_hash creative_plan_hash
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
    select variant_key,id,current_revision,best_preview_revision,best_qa_revision,certified_revision,status
    from render_v2_variants where render_pack_id=${packId}::uuid order by variant_key`;
  if(allVariants.length!==3 || allVariants.some(x=>x.status!=="RENDER_READY" || !x.certified_revision)) {
    throw new Error("THREE_CERTIFIED_VARIANTS_REQUIRED");
  }

  const manifest={
    manifest_version:"APPROVED_REFERENCE_MANIFEST_V2_SHADOW",
    shadow_only:true,
    prospect_id:pack.prospect_id,
    render_pack_id:pack.id,
    input_pack_id:pack.input_pack_id,
    input_version:pack.input_version,
    input_hash:pack.input_hash,
    creative_plan_id:pack.creative_plan_id,
    creative_plan_hash:pack.creative_plan_hash,
    selected_variant_id:selected.variant_id,
    selected_variant_key:selected.variant_key,
    selected_variant_revision_id:selected.id,
    selected_variant_revision:selected.revision,
    source_html:{r2_key:byType.SOURCE_HTML.r2_key,sha256:byType.SOURCE_HTML.sha256},
    desktop_reference:{r2_key:byType.DESKTOP_1440.r2_key,sha256:byType.DESKTOP_1440.sha256},
    mobile_reference:{r2_key:byType.MOBILE_390.r2_key,sha256:byType.MOBILE_390.sha256},
    quality_contract_version:QUALITY_CONTRACT_VERSION,
    execution_engine_version:EXECUTION_ENGINE_VERSION,
    compiler_version:COMPILER_VERSION,
    generated_at:new Date().toISOString()
  };
  return {...manifest,manifest_hash:await sha256(stableStringify(manifest))};
}
