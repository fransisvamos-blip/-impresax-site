-- ImpresaX Rendering Studio V1 Frozen compliance guard.
-- Prevents any render pack from reaching selection/approval states without canonical hard gates.

CREATE OR REPLACE FUNCTION public.ops_render_frozen_compliance_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  p_source jsonb;
  p_city text;
  logo_status text;
  dna_key text;
  dna_value jsonb;
  qa_count integer;
  selected_count integer;
  provenance_count integer;
BEGIN
  IF NOT (
    NEW.status IN ('RENDER_READY','AWAITING_IMPLEMENTATION','APPROVED')
    OR NEW.approved_reference = true
  ) THEN
    RETURN NEW;
  END IF;

  SELECT source_data, city
    INTO p_source, p_city
    FROM prospects
   WHERE id=NEW.prospect_id;

  IF p_source IS NULL THEN
    RAISE EXCEPTION 'FROZEN_COMPLIANCE: PROSPECT_SOURCE_REQUIRED';
  END IF;

  logo_status := upper(coalesce(NEW.official_logo->>'status',''));

  IF NOT (
    (
      logo_status IN ('PASS','OFFICIAL_LOGO_LOCKED')
      AND coalesce(nullif(NEW.official_logo->>'url',''),nullif(NEW.official_logo->>'official_source','')) IS NOT NULL
    )
    OR
    (
      logo_status='NO_OFFICIAL_LOGO_CONFIRMED'
      AND coalesce(NEW.official_logo->>'generated','false')='false'
      AND coalesce(NEW.official_logo->>'use_verified_name_as_text','false')='true'
    )
  ) THEN
    RAISE EXCEPTION 'FROZEN_COMPLIANCE: OFFICIAL_IDENTITY_GATE_FAILED';
  END IF;

  FOREACH dna_key IN ARRAY ARRAY[
    'brand_personality','visual_cues','tone','business_type','audience','offer',
    'local_context','trust_signals','existing_colors','typography_cues','imagery_cues',
    'business_positioning','commercial_behavior'
  ]
  LOOP
    dna_value := NEW.brand_dna->dna_key;
    IF dna_value IS NULL
       OR dna_value='null'::jsonb
       OR dna_value='""'::jsonb
       OR dna_value='[]'::jsonb
       OR dna_value='{}'::jsonb THEN
      RAISE EXCEPTION 'FROZEN_COMPLIANCE: BRAND_DNA_GATE_FAILED %', dna_key;
    END IF;
  END LOOP;

  IF nullif(trim(coalesce(p_source->>'verified_services','')),'') IS NULL THEN
    RAISE EXCEPTION 'FROZEN_COMPLIANCE: VERIFIED_SERVICES_REQUIRED';
  END IF;
  IF nullif(trim(coalesce(p_source->>'verified_contacts','')),'') IS NULL THEN
    RAISE EXCEPTION 'FROZEN_COMPLIANCE: VERIFIED_CONTACTS_REQUIRED';
  END IF;
  IF nullif(trim(coalesce(p_source->>'address',p_city,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FROZEN_COMPLIANCE: VERIFIED_LOCATION_REQUIRED';
  END IF;
  IF jsonb_typeof(coalesce(p_source->'source_references','[]'::jsonb))<>'array'
     OR jsonb_array_length(coalesce(p_source->'source_references','[]'::jsonb))=0 THEN
    RAISE EXCEPTION 'FROZEN_COMPLIANCE: SOURCE_REFERENCES_REQUIRED';
  END IF;

  SELECT count(*)
    INTO qa_count
    FROM render_variants rv
    JOIN render_staging_payloads s
      ON s.render_pack_id=rv.render_pack_id
     AND s.variant_key=rv.variant_key
   WHERE rv.render_pack_id=NEW.id
     AND rv.variant_key IN ('A','B','C')
     AND rv.desktop_render_url IS NOT NULL
     AND rv.mobile_render_url IS NOT NULL
     AND s.status='RENDERED'
     AND s.desktop_image_base64 IS NOT NULL
     AND s.mobile_image_base64 IS NOT NULL
     AND s.rendered_at IS NOT NULL
     AND coalesce(s.design_notes->>'source','')='RENDERING_STUDIO_V1_FROZEN'
     AND coalesce(s.design_notes->'visual_qa'->>'pass','false')='true'
     AND coalesce(s.design_notes->'visual_qa'->>'model','')='@cf/qwen/qwen3.8-27b';

  IF qa_count<>3 THEN
    RAISE EXCEPTION 'FROZEN_COMPLIANCE: THREE_VISUAL_QA_PASSES_REQUIRED got %', qa_count;
  END IF;

  SELECT count(*)
    INTO provenance_count
    FROM render_variants rv
   WHERE rv.render_pack_id=NEW.id
     AND rv.variant_key IN ('A','B','C')
     AND rv.content_map ? 'implementation_html'
     AND rv.content_map ? 'provenance'
     AND jsonb_typeof(rv.content_map->'provenance'->'verified_sources')='array'
     AND jsonb_typeof(rv.content_map->'provenance'->'image_urls')='array';

  IF provenance_count<>3 THEN
    RAISE EXCEPTION 'FROZEN_COMPLIANCE: VARIANT_PROVENANCE_REQUIRED got %', provenance_count;
  END IF;

  SELECT count(*)
    INTO selected_count
    FROM render_variants
   WHERE render_pack_id=NEW.id
     AND selected=true;

  IF NEW.status='RENDER_READY' AND selected_count<>0 THEN
    RAISE EXCEPTION 'FROZEN_COMPLIANCE: RENDER_READY_MUST_BE_UNSELECTED';
  END IF;

  IF NEW.status IN ('AWAITING_IMPLEMENTATION','APPROVED') OR NEW.approved_reference=true THEN
    IF selected_count<>1 THEN
      RAISE EXCEPTION 'FROZEN_COMPLIANCE: EXACTLY_ONE_SELECTED_VARIANT_REQUIRED got %', selected_count;
    END IF;
    IF nullif(trim(coalesce(NEW.content_map->>'implementation_html','')),'') IS NULL THEN
      RAISE EXCEPTION 'FROZEN_COMPLIANCE: SELECTED_IMPLEMENTATION_HTML_REQUIRED';
    END IF;
    IF nullif(trim(coalesce(NEW.content_map->>'selected_variant','')),'') IS NULL
       OR nullif(trim(coalesce(NEW.content_map->>'selected_variant_id','')),'') IS NULL THEN
      RAISE EXCEPTION 'FROZEN_COMPLIANCE: EXPLICIT_SELECTION_METADATA_REQUIRED';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS render_packs_frozen_compliance_guard ON public.render_packs;

CREATE TRIGGER render_packs_frozen_compliance_guard
BEFORE UPDATE OF status,approved_reference ON public.render_packs
FOR EACH ROW
EXECUTE FUNCTION public.ops_render_frozen_compliance_guard();
