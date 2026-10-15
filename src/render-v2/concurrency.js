export const ACTIVE_RENDER_WORKFLOW_STATUSES=["QUEUED","RUNNING","PAUSED"];

export async function renderConcurrencyState(sql) {
  const rows=await sql`
    select
      coalesce((select max_concurrency from render_v2_rollout_state where id=1),3)::int as max_concurrency,
      (select count(*)::int
       from render_workflows_v2
       where workflow_type='VARIANT'
         and status in ('QUEUED','RUNNING','PAUSED')) as active_variants`;
  const row=rows[0]||{};
  const limit=Math.max(1,Number(row.max_concurrency||3));
  const active=Math.max(0,Number(row.active_variants||0));
  return {limit,active,slots:Math.max(0,limit-active)};
}

export async function activeVariantWorkflowRows(sql) {
  return sql`
    select
      w.id,w.workflow_instance_id,w.render_pack_id,w.variant_id,w.status,w.current_step,w.created_at,w.last_event_at,
      v.variant_key,v.status as variant_status,v.certified_revision,
      rp.status as pack_status,rp.priority as pack_priority,
      p.rank as prospect_rank,p.business_name
    from render_workflows_v2 w
    join render_v2_variants v on v.id=w.variant_id
    join render_v2_packs rp on rp.id=w.render_pack_id
    join prospects p on p.id=rp.prospect_id
    where w.workflow_type='VARIANT'
      and w.status in ('QUEUED','RUNNING','PAUSED')
    order by
      case when p.rank is null then 1 else 0 end,
      p.rank asc nulls last,
      rp.priority asc nulls last,
      w.created_at asc,
      v.variant_key asc`;
}

export async function unstartedInitialVariants(sql,limit=20) {
  return sql`
    select
      v.id as variant_id,v.render_pack_id,v.variant_key,
      p.prospect_id,p.input_pack_id,
      pw.workflow_instance_id as parent_instance_id,
      pr.rank as prospect_rank
    from render_v2_variants v
    join render_v2_packs p on p.id=v.render_pack_id
    join prospects pr on pr.id=p.prospect_id
    join lateral (
      select w.workflow_instance_id
      from render_workflows_v2 w
      where w.render_pack_id=p.id
        and w.workflow_type='PROSPECT'
        and w.status in ('QUEUED','RUNNING','PAUSED')
        and coalesce((w.metadata->>'finalizer')::boolean,false)=false
        and coalesce((w.metadata->>'rollout_finalizer')::boolean,false)=false
      order by w.created_at desc
      limit 1
    ) pw on true
    where p.shadow_mode=true
      and p.status in ('GENERATING','PREVIEW_PARTIAL','PREVIEW_READY','QA_RUNNING','REWORK')
      and not (v.status='RENDER_READY' and v.certified_revision is not null)
      and not exists (
        select 1 from render_workflows_v2 vw
        where vw.variant_id=v.id
          and vw.workflow_type='VARIANT'
      )
    order by pr.rank asc nulls last,p.priority asc nulls last,v.variant_key asc
    limit ${Number(limit)}`;
}
