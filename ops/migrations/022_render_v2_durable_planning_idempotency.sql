-- ImpresaX Rendering Pipeline V2 — independently durable planning artifacts and idempotency.

create table if not exists public.render_content_truth_v2 (
  id uuid primary key default gen_random_uuid(),
  render_pack_id uuid not null references render_v2_packs(id) on delete cascade,
  input_pack_id uuid not null references render_input_packs(id) on delete cascade,
  status text not null default 'COMPLETED',
  payload jsonb not null,
  content_hash text not null,
  verification jsonb not null,
  generator_model text,
  reviewer_model text,
  model_route_version text not null,
  prompt_version text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  unique(render_pack_id)
);

create table if not exists public.render_direction_plans_v2 (
  id uuid primary key default gen_random_uuid(),
  render_pack_id uuid not null references render_v2_packs(id) on delete cascade,
  input_pack_id uuid not null references render_input_packs(id) on delete cascade,
  status text not null default 'COMPLETED',
  creative_strategy text not null,
  directions jsonb not null,
  fingerprints jsonb not null,
  diversity_precheck jsonb not null,
  content_hash text not null,
  model text,
  model_route_version text not null,
  prompt_version text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  unique(render_pack_id)
);

alter table public.render_variant_revisions
  add column if not exists allocation_key text;

create unique index if not exists render_variant_revisions_allocation_key_uniq
  on public.render_variant_revisions(allocation_key)
  where allocation_key is not null;

alter table public.render_qa_results_v2
  add column if not exists idempotency_key text;

create unique index if not exists render_qa_results_v2_idempotency_uniq
  on public.render_qa_results_v2(idempotency_key)
  where idempotency_key is not null;

create or replace function public.render_v2_completed_component_immutable()
returns trigger language plpgsql as $$
begin
  if old.status='COMPLETED' and new is distinct from old then
    raise exception 'RENDER_V2_INVARIANT: COMPLETED_PLANNING_COMPONENT_IMMUTABLE';
  end if;
  return new;
end
$$;

drop trigger if exists trg_render_v2_content_truth_immutable on public.render_content_truth_v2;
create trigger trg_render_v2_content_truth_immutable
before update on public.render_content_truth_v2
for each row execute function public.render_v2_completed_component_immutable();

drop trigger if exists trg_render_v2_direction_plan_immutable on public.render_direction_plans_v2;
create trigger trg_render_v2_direction_plan_immutable
before update on public.render_direction_plans_v2
for each row execute function public.render_v2_completed_component_immutable();
