-- ImpresaX Autonomous Site Factory
-- Migration 006: structured approved Render Pack contract + autonomous build/QA cycle tracking.

ALTER TABLE public.render_packs
  ADD COLUMN IF NOT EXISTS official_logo jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS palette jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS typography jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS image_asset_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS section_map jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cta_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS content_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_references jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS build_qa_cycle_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION ops_transition_prospect(
  p_prospect_id uuid,p_to pipeline_status,p_event_type text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,p_actor text DEFAULT 'orchestrator'
)
RETURNS prospects LANGUAGE plpgsql AS $$
DECLARE old_row prospects%ROWTYPE; new_row prospects%ROWTYPE;
BEGIN
  SELECT * INTO old_row FROM prospects WHERE id=p_prospect_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'prospect % not found',p_prospect_id; END IF;
  IF NOT ops_transition_allowed(old_row.pipeline_status,p_to) THEN
    RAISE EXCEPTION 'invalid pipeline transition: % -> %',old_row.pipeline_status,p_to;
  END IF;

  UPDATE prospects
  SET pipeline_status=p_to,current_step=p_to::text,next_action=ops_next_action(p_to),
      updated_at=now(),
      build_qa_cycle_count=CASE
        WHEN p_to='APPROVED_REFERENCE' THEN 0
        ELSE build_qa_cycle_count
      END,
      render_status=CASE
        WHEN p_to='APPROVED_REFERENCE' THEN 'APPROVED'
        ELSE render_status
      END,
      build_status=CASE
        WHEN p_to='READY_FOR_BUILD' THEN 'READY'
        WHEN p_to='BUILDING' THEN 'RUNNING'
        WHEN p_to='BUILD_REWORK' THEN 'REWORK'
        ELSE build_status
      END,
      qa_status=CASE
        WHEN p_to='QA_RUNNING' THEN 'RUNNING'
        WHEN p_to='QA_FAILED' THEN 'FAIL'
        WHEN p_to='DEMO_READY' THEN 'PASS'
        ELSE qa_status
      END,
      error=CASE WHEN p_to IN ('RENDER_REWORK','BUILD_REWORK','QA_FAILED','ESCALATION_REQUIRED') THEN error ELSE NULL END
  WHERE id=p_prospect_id RETURNING * INTO new_row;

  INSERT INTO site_events(prospect_id,event_type,entity_type,entity_id,actor,from_status,to_status,payload)
  VALUES(p_prospect_id,COALESCE(p_event_type,'STATUS_CHANGED'),'prospect',p_prospect_id::text,
         p_actor,old_row.pipeline_status,p_to,p_payload);

  PERFORM ops_enqueue_for_status(p_prospect_id,p_to);
  RETURN new_row;
END
$$;

CREATE OR REPLACE FUNCTION ops_register_factory_failure(
  p_prospect_id uuid,p_stage text,p_error text,p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS prospects LANGUAGE plpgsql AS $$
DECLARE p prospects%ROWTYPE; next_status pipeline_status; n integer;
BEGIN
  SELECT * INTO p FROM prospects WHERE id=p_prospect_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'prospect % not found',p_prospect_id; END IF;

  n:=p.build_qa_cycle_count+1;
  UPDATE prospects
  SET build_qa_cycle_count=n,error=p_error,updated_at=now()
  WHERE id=p_prospect_id;

  IF n>=5 THEN
    next_status:='ESCALATION_REQUIRED';
  ELSIF lower(p_stage)='build' THEN
    next_status:='BUILD_REWORK';
  ELSE
    next_status:='QA_FAILED';
  END IF;

  RETURN ops_transition_prospect(
    p_prospect_id,next_status,upper(p_stage)||'_FAILED',
    p_payload||jsonb_build_object('error',p_error,'factory_cycle',n,'max_cycles',5),
    'site-factory'
  );
END
$$;
