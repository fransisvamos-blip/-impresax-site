-- ImpresaX Ops
-- Cloudflare-native rendering owns READY_FOR_RENDERING / RENDER_REWORK.
-- orchestrator_queue starts only after explicit APPROVED_REFERENCE.

create or replace function public.ops_enqueue_for_status(p_prospect_id uuid, s pipeline_status)
returns void
language plpgsql
as $function$
declare
  task text;
  pack_id uuid;
  pack_version integer;
  inserted_id bigint;
begin
  task:=case s
    when 'APPROVED_REFERENCE' then 'PREPARE_BUILD'
    when 'READY_FOR_BUILD' then 'BUILD'
    when 'BUILD_REWORK' then 'BUILD'
    when 'QA_RUNNING' then 'QA'
    when 'QA_FAILED' then 'QA_REWORK'
    when 'DEMO_READY' then 'SALES_HANDOFF'
    else null
  end;

  if task is null then return; end if;

  if task in ('PREPARE_BUILD','BUILD','QA','QA_REWORK','SALES_HANDOFF') then
    select x.render_pack_id,x.render_pack_version
    into pack_id,pack_version
    from ops_current_approved_pack(p_prospect_id) x;
  end if;

  insert into orchestrator_queue(
    prospect_id,task_type,priority,max_attempts,render_pack_id,render_pack_version,payload
  )
  select p_prospect_id,task,
         case p.priority when 'A' then 10 when 'B' then 50 else 100 end,
         case when task in ('PREPARE_BUILD','BUILD','QA','QA_REWORK') then 5 else 3 end,
         pack_id,pack_version,
         jsonb_strip_nulls(jsonb_build_object(
           'render_pack_id',pack_id,
           'render_pack_version',pack_version,
           'orchestrator_version','V1',
           'render_owner','CLOUDFLARE_NATIVE'
         ))
  from prospects p
  where p.id=p_prospect_id
  on conflict do nothing
  returning id into inserted_id;

  if inserted_id is not null and task='BUILD' then
    insert into site_events(prospect_id,event_type,entity_type,entity_id,actor,payload)
    values(
      p_prospect_id,'BUILD_JOB_CREATED','orchestrator_queue',inserted_id::text,'orchestrator-v1',
      jsonb_build_object('queue_id',inserted_id,'render_pack_id',pack_id,'render_pack_version',pack_version)
    );
  end if;
end
$function$;

create or replace function public.ops_reconcile_orchestrator()
returns integer
language plpgsql
as $function$
declare
  r record;
  n integer:=0;
  cleaned integer:=0;
begin
  update orchestrator_queue
  set status='CANCELLED',
      locked_at=null,
      heartbeat_at=null,
      locked_by=null,
      error='SUPERSEDED_BY_CLOUDFLARE_NATIVE_RENDER_ENGINE',
      updated_at=now()
  where task_type='RENDER'
    and status in ('QUEUED','RUNNING');

  get diagnostics cleaned = row_count;
  n:=n+cleaned;

  for r in
    select p.id,p.pipeline_status
    from prospects p
    where p.pipeline_status in (
      'APPROVED_REFERENCE','READY_FOR_BUILD','BUILD_REWORK','QA_RUNNING','QA_FAILED','DEMO_READY'
    )
  loop
    perform ops_enqueue_for_status(r.id,r.pipeline_status);
    n:=n+1;
  end loop;

  return n;
end
$function$;

with cancelled as (
  update orchestrator_queue
  set status='CANCELLED',
      locked_at=null,
      heartbeat_at=null,
      locked_by=null,
      error='SUPERSEDED_BY_CLOUDFLARE_NATIVE_RENDER_ENGINE',
      updated_at=now()
  where task_type='RENDER'
    and status in ('QUEUED','RUNNING')
  returning id,prospect_id
)
insert into site_events(prospect_id,event_type,entity_type,entity_id,actor,payload)
select
  prospect_id,
  'LEGACY_RENDER_QUEUE_CANCELLED',
  'orchestrator_queue',
  id::text,
  'cabina-p0-render-pipeline',
  jsonb_build_object('queue_id',id,'reason','CLOUDFLARE_NATIVE_RENDER_ENGINE_OWNS_RENDERING')
from cancelled;
