-- ImpresaX Ops logic layer
-- Status engine, orchestrator queueing, failure escalation, immutable IDs and event log.

CREATE OR REPLACE FUNCTION ops_next_action(s pipeline_status)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE s
    WHEN 'READY_FOR_RENDERING' THEN 'START_RENDERING'
    WHEN 'RENDERING' THEN 'WAIT_RENDER'
    WHEN 'RENDER_REWORK' THEN 'RETRY_RENDER'
    WHEN 'APPROVED_REFERENCE' THEN 'PREPARE_BUILD'
    WHEN 'READY_FOR_BUILD' THEN 'START_BUILD'
    WHEN 'BUILDING' THEN 'WAIT_BUILD'
    WHEN 'BUILD_REWORK' THEN 'RETRY_BUILD'
    WHEN 'QA_RUNNING' THEN 'RUN_QA'
    WHEN 'QA_FAILED' THEN 'QA_REWORK'
    WHEN 'ESCALATION_REQUIRED' THEN 'CABINA_REVIEW'
    WHEN 'DEMO_READY' THEN 'CREATE_SALES_HANDOFF'
    WHEN 'SALES_READY' THEN 'WAIT_SALES_ENGINE'
    WHEN 'CONTACTED' THEN 'TRACK_SALES'
    WHEN 'WON' THEN 'CONVERT_CLIENT'
    WHEN 'LOST' THEN 'ARCHIVE'
    WHEN 'HOLD' THEN 'HOLD'
  END
$$;

CREATE OR REPLACE FUNCTION ops_transition_allowed(f pipeline_status,t pipeline_status)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN f=t THEN true
    WHEN t='HOLD' THEN true
    WHEN f='HOLD' AND t IN ('READY_FOR_RENDERING','RENDERING','READY_FOR_BUILD','BUILDING','QA_RUNNING','SALES_READY') THEN true
    WHEN f='READY_FOR_RENDERING' AND t='RENDERING' THEN true
    WHEN f='RENDERING' AND t IN ('RENDER_REWORK','APPROVED_REFERENCE','ESCALATION_REQUIRED') THEN true
    WHEN f='RENDER_REWORK' AND t IN ('RENDERING','ESCALATION_REQUIRED') THEN true
    WHEN f='APPROVED_REFERENCE' AND t='READY_FOR_BUILD' THEN true
    WHEN f='READY_FOR_BUILD' AND t='BUILDING' THEN true
    WHEN f='BUILDING' AND t IN ('BUILD_REWORK','QA_RUNNING','ESCALATION_REQUIRED') THEN true
    WHEN f='BUILD_REWORK' AND t IN ('BUILDING','ESCALATION_REQUIRED') THEN true
    WHEN f='QA_RUNNING' AND t IN ('QA_FAILED','DEMO_READY','ESCALATION_REQUIRED') THEN true
    WHEN f='QA_FAILED' AND t IN ('BUILD_REWORK','QA_RUNNING','ESCALATION_REQUIRED') THEN true
    WHEN f='ESCALATION_REQUIRED' AND t IN ('RENDER_REWORK','BUILD_REWORK','QA_FAILED','HOLD') THEN true
    WHEN f='DEMO_READY' AND t='SALES_READY' THEN true
    WHEN f='SALES_READY' AND t IN ('CONTACTED','HOLD') THEN true
    WHEN f='CONTACTED' AND t IN ('WON','LOST','HOLD') THEN true
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION ops_enqueue_for_status(p_prospect_id uuid,s pipeline_status)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE task text;
BEGIN
  task:=CASE s
    WHEN 'READY_FOR_RENDERING' THEN 'RENDER'
    WHEN 'RENDER_REWORK' THEN 'RENDER'
    WHEN 'APPROVED_REFERENCE' THEN 'PREPARE_BUILD'
    WHEN 'READY_FOR_BUILD' THEN 'BUILD'
    WHEN 'BUILD_REWORK' THEN 'BUILD'
    WHEN 'QA_RUNNING' THEN 'QA'
    WHEN 'QA_FAILED' THEN 'QA_REWORK'
    WHEN 'DEMO_READY' THEN 'SALES_HANDOFF'
    ELSE NULL
  END;

  IF task IS NOT NULL THEN
    INSERT INTO orchestrator_queue(prospect_id,task_type,priority)
    SELECT p_prospect_id,task,
      CASE p.priority WHEN 'A' THEN 10 WHEN 'B' THEN 50 ELSE 100 END
    FROM prospects p WHERE p.id=p_prospect_id
    ON CONFLICT DO NOTHING;
  END IF;
