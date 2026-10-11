-- ImpresaX Ops foundation
-- Applied to Neon project: ImpresaX Ops (wispy-morning-45609027)
-- Database: impresax_ops
-- This file is the versioned reference for the operational schema.

CREATE TYPE pipeline_status AS ENUM (
  'READY_FOR_RENDERING','RENDERING','RENDER_REWORK','APPROVED_REFERENCE',
  'READY_FOR_BUILD','BUILDING','BUILD_REWORK','QA_RUNNING','QA_FAILED',
  'ESCALATION_REQUIRED','DEMO_READY','SALES_READY','CONTACTED','WON','LOST','HOLD'
);

CREATE TABLE prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rank integer,
  business_name text NOT NULL,
  vertical text NOT NULL,
  city text,
  country text DEFAULT 'IT',
  website_url text,
  slug text UNIQUE,
  priority text NOT NULL DEFAULT 'B' CHECK (priority IN ('A','B','C')),
  pipeline_status pipeline_status NOT NULL DEFAULT 'READY_FOR_RENDERING',
  render_status text,
  build_status text,
  qa_status text,
  current_step text NOT NULL DEFAULT 'READY_FOR_RENDERING',
  live_url text,
  primary_problem text,
  source_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  brand_dna jsonb NOT NULL DEFAULT '{}'::jsonb,
  logo jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  next_action text NOT NULL DEFAULT 'START_RENDERING',
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries integer NOT NULL DEFAULT 3 CHECK (max_retries >= 1),
  hold_reason text,
  legacy_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'QUEUED',
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  worker text,input_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_data jsonb NOT NULL DEFAULT '{}'::jsonb,error text,
  started_at timestamptz,completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE render_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  render_job_id uuid REFERENCES render_jobs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'GENERATED',
  version integer NOT NULL DEFAULT 1,
  desktop_render_url text,mobile_render_url text,
  brand_dna jsonb NOT NULL DEFAULT '{}'::jsonb,
  reference_score numeric(5,2),
  approved_reference boolean NOT NULL DEFAULT false,
  approved_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prospect_id, version)
);

CREATE TABLE render_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  render_pack_id uuid NOT NULL REFERENCES render_packs(id) ON DELETE CASCADE,
  asset_type text NOT NULL,asset_url text NOT NULL,source_type text,rights_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE site_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  render_pack_id uuid REFERENCES render_packs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'QUEUED',attempt integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  repository text,branch text,commit_sha text,deploy_id text,live_url text,
  build_meta jsonb NOT NULL DEFAULT '{}'::jsonb,error text,
  started_at timestamptz,completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE qa_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  site_build_id uuid REFERENCES site_builds(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'QUEUED',attempt integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  viewport_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  technical_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  visual_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  screenshots jsonb NOT NULL DEFAULT '{}'::jsonb,error text,
  started_at timestamptz,completed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE site_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prospect_id uuid REFERENCES prospects(id) ON DELETE SET NULL,
  event_type text NOT NULL,entity_type text,entity_id text,actor text NOT NULL DEFAULT 'system',
  from_status pipeline_status,to_status pipeline_status,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sales_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING',demo_url text,primary_problem text,
  what_we_changed jsonb NOT NULL DEFAULT '[]'::jsonb,why_it_matters text,
  commercial_angle text,outreach_hook text,payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),handed_off_at timestamptz
);

CREATE TABLE orchestrator_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  task_type text NOT NULL,status text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED')),
  priority integer NOT NULL DEFAULT 100,attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,locked_by text,payload jsonb NOT NULL DEFAULT '{}'::jsonb,error text,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX orchestrator_one_active_task
ON orchestrator_queue(prospect_id,task_type) WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX prospects_pipeline_status_idx ON prospects(pipeline_status);
CREATE INDEX prospects_rank_idx ON prospects(rank);
CREATE INDEX render_jobs_prospect_idx ON render_jobs(prospect_id,created_at DESC);
CREATE INDEX render_packs_prospect_idx ON render_packs(prospect_id,version DESC);
CREATE INDEX site_builds_prospect_idx ON site_builds(prospect_id,created_at DESC);
CREATE INDEX qa_runs_prospect_idx ON qa_runs(prospect_id,created_at DESC);
CREATE INDEX site_events_prospect_idx ON site_events(prospect_id,created_at DESC);
CREATE INDEX orchestrator_queue_ready_idx ON orchestrator_queue(status,available_at,priority);

-- Functions, transition validation, retry escalation, queue claiming and event triggers
-- are installed in production and documented in docs/impresax-ops-foundation.md.
-- Keep changes forward-only: site_events is append-only and ID_PROSPECT is immutable.
