-- Orchestrator V1 event semantics + Control Room current attempt/error.

CREATE OR REPLACE FUNCTION public.ops_register_factory_failure(
  p_prospect_id uuid,p_stage text,p_error text,p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS prospects LANGUAGE plpgsql AS $$
DECLARE p prospects%ROWTYPE; next_status pipeline_status; n integer; out_row prospects%ROWTYPE;
BEGIN
  SELECT * INTO p FROM prospects WHERE id=p_prospect_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'prospect % not found',p_prospect_id; END IF;

  n:=p.build_qa_cycle_count+1;
  UPDATE prospects SET build_qa_cycle_count=n,error=p_error,updated_at=now()
  WHERE id=p_prospect_id;

  IF n>=5 THEN next_status:='ESCALATION_REQUIRED';
  ELSIF lower(p_stage)='build' THEN next_status:='BUILD_REWORK';
  ELSE next_status:='QA_FAILED';
  END IF;

  out_row:=ops_transition_prospect(
    p_prospect_id,next_status,upper(p_stage)||'_FAILED',
    p_payload||jsonb_build_object('error',p_error,'factory_cycle',n,'max_cycles',5),
    'site-factory'
  );

  IF next_status='BUILD_REWORK' THEN
    INSERT INTO site_events(prospect_id,event_type,entity_type,entity_id,actor,payload)
    VALUES(p_prospect_id,'BUILD_REWORK','prospect',p_prospect_id::text,'orchestrator-v1',
      jsonb_build_object('error',p_error,'factory_cycle',n,'max_cycles',5));
  ELSIF next_status='ESCALATION_REQUIRED' THEN
    INSERT INTO site_events(prospect_id,event_type,entity_type,entity_id,actor,payload)
    VALUES(p_prospect_id,'ESCALATION_REQUIRED','prospect',p_prospect_id::text,'orchestrator-v1',
      jsonb_build_object('error',p_error,'factory_cycle',n,'max_cycles',5));
  END IF;

  RETURN out_row;
END
$$;

CREATE OR REPLACE VIEW public.ops_prospect_board AS
SELECT p.rank,p.id AS id_prospect,p.business_name AS azienda,p.vertical,
  p.render_status,p.build_status,p.qa_status,p.live_url,p.current_step,
  e.event_type AS last_event,e.created_at AS last_event_at,
  COALESCE(q.error,p.error) AS error,
  COALESCE(q.attempt_count,qa.attempt,sb.attempt,0) AS attempt,
  p.next_action,p.pipeline_status,p.priority
FROM prospects p
LEFT JOIN LATERAL(
  SELECT event_type,created_at FROM site_events se
  WHERE se.prospect_id=p.id ORDER BY se.created_at DESC LIMIT 1
) e ON true
LEFT JOIN LATERAL(
  SELECT attempt_count,error FROM orchestrator_queue oq
  WHERE oq.prospect_id=p.id AND oq.task_type IN ('PREPARE_BUILD','BUILD','QA','QA_REWORK')
  ORDER BY CASE oq.status WHEN 'RUNNING' THEN 0 WHEN 'QUEUED' THEN 1 ELSE 2 END,oq.id DESC
  LIMIT 1
) q ON true
LEFT JOIN LATERAL(
  SELECT attempt FROM qa_runs qr WHERE qr.prospect_id=p.id ORDER BY created_at DESC LIMIT 1
) qa ON true
LEFT JOIN LATERAL(
  SELECT attempt FROM site_builds sb2 WHERE sb2.prospect_id=p.id ORDER BY created_at DESC LIMIT 1
) sb ON true;
