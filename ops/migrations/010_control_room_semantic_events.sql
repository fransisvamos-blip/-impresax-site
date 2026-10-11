-- Control Room semantic last-event selection for Orchestrator V1.

CREATE OR REPLACE VIEW public.ops_prospect_board AS
SELECT p.rank,p.id AS id_prospect,p.business_name AS azienda,p.vertical,
  p.render_status,p.build_status,p.qa_status,p.live_url,p.current_step,
  e.event_type AS last_event,e.created_at AS last_event_at,
  COALESCE(q.error,p.error) AS error,
  p.next_action,p.pipeline_status,p.priority,
  COALESCE(q.attempt_count,qa.attempt,sb.attempt,0) AS attempt
FROM prospects p
LEFT JOIN LATERAL(
  SELECT event_type,created_at FROM site_events se
  WHERE se.prospect_id=p.id
    AND se.event_type NOT LIKE '%_INSERT'
    AND se.event_type NOT LIKE '%_UPDATE'
    AND se.event_type NOT LIKE '%_DELETE'
  ORDER BY se.created_at DESC LIMIT 1
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