END
$$;

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
      error=CASE WHEN p_to IN ('RENDER_REWORK','BUILD_REWORK','QA_FAILED','ESCALATION_REQUIRED') THEN error ELSE NULL END
  WHERE id=p_prospect_id RETURNING * INTO new_row;

  INSERT INTO site_events(prospect_id,event_type,entity_type,entity_id,actor,from_status,to_status,payload)
  VALUES(p_prospect_id,COALESCE(p_event_type,'STATUS_CHANGED'),'prospect',p_prospect_id::text,
         p_actor,old_row.pipeline_status,p_to,p_payload);

  PERFORM ops_enqueue_for_status(p_prospect_id,p_to);
  RETURN new_row;
END
$$;

CREATE OR REPLACE FUNCTION ops_register_failure(
  p_prospect_id uuid,p_stage text,p_error text,p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS prospects LANGUAGE plpgsql AS $$
DECLARE p prospects%ROWTYPE; next_status pipeline_status; n integer;
BEGIN
  SELECT * INTO p FROM prospects WHERE id=p_prospect_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'prospect % not found',p_prospect_id; END IF;

  n:=p.retry_count+1;
  UPDATE prospects SET retry_count=n,error=p_error,updated_at=now() WHERE id=p_prospect_id;

  IF n>=p.max_retries THEN next_status:='ESCALATION_REQUIRED';
  ELSIF lower(p_stage)='render' THEN next_status:='RENDER_REWORK';
  ELSIF lower(p_stage)='build' THEN next_status:='BUILD_REWORK';
  ELSE next_status:='QA_FAILED';
  END IF;

  RETURN ops_transition_prospect(
    p_prospect_id,next_status,upper(p_stage)||'_FAILED',
    p_payload||jsonb_build_object('error',p_error,'attempt',n),'orchestrator'
  );
END
$$;

CREATE OR REPLACE FUNCTION ops_claim_job(p_worker text,p_task_types text[] DEFAULT NULL)
RETURNS orchestrator_queue LANGUAGE plpgsql AS $$
DECLARE j orchestrator_queue%ROWTYPE;
BEGIN
  SELECT * INTO j FROM orchestrator_queue
  WHERE status='QUEUED' AND available_at<=now()
    AND (p_task_types IS NULL OR task_type=ANY(p_task_types))
  ORDER BY priority ASC,id ASC
  FOR UPDATE SKIP LOCKED LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE orchestrator_queue
  SET status='RUNNING',locked_at=now(),locked_by=p_worker,
      attempt_count=attempt_count+1,updated_at=now()
  WHERE id=j.id RETURNING * INTO j;
  RETURN j;
END
$$;

CREATE OR REPLACE FUNCTION ops_prospect_id_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'ID_PROSPECT is immutable'; END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION ops_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at:=now(); RETURN NEW; END
$$;

CREATE OR REPLACE FUNCTION ops_log_entity_event()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; p_id uuid; e_id text;
BEGIN
  row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME='prospects' THEN p_id:=NULLIF(row_data->>'id','')::uuid;
  ELSE p_id:=NULLIF(row_data->>'prospect_id','')::uuid; END IF;
  e_id:=COALESCE(row_data->>'id','');
  INSERT INTO site_events(prospect_id,event_type,entity_type,entity_id,actor,payload)
  VALUES(p_id,upper(TG_TABLE_NAME||'_'||TG_OP),TG_TABLE_NAME,e_id,'db',
         jsonb_build_object('operation',TG_OP,'row',row_data));
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END
$$;

CREATE OR REPLACE FUNCTION ops_site_events_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'site_events is append-only'; END
$$;

CREATE TRIGGER prospects_id_immutable BEFORE UPDATE ON prospects
FOR EACH ROW EXECUTE FUNCTION ops_prospect_id_immutable();
CREATE TRIGGER prospects_touch BEFORE UPDATE ON prospects
FOR EACH ROW EXECUTE FUNCTION ops_touch_updated_at();
CREATE TRIGGER render_jobs_touch BEFORE UPDATE ON render_jobs
FOR EACH ROW EXECUTE FUNCTION ops_touch_updated_at();
CREATE TRIGGER site_builds_touch BEFORE UPDATE ON site_builds
FOR EACH ROW EXECUTE FUNCTION ops_touch_updated_at();
CREATE TRIGGER orchestrator_queue_touch BEFORE UPDATE ON orchestrator_queue
FOR EACH ROW EXECUTE FUNCTION ops_touch_updated_at();

CREATE TRIGGER prospects_event AFTER INSERT OR UPDATE ON prospects
FOR EACH ROW EXECUTE FUNCTION ops_log_entity_event();
CREATE TRIGGER render_jobs_event AFTER INSERT OR UPDATE OR DELETE ON render_jobs
FOR EACH ROW EXECUTE FUNCTION ops_log_entity_event();
CREATE TRIGGER render_packs_event AFTER INSERT OR UPDATE OR DELETE ON render_packs
FOR EACH ROW EXECUTE FUNCTION ops_log_entity_event();
CREATE TRIGGER site_builds_event AFTER INSERT OR UPDATE OR DELETE ON site_builds
FOR EACH ROW EXECUTE FUNCTION ops_log_entity_event();
CREATE TRIGGER qa_runs_event AFTER INSERT OR UPDATE OR DELETE ON qa_runs
FOR EACH ROW EXECUTE FUNCTION ops_log_entity_event();
CREATE TRIGGER sales_handoffs_event AFTER INSERT OR UPDATE OR DELETE ON sales_handoffs
FOR EACH ROW EXECUTE FUNCTION ops_log_entity_event();
CREATE TRIGGER site_events_no_update BEFORE UPDATE OR DELETE ON site_events
FOR EACH ROW EXECUTE FUNCTION ops_site_events_append_only();

CREATE OR REPLACE VIEW ops_dashboard_counts AS
SELECT
  count(*)::int AS total_prospects,
  count(*) FILTER(WHERE pipeline_status='READY_FOR_RENDERING')::int AS ready_for_rendering,
  count(*) FILTER(WHERE pipeline_status IN('RENDERING','RENDER_REWORK'))::int AS rendering,
  count(*) FILTER(WHERE pipeline_status='APPROVED_REFERENCE')::int AS approved_reference,
  count(*) FILTER(WHERE pipeline_status IN('READY_FOR_BUILD','BUILDING','BUILD_REWORK'))::int AS building,
  count(*) FILTER(WHERE pipeline_status IN('QA_RUNNING','QA_FAILED'))::int AS qa,
  count(*) FILTER(WHERE pipeline_status='DEMO_READY')::int AS demo_ready,
  count(*) FILTER(WHERE pipeline_status='ESCALATION_REQUIRED')::int AS escalation_required
FROM prospects;

CREATE OR REPLACE VIEW ops_prospect_board AS
SELECT p.rank,p.id AS id_prospect,p.business_name AS azienda,p.vertical,
  p.render_status,p.build_status,p.qa_status,p.live_url,p.current_step,
  e.event_type AS last_event,e.created_at AS last_event_at,p.error,p.next_action,
  p.pipeline_status,p.priority
FROM prospects p
LEFT JOIN LATERAL(
  SELECT event_type,created_at FROM site_events se
  WHERE se.prospect_id=p.id ORDER BY se.created_at DESC LIMIT 1
) e ON true;
