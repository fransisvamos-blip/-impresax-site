-- Pilot #001 import into ImpresaX Ops.
-- Immutable Ops ID: 5a03a8d1-e080-4f53-bf38-214c24f67248
-- Intentionally HOLD because outreach remains forbidden.
INSERT INTO prospects (
  id,rank,business_name,vertical,city,website_url,slug,priority,
  pipeline_status,current_step,live_url,primary_problem,next_action,
  hold_reason,legacy_ids,source_data
) VALUES (
  '5a03a8d1-e080-4f53-bf38-214c24f67248'::uuid,
  1,'Studio Dentistico Dott. Francesco Giardinelli','DENTAL_MEDICAL','Catanzaro',
  'https://studiodentisticogiardinelli.com/','studiodentisticogiardinelli','A',
  'HOLD','HOLD','https://studiodentisticogiardinelli.impresax.org/',
  'Pilot #001 live reference-locked; outreach remains forbidden until project owner decides separately.',
  'HOLD','OUTREACH_FORBIDDEN','{"pilot_id":"pilot_001"}'::jsonb,
  '{"address":"Via Melchiorre Jannelli, 47, 88100 Catanzaro CZ","ops_import":"pilot_001"}'::jsonb
) ON CONFLICT (id) DO NOTHING;
