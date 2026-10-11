-- Complete event coverage and preserve immutable prospect records.

CREATE OR REPLACE FUNCTION ops_log_entity_event()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; p_id uuid; e_id text;
BEGIN
  row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF TG_TABLE_NAME='prospects' THEN
    p_id:=NULLIF(row_data->>'id','')::uuid;
  ELSIF TG_TABLE_NAME='render_assets' THEN
    SELECT rp.prospect_id INTO p_id FROM render_packs rp
    WHERE rp.id=NULLIF(row_data->>'render_pack_id','')::uuid;
  ELSE
    p_id:=NULLIF(row_data->>'prospect_id','')::uuid;
  END IF;
  e_id:=COALESCE(row_data->>'id','');
  INSERT INTO site_events(prospect_id,event_type,entity_type,entity_id,actor,payload)
  VALUES(p_id,upper(TG_TABLE_NAME||'_'||TG_OP),TG_TABLE_NAME,e_id,'db',
         jsonb_build_object('operation',TG_OP,'row',row_data));
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END
$$;

CREATE TRIGGER render_assets_event AFTER INSERT OR UPDATE OR DELETE ON render_assets
FOR EACH ROW EXECUTE FUNCTION ops_log_entity_event();

CREATE TRIGGER orchestrator_queue_event AFTER INSERT OR UPDATE OR DELETE ON orchestrator_queue
FOR EACH ROW EXECUTE FUNCTION ops_log_entity_event();

CREATE OR REPLACE FUNCTION ops_prospect_no_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'prospects are archival records and cannot be deleted'; END
$$;

CREATE TRIGGER prospects_no_delete BEFORE DELETE ON prospects
FOR EACH ROW EXECUTE FUNCTION ops_prospect_no_delete();
