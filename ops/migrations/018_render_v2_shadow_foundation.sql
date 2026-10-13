-- ImpresaX Rendering Pipeline V2 — additive shadow foundation
-- Safe for coexistence with V8.x. No legacy table is altered or dropped.

create table if not exists render_v2_packs (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  input_pack_id uuid,
  status text not null default 'INPUT_PENDING',
  quality_contract_version text not null default 'RS_QUALITY_V1',
  execution_engine_version text not null default 'RS_ENGINE_V2_0',
  model_route_version text not null default 'ROUTES_2026_10_A',
  priority integer not null default 100,
  preview_ready_at timestamptz,
  render_ready_at timestamptz,
  selected_variant_revision_id uuid,
  approved_reference boolean not null default false,
  shadow_mode boolean not null default true,
  metrics jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists render_v2_one_active_pack_per_prospect
  on render_v2_packs(prospect_id)
  where status not in ('CANCELLED','SUPERSEDED','APPROVED');

create table if not exists render_input_packs (
  id uuid primary key default gen_random_uuid(),
  render_pack_id uuid not null references render_v2_packs(id) on delete cascade,
  prospect_id uuid not null references prospects(id) on delete cascade,
  input_version integer not null,
  quality_contract_version text not null,
  content_hash text not null,
  certification_status text not null default 'PENDING',
  certification_issues jsonb not null default '[]'::jsonb,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(prospect_id,input_version),
  unique(render_pack_id)
);

alter table render_v2_packs
  drop constraint if exists render_v2_packs_input_pack_fk;
alter table render_v2_packs
  add constraint render_v2_packs_input_pack_fk
  foreign key(input_pack_id) references render_input_packs(id) deferrable initially deferred;

create table if not exists render_creative_plans_v2 (
  id uuid primary key default gen_random_uuid(),
  render_pack_id uuid not null references render_v2_packs(id) on delete cascade,
  input_pack_id uuid not null references render_input_packs(id) on delete cascade,
  status text not null default 'PLANNING',
  content_truth_pack jsonb not null default '{}'::jsonb,
  creative_strategy text,
  directions jsonb not null default '{}'::jsonb,
  fingerprints jsonb not null default '{}'::jsonb,
  diversity_precheck jsonb not null default '{}'::jsonb,
  model_route_version text not null,
  prompt_version text not null,
  content_hash text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(render_pack_id)
);

create table if not exists render_v2_variants (
  id uuid primary key default gen_random_uuid(),
  render_pack_id uuid not null references render_v2_packs(id) on delete cascade,
  variant_key text not null check(variant_key in ('A','B','C')),
  status text not null default 'PLANNED',
  current_revision integer not null default 0,
  best_preview_revision integer,
  best_qa_revision integer,
  certified_revision integer,
  direction_fingerprint jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(render_pack_id,variant_key)
);

create table if not exists render_variant_revisions (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references render_v2_variants(id) on delete cascade,
  revision integer not null,
  status text not null default 'GENERATING',
  render_spec jsonb not null default '{}'::jsonb,
  compiler_version text not null default 'RS_COMPILER_V1',
  source_hash text,
  html_r2_key text,
  desktop_r2_key text,
  mobile_r2_key text,
  parent_revision_id uuid references render_variant_revisions(id),
  score numeric,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(variant_id,revision)
);

create table if not exists render_workflows_v2 (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  render_pack_id uuid not null references render_v2_packs(id) on delete cascade,
  variant_id uuid references render_v2_variants(id) on delete cascade,
  variant_revision_id uuid references render_variant_revisions(id) on delete cascade,
  workflow_type text not null,
  workflow_instance_id text not null,
  execution_engine_version text not null,
  status text not null default 'QUEUED',
  current_step text,
  attempt integer not null default 0,
  last_event_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(workflow_instance_id)
);

create table if not exists render_artifacts_v2 (
  id uuid primary key default gen_random_uuid(),
  render_pack_id uuid not null references render_v2_packs(id) on delete cascade,
  variant_revision_id uuid references render_variant_revisions(id) on delete cascade,
  artifact_type text not null,
  r2_key text not null,
  sha256 text not null,
  mime text not null,
  bytes bigint not null,
  producer_step text not null,
  execution_engine_version text not null,
  created_at timestamptz not null default now(),
  unique(r2_key),
  unique(variant_revision_id,artifact_type,sha256)
);

create table if not exists render_qa_results_v2 (
  id uuid primary key default gen_random_uuid(),
  render_pack_id uuid not null references render_v2_packs(id) on delete cascade,
  variant_revision_id uuid references render_variant_revisions(id) on delete cascade,
  qa_type text not null,
  status text not null,
  scores jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  artifact_hashes jsonb not null default '{}'::jsonb,
  model_route_version text,
  prompt_version text,
  created_at timestamptz not null default now()
);

create table if not exists render_failures_v2 (
  id uuid primary key default gen_random_uuid(),
  render_pack_id uuid not null references render_v2_packs(id) on delete cascade,
  workflow_id uuid references render_workflows_v2(id) on delete set null,
  variant_revision_id uuid references render_variant_revisions(id) on delete set null,
  step text not null,
  failure_domain text not null,
  failure_code text not null,
  fingerprint text not null,
  retryable boolean not null default false,
  strategy_version text not null,
  attempt integer not null default 1,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists render_failures_v2_fingerprint_idx
  on render_failures_v2(render_pack_id,fingerprint,created_at desc);

create table if not exists render_metrics_v2 (
  id bigserial primary key,
  render_pack_id uuid not null references render_v2_packs(id) on delete cascade,
  variant_revision_id uuid references render_variant_revisions(id) on delete cascade,
  metric_name text not null,
  metric_value numeric not null,
  unit text not null,
  dimensions jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

create index if not exists render_v2_pack_status_idx on render_v2_packs(status,priority,created_at);
create index if not exists render_v2_variant_status_idx on render_v2_variants(render_pack_id,status);
create index if not exists render_v2_revision_status_idx on render_variant_revisions(variant_id,status,revision desc);
create index if not exists render_v2_workflow_status_idx on render_workflows_v2(render_pack_id,status,last_event_at desc);
create index if not exists render_v2_artifact_pack_idx on render_artifacts_v2(render_pack_id,artifact_type);
create index if not exists render_v2_qa_pack_idx on render_qa_results_v2(render_pack_id,qa_type,created_at desc);

create or replace view render_v2_control_room as
select
  p.id prospect_id,
  coalesce(p.legacy_ids->>'id_prospect',p.source_data->>'id_prospect') prospect_code,
  p.business_name,
  p.rank,
  vp.id render_pack_id,
  vp.status render_v2_status,
  vp.shadow_mode,
  vp.preview_ready_at,
  vp.render_ready_at,
  vp.execution_engine_version,
  vp.updated_at,
  max(case when vv.variant_key='A' then vv.status end) variant_a_status,
  max(case when vv.variant_key='B' then vv.status end) variant_b_status,
  max(case when vv.variant_key='C' then vv.status end) variant_c_status
from prospects p
left join lateral (
  select x.* from render_v2_packs x
  where x.prospect_id=p.id
  order by x.created_at desc
  limit 1
) vp on true
left join render_v2_variants vv on vv.render_pack_id=vp.id
group by p.id,p.legacy_ids,p.source_data,p.business_name,p.rank,
         vp.id,vp.status,vp.shadow_mode,vp.preview_ready_at,vp.render_ready_at,
         vp.execution_engine_version,vp.updated_at;
