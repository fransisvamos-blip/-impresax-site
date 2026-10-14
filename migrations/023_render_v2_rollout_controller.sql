create table if not exists render_v2_rollout_state (
  id smallint primary key default 1 check (id=1),
  phase text not null default 'PILOT',
  pilot_pack_id uuid null references render_v2_packs(id) on delete set null,
  pilot_passed_at timestamptz null,
  golden_started_at timestamptz null,
  golden_passed_at timestamptz null,
  chaos_started_at timestamptz null,
  chaos_passed_at timestamptz null,
  queue_enabled boolean not null default false,
  max_concurrency integer not null default 3 check (max_concurrency between 1 and 10),
  last_tick_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into render_v2_rollout_state(id,phase,queue_enabled,max_concurrency)
values(1,'PILOT',false,3)
on conflict (id) do nothing;

create table if not exists render_v2_golden_cases (
  code text primary key,
  expected_input text not null,
  pack_id uuid null references render_v2_packs(id) on delete set null,
  actual_input text null,
  status text not null default 'PENDING',
  validation jsonb not null default '{}'::jsonb,
  started_at timestamptz null,
  completed_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_render_v2_golden_cases_status
  on render_v2_golden_cases(status,updated_at);

create table if not exists render_v2_chaos_probes (
  probe_key text primary key,
  workflow_instance_id text unique,
  status text not null default 'PENDING',
  side_effect_count integer not null default 0,
  effect_applied boolean not null default false,
  transient_attempts integer not null default 0,
  transient_seen boolean not null default false,
  completed boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_render_v2_chaos_probes_status
  on render_v2_chaos_probes(status,updated_at);
