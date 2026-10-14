-- ImpresaX Rendering Pipeline V2 — premium hero certification hard gate.
-- Additive replacement of the existing certification guard.

create or replace function public.render_v2_certification_guard()
returns trigger language plpgsql as $$
declare
  input_ok boolean;
  plan_ok boolean;
  certified_count integer;
  qa_count integer;
  hero_qa_count integer;
  artifact_complete_count integer;
  current_revisions jsonb;
  set_qa jsonb;
begin
  if new.approved_reference=true and new.shadow_mode=true then
    raise exception 'RENDER_V2_CERTIFICATION: SHADOW_PACK_CANNOT_APPROVE';
  end if;

  if not (
    new.status in ('RENDER_READY','SELECTED','APPROVED')
    or new.approved_reference=true
  ) then
    return new;
  end if;

  select exists(
    select 1 from render_input_packs i
    where i.id=new.input_pack_id
      and i.render_pack_id=new.id
      and i.certification_status='PASS'
      and i.content_hash is not null
  ) into input_ok;
  if not input_ok then
    raise exception 'RENDER_V2_CERTIFICATION: CERTIFIED_INPUT_PACK_REQUIRED';
  end if;

  select exists(
    select 1 from render_creative_plans_v2 c
    where c.render_pack_id=new.id
      and c.status='COMPLETED'
      and c.content_hash is not null
      and coalesce((c.diversity_precheck->>'pass')::boolean,false)=true
  ) into plan_ok;
  if not plan_ok then
    raise exception 'RENDER_V2_CERTIFICATION: COMPLETED_CREATIVE_PLAN_REQUIRED';
  end if;

  select count(*)::int,
         coalesce(jsonb_object_agg(v.variant_key,r.id::text),'{}'::jsonb)
    into certified_count,current_revisions
  from render_v2_variants v
  join render_variant_revisions r
    on r.variant_id=v.id
   and r.revision=v.certified_revision
  where v.render_pack_id=new.id
    and v.variant_key in ('A','B','C')
    and v.status='RENDER_READY'
    and r.status='RENDER_READY'
    and r.source_hash is not null
    and r.html_r2_key is not null
    and r.desktop_r2_key is not null
    and r.mobile_r2_key is not null;

  if certified_count<>3 then
    raise exception 'RENDER_V2_CERTIFICATION: THREE_CERTIFIED_VARIANTS_REQUIRED got %',certified_count;
  end if;

  select count(*)::int into qa_count
  from render_v2_variants v
  join render_variant_revisions r
    on r.variant_id=v.id and r.revision=v.certified_revision
  where v.render_pack_id=new.id
    and exists(
      select 1 from render_qa_results_v2 q
      where q.render_pack_id=new.id
        and q.variant_revision_id=r.id
        and q.qa_type='VARIANT_VISUAL'
        and q.status='PASS'
    );
  if qa_count<>3 then
    raise exception 'RENDER_V2_CERTIFICATION: THREE_VARIANT_QA_PASSES_REQUIRED got %',qa_count;
  end if;

  select count(*)::int into hero_qa_count
  from render_v2_variants v
  join render_variant_revisions r
    on r.variant_id=v.id and r.revision=v.certified_revision
  where v.render_pack_id=new.id
    and exists(
      select 1 from render_qa_results_v2 q
      where q.render_pack_id=new.id
        and q.variant_revision_id=r.id
        and q.qa_type='HERO_VISUAL'
        and q.status='PASS'
        and coalesce((q.scores->>'hero_strength')::numeric,0)>=8
        and coalesce((q.scores->>'hero_relevance')::numeric,0)>=8
        and coalesce((q.scores->>'hero_image_quality')::numeric,0)>=8
        and coalesce((q.scores->>'hero_mobile_crop')::numeric,0)>=8
    );
  if hero_qa_count<>3 then
    raise exception 'RENDER_V2_CERTIFICATION: THREE_HERO_QA_PASSES_REQUIRED got %',hero_qa_count;
  end if;

  select count(*)::int into artifact_complete_count
  from render_v2_variants v
  join render_variant_revisions r
    on r.variant_id=v.id and r.revision=v.certified_revision
  where v.render_pack_id=new.id
    and (select count(distinct a.artifact_type)
         from render_artifacts_v2 a
         where a.variant_revision_id=r.id
           and a.artifact_type in ('SOURCE_HTML','DESKTOP_1440','MOBILE_390','HERO_VISUAL_USED')
           and a.sha256 is not null
           and a.bytes>0)=4;
  if artifact_complete_count<>3 then
    raise exception 'RENDER_V2_CERTIFICATION: CERTIFIED_ARTIFACT_SET_WITH_HERO_INCOMPLETE got %',artifact_complete_count;
  end if;

  select q.artifact_hashes into set_qa
  from render_qa_results_v2 q
  where q.render_pack_id=new.id
    and q.variant_revision_id is null
    and q.qa_type='SET_VISUAL'
    and q.status='PASS'
  order by q.created_at desc
  limit 1;

  if set_qa is null
     or set_qa->>'A_revision_id' is distinct from current_revisions->>'A'
     or set_qa->>'B_revision_id' is distinct from current_revisions->>'B'
     or set_qa->>'C_revision_id' is distinct from current_revisions->>'C' then
    raise exception 'RENDER_V2_CERTIFICATION: CURRENT_SET_QA_PASS_REQUIRED';
  end if;

  if new.status in ('SELECTED','APPROVED') or new.approved_reference=true then
    if new.selected_variant_revision_id is null
       or not exists(
         select 1
         from render_v2_variants v
         join render_variant_revisions r
           on r.variant_id=v.id and r.revision=v.certified_revision
         where v.render_pack_id=new.id
           and r.id=new.selected_variant_revision_id
           and v.status='RENDER_READY'
           and r.status='RENDER_READY'
       ) then
      raise exception 'RENDER_V2_CERTIFICATION: SELECTED_CERTIFIED_REVISION_REQUIRED';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_render_v2_certification_guard on public.render_v2_packs;
create trigger trg_render_v2_certification_guard
before update of status,approved_reference,selected_variant_revision_id on public.render_v2_packs
for each row execute function public.render_v2_certification_guard();
