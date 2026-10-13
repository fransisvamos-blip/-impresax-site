-- ImpresaX Rendering Pipeline V2 — input and truth certification defense-in-depth.
-- Additive; V8.x remains untouched.

create or replace function public.render_v2_input_certification_guard()
returns trigger language plpgsql as $$
declare
  logo_status text;
  bad_assets integer;
begin
  if new.certification_status<>'PASS' then
    return new;
  end if;

  logo_status:=upper(coalesce(new.payload->'official_logo'->>'status',''));
  if logo_status not in ('PASS','OFFICIAL_LOGO_LOCKED','NO_OFFICIAL_LOGO_CONFIRMED') then
    raise exception 'RENDER_V2_INPUT: OFFICIAL_IDENTITY_NOT_CERTIFIED';
  end if;

  if logo_status in ('PASS','OFFICIAL_LOGO_LOCKED') and not exists (
    select 1
    from jsonb_array_elements(coalesce(new.payload->'assets','[]'::jsonb)) a
    where a->>'asset_id'='PRIMARY_LOGO'
      and a->>'role'='identity'
      and upper(coalesce(a->>'commercial_use_status',''))='OFFICIAL_IDENTITY'
      and coalesce(a->>'source_url','') ~ '^https?://'
  ) then
    raise exception 'RENDER_V2_INPUT: PRIMARY_LOGO_ASSET_REQUIRED';
  end if;

  if logo_status='NO_OFFICIAL_LOGO_CONFIRMED' and (
      coalesce((new.payload->'official_logo'->>'generated')::boolean,true)<>false
      or coalesce((new.payload->'official_logo'->>'use_verified_name_as_text')::boolean,false)<>true
  ) then
    raise exception 'RENDER_V2_INPUT: VERIFIED_TEXT_IDENTITY_REQUIRED';
  end if;

  if upper(trim(coalesce(new.payload->>'verified_services',''))) in ('','NON_DISPONIBILE','NON DISPONIBILE','N/A','NA','UNKNOWN','NON_VERIFICATO','NON VERIFICATO','NOT_AVAILABLE') then
    raise exception 'RENDER_V2_INPUT: VERIFIED_SERVICES_REQUIRED';
  end if;

  if upper(trim(coalesce(new.payload->>'verified_contacts',''))) in ('','NON_DISPONIBILE','NON DISPONIBILE','N/A','NA','UNKNOWN','NON_VERIFICATO','NON VERIFICATO','NOT_AVAILABLE') then
    raise exception 'RENDER_V2_INPUT: VERIFIED_CONTACTS_REQUIRED';
  end if;

  if upper(trim(coalesce(new.payload->>'address',''))) in ('','NON_DISPONIBILE','NON DISPONIBILE','N/A','NA','UNKNOWN','NON_VERIFICATO','NON VERIFICATO','NOT_AVAILABLE') then
    raise exception 'RENDER_V2_INPUT: VERIFIED_LOCATION_REQUIRED';
  end if;

  if jsonb_typeof(coalesce(new.payload->'source_references','[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(new.payload->'source_references','[]'::jsonb))=0 then
    raise exception 'RENDER_V2_INPUT: SOURCE_REFERENCES_REQUIRED';
  end if;

  select count(*)::int into bad_assets
  from jsonb_array_elements(coalesce(new.payload->'assets','[]'::jsonb)) a
  where coalesce(a->>'source_url','') !~ '^https?://'
     or upper(coalesce(a->>'commercial_use_status','')) not in (
       'OFFICIAL_IDENTITY','FIRST_PARTY_REFERENCE','APPROVED_EXTERNAL','APPROVED_COMMERCIAL','LICENSED_COMMERCIAL'
     );
  if bad_assets>0 then
    raise exception 'RENDER_V2_INPUT: ASSET_PROVENANCE_OR_USE_UNRESOLVED got %',bad_assets;
  end if;

  return new;
end
$$;

drop trigger if exists trg_render_v2_input_certification_guard on public.render_input_packs;

create trigger trg_render_v2_input_certification_guard
before insert on public.render_input_packs
for each row execute function public.render_v2_input_certification_guard();

create or replace function public.render_v2_truth_certification_guard()
returns trigger language plpgsql as $$
begin
  if new.status in ('RENDER_READY','SELECTED','APPROVED') or new.approved_reference=true then
    if not exists (
      select 1
      from render_qa_results_v2 q
      join render_creative_plans_v2 c on c.render_pack_id=new.id
      where q.render_pack_id=new.id
        and q.variant_revision_id is null
        and q.qa_type='CONTENT_TRUTH'
        and q.status='PASS'
        and q.artifact_hashes->>'content_truth_hash' is not null
    ) then
      raise exception 'RENDER_V2_CERTIFICATION: CONTENT_TRUTH_QA_PASS_REQUIRED';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists trg_render_v2_truth_certification_guard on public.render_v2_packs;

create trigger trg_render_v2_truth_certification_guard
before update of status,approved_reference,selected_variant_revision_id on public.render_v2_packs
for each row execute function public.render_v2_truth_certification_guard();
