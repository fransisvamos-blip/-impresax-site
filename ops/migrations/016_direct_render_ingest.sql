-- ImpresaX direct render ingest bridge
-- Queue -> public capability-token chunks -> Neon staging -> Browser render -> Gestionale

create table if not exists render_ingest_tokens (
  render_pack_id uuid primary key references render_packs(id) on delete cascade,
  prospect_id uuid not null references prospects(id) on delete cascade,
  prospect_code text not null,
  version integer not null,
  token text not null unique default (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists render_ingest_chunks (
  render_pack_id uuid not null references render_packs(id) on delete cascade,
  variant_key text not null check (variant_key in ('A','B','C')),
  part integer not null check (part >= 1 and part <= 100),
  total_parts integer not null check (total_parts >= 1 and total_parts <= 100),
  data text not null,
  created_at timestamptz not null default now(),
  primary key(render_pack_id,variant_key,part)
);

create table if not exists render_preview_cache (
  variant_id uuid not null references render_variants(id) on delete cascade,
  viewport text not null check (viewport in ('desktop','mobile')),
  html_sha256 text not null,
  mime_type text not null default 'image/jpeg',
  asset bytea not null,
  width integer not null,
  height integer not null,
  created_at timestamptz not null default now(),
  primary key(variant_id,viewport,html_sha256)
);

create index if not exists idx_render_ingest_tokens_code_version
  on render_ingest_tokens(prospect_code,version);

create index if not exists idx_render_ingest_chunks_pack_variant
  on render_ingest_chunks(render_pack_id,variant_key);

create or replace function ensure_render_ingest_pack()
returns trigger
language plpgsql
as $$
declare
  v_pack_id uuid;
  v_version integer;
  v_code text;
begin
  if new.pipeline_status <> 'READY_FOR_RENDERING'::pipeline_status then
    return new;
  end if;

  v_code := coalesce(new.legacy_ids->>'id_prospect', new.source_data->>'id_prospect');

  select id,version into v_pack_id,v_version
  from render_packs
  where prospect_id=new.id
    and approved_reference=false
    and upper(status) not like '%ARCHIVED%'
    and upper(status) not like '%REJECT%'
  order by version desc
  limit 1;

  if v_pack_id is null then
    select coalesce(max(version),0)+1 into v_version
    from render_packs where prospect_id=new.id;

    insert into render_packs(
      prospect_id,status,version,approved_reference,brand_dna,official_logo,source_references
    ) values(
      new.id,'ART_DIRECTION',v_version,false,
      coalesce(new.brand_dna,'{}'::jsonb),
      coalesce(new.logo,'{}'::jsonb),
      case
        when jsonb_typeof(new.source_data->'source_references')='array'
        then new.source_data->'source_references'
        else '[]'::jsonb
      end
    ) returning id into v_pack_id;
  end if;

  if v_code is not null and v_code <> '' then
    insert into render_ingest_tokens(render_pack_id,prospect_id,prospect_code,version)
    values(v_pack_id,new.id,v_code,v_version)
    on conflict(render_pack_id) do update set
      prospect_id=excluded.prospect_id,
      prospect_code=excluded.prospect_code,
      version=excluded.version,
      expires_at=greatest(render_ingest_tokens.expires_at,now()+interval '7 days');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ensure_render_ingest_pack on prospects;
create trigger trg_ensure_render_ingest_pack
after insert or update of pipeline_status on prospects
for each row execute function ensure_render_ingest_pack();
