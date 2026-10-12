-- ImpresaX Ops
-- Render variants A/B/C as complete selectable full-home candidates.

create table if not exists render_variants (
  id uuid primary key default gen_random_uuid(),
  render_pack_id uuid not null references render_packs(id) on delete cascade,
  variant_key text not null check (variant_key in ('A','B','C')),
  name text not null,
  status text not null default 'GENERATED',
  desktop_render_url text,
  mobile_render_url text,
  reference_score numeric,
  selected boolean not null default false,
  brand_dna jsonb not null default '{}'::jsonb,
  palette jsonb not null default '{}'::jsonb,
  typography jsonb not null default '{}'::jsonb,
  image_asset_map jsonb not null default '{}'::jsonb,
  section_map jsonb not null default '[]'::jsonb,
  cta_map jsonb not null default '{}'::jsonb,
  content_map jsonb not null default '{}'::jsonb,
  source_references jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(render_pack_id, variant_key)
);

create index if not exists render_variants_pack_idx
  on render_variants(render_pack_id, variant_key);

create unique index if not exists render_variants_one_selected_per_pack
  on render_variants(render_pack_id)
  where selected = true;
