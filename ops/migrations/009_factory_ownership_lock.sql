-- Orchestrator V1 ownership lock.
-- Once Site Factory owns an approved reference, Rendering Studio cannot reclaim/revoke it mid-build.

CREATE OR REPLACE FUNCTION public.ops_factory_pipeline_ownership_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.pipeline_status IN ('READY_FOR_BUILD','BUILDING','QA_RUNNING','QA_FAILED','BUILD_REWORK')
     AND NEW.pipeline_status IN ('READY_FOR_RENDERING','RENDERING','RENDER_REWORK') THEN
    RAISE EXCEPTION 'FACTORY_PIPELINE_OWNERSHIP_LOCK: % -> %',OLD.pipeline_status,NEW.pipeline_status;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS prospects_factory_pipeline_ownership_guard ON public.prospects;
CREATE TRIGGER prospects_factory_pipeline_ownership_guard
BEFORE UPDATE OF pipeline_status ON public.prospects
FOR EACH ROW EXECUTE FUNCTION public.ops_factory_pipeline_ownership_guard();

CREATE OR REPLACE FUNCTION public.ops_factory_render_pack_lock()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p_status pipeline_status;
BEGIN
  IF OLD.approved_reference=true
     AND (NEW.approved_reference IS DISTINCT FROM OLD.approved_reference
          OR NEW.status IS DISTINCT FROM OLD.status) THEN
    SELECT pipeline_status INTO p_status FROM prospects WHERE id=OLD.prospect_id;
    IF p_status IN ('READY_FOR_BUILD','BUILDING','QA_RUNNING','QA_FAILED','BUILD_REWORK') THEN
      RAISE EXCEPTION 'RENDER_PACK_LOCKED_BY_SITE_FACTORY: prospect %, pack %, pipeline %',
        OLD.prospect_id,OLD.id,p_status;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS render_packs_factory_lock ON public.render_packs;
CREATE TRIGGER render_packs_factory_lock
BEFORE UPDATE OF approved_reference,status ON public.render_packs
FOR EACH ROW EXECUTE FUNCTION public.ops_factory_render_pack_lock();
