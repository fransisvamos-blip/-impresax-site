-- ImpresaX Orchestrator V1
-- Reconcile APPROVED_REFERENCE, render-pack-aware idempotency, atomic claims and stale recovery.

ALTER TABLE public.orchestrator_queue
  ADD COLUMN IF NOT EXISTS render_pack_id uuid REFERENCES public.render_packs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS render_pack_version integer,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

DROP INDEX IF EXISTS public.orchestrator_one_active_task;

CREATE UNIQUE INDEX IF NOT EXISTS orchestrator_one_active_task_per_pack
ON public.orchestrator_queue (
  prospect_id,
  task_type,
  COALESCE(render_pack_id,'00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(render_pack_version,0)
)
WHERE status IN ('QUEUED','RUNNING');

CREATE INDEX IF NOT EXISTS orchestrator_running_heartbeat_idx
ON public.orchestrator_queue(status,heartbeat_at)
WHERE status='RUNNING';

CREATE OR REPLACE FUNCTION public.ops_current_approved_pack(p_prospect_id uuid)
RETURNS TABLE(render_pack_id uuid, render_pack_version integer)
LANGUAGE sql STABLE AS $$
  SELECT rp.id,rp.version
  FROM render_packs rp
  WHERE rp.prospect_id=p_prospect_id
    AND rp.status='APPROVED'
    AND rp.approved_reference=true
  ORDER BY rp.version DESC,rp.approved_at DESC NULLS LAST,rp.created_at DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.ops_enqueue_for_status(p_prospect_id uuid,s pipeline_status)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  task text;
  pack_id uuid;
  pack_version integer;
  inserted_id bigint;
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

  IF task IS NULL THEN RETURN; END IF;

  IF task IN ('PREPARE_BUILD','BUILD','QA','QA_REWORK','SALES_HANDOFF') THEN
    SELECT x.render_pack_id,x.render_pack_version
    INTO pack_id,pack_version
    FROM ops_current_approved_pack(p_prospect_id) x;
  END IF;

  INSERT INTO orchestrator_queue(
    prospect_id,task_type,priority,max_attempts,render_pack_id,render_pack_version,payload
  )
  SELECT p_prospect_id,task,
         CASE p.priority WHEN 'A' THEN 10 WHEN 'B' THEN 50 ELSE 100 END,
         CASE WHEN task IN ('PREPARE_BUILD','BUILD','QA','QA_REWORK') THEN 5 ELSE 3 END,
         pack_id,pack_version,
         jsonb_strip_nulls(jsonb_build_object(
           'render_pack_id',pack_id,
           'render_pack_version',pack_version,
           'orchestrator_version','V1'
         ))
  FROM prospects p
  WHERE p.id=p_prospect_id
  ON CONFLICT DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NOT NULL AND task='BUILD' THEN
    INSERT INTO site_events(prospect_id,event_type,entity_type,entity_id,actor,payload)
    VALUES(
      p_prospect_id,'BUILD_JOB_CREATED','orchestrator_queue',inserted_id::text,'orchestrator-v1',
      jsonb_build_object('queue_id',inserted_id,'render_pack_id',pack_id,'render_pack_version',pack_version)
    );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.ops_reconcile_orchestrator()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  r record;
  n integer:=0;
BEGIN
  FOR r IN
    SELECT p.id,p.pipeline_status
    FROM prospects p
    WHERE p.pipeline_status IN (
      'APPROVED_REFERENCE','READY_FOR_BUILD','BUILD_REWORK','QA_RUNNING','QA_FAILED','DEMO_READY'
    )
  LOOP
    PERFORM ops_enqueue_for_status(r.id,r.pipeline_status);
    n:=n+1;
  END LOOP;
  RETURN n;
END
$$;

CREATE OR REPLACE FUNCTION public.ops_claim_job(p_worker text,p_task_types text[] DEFAULT NULL)
RETURNS orchestrator_queue LANGUAGE plpgsql AS $$
DECLARE j orchestrator_queue%ROWTYPE;
BEGIN
  SELECT * INTO j
  FROM orchestrator_queue
  WHERE status='QUEUED'
    AND available_at<=now()
    AND (p_task_types IS NULL OR task_type=ANY(p_task_types))
  ORDER BY priority ASC,id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE orchestrator_queue
  SET status='RUNNING',
      locked_at=now(),
      heartbeat_at=now(),
      locked_by=p_worker,
      attempt_count=attempt_count+1,
      error=null,
      updated_at=now()
  WHERE id=j.id
  RETURNING * INTO j;

  IF j.task_type='BUILD' THEN
    INSERT INTO site_events(prospect_id,event_type,entity_type,entity_id,actor,payload)
    VALUES(j.prospect_id,'BUILD_CLAIMED','orchestrator_queue',j.id::text,p_worker,
      jsonb_build_object('queue_id',j.id,'attempt',j.attempt_count,'render_pack_id',j.render_pack_id,'render_pack_version',j.render_pack_version));
  ELSIF j.task_type='QA' THEN
    INSERT INTO site_events(prospect_id,event_type,entity_type,entity_id,actor,payload)
    VALUES(j.prospect_id,'QA_STARTED','orchestrator_queue',j.id::text,p_worker,
      jsonb_build_object('queue_id',j.id,'attempt',j.attempt_count,'render_pack_id',j.render_pack_id,'render_pack_version',j.render_pack_version));
  END IF;

  RETURN j;
END
$$;

CREATE OR REPLACE FUNCTION public.ops_touch_job_heartbeat(p_job_id bigint,p_worker text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE touched boolean;
BEGIN
  UPDATE orchestrator_queue
  SET heartbeat_at=now(),updated_at=now()
  WHERE id=p_job_id AND status='RUNNING' AND locked_by=p_worker;
  GET DIAGNOSTICS touched=ROW_COUNT;
  RETURN touched;
END
$$;

CREATE OR REPLACE FUNCTION public.ops_recover_stale_jobs(p_stale_after interval DEFAULT interval '15 minutes')
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  j orchestrator_queue%ROWTYPE;
  recovered integer:=0;
  target pipeline_status;
BEGIN
  FOR j IN
    SELECT *
    FROM orchestrator_queue
    WHERE status='RUNNING'
      AND COALESCE(heartbeat_at,locked_at,updated_at) < now()-p_stale_after
    ORDER BY id
    FOR UPDATE SKIP LOCKED
  LOOP
    IF j.attempt_count < j.max_attempts THEN
      UPDATE orchestrator_queue
      SET status='QUEUED',locked_at=null,heartbeat_at=null,locked_by=null,
          available_at=now()+interval '1 minute',error='STALE_JOB_RECOVERED',updated_at=now()
      WHERE id=j.id;

      INSERT INTO site_events(prospect_id,event_type,entity_type,entity_id,actor,payload)
      VALUES(j.prospect_id,'JOB_STALE_RECOVERED','orchestrator_queue',j.id::text,'orchestrator-v1',
        jsonb_build_object('queue_id',j.id,'task_type',j.task_type,'attempt',j.attempt_count));
    ELSE
      UPDATE orchestrator_queue
      SET status='FAILED',heartbeat_at=null,error='STALE_JOB_MAX_ATTEMPTS',updated_at=now()
      WHERE id=j.id;

      SELECT pipeline_status INTO target FROM prospects WHERE id=j.prospect_id;
      IF target IN ('BUILDING','BUILD_REWORK','QA_RUNNING','QA_FAILED') THEN
        PERFORM ops_transition_prospect(
          j.prospect_id,'ESCALATION_REQUIRED','ESCALATION_REQUIRED',
          jsonb_build_object('reason','STALE_JOB_MAX_ATTEMPTS','queue_id',j.id,'task_type',j.task_type,'attempt',j.attempt_count),
          'orchestrator-v1'
        );
      ELSE
        INSERT INTO site_events(prospect_id,event_type,entity_type,entity_id,actor,payload)
        VALUES(j.prospect_id,'ESCALATION_REQUIRED','orchestrator_queue',j.id::text,'orchestrator-v1',
          jsonb_build_object('reason','STALE_JOB_MAX_ATTEMPTS','queue_id',j.id,'task_type',j.task_type,'attempt',j.attempt_count));
      END IF;
    END IF;
    recovered:=recovered+1;
  END LOOP;
  RETURN recovered;
END
$$;
