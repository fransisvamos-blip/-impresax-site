create table if not exists render_staging_payloads (
  id uuid primary key default gen_random_uuid(),
  render_pack_id uuid not null references render_packs(id) on delete cascade,
  variant_key text not null check (variant_key in ('A','B','C')),
  status text not null default 'STAGED_SOURCE',
  html_source text,
  design_notes jsonb not null default '{}'::jsonb,
  source_render_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(render_pack_id, variant_key)
);

create index if not exists idx_render_staging_payloads_pack
  on render_staging_payloads(render_pack_id);
