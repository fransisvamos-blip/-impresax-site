-- IMPRESAX OPS
-- Migration 004: enqueue the initial orchestration task when a prospect is inserted.
-- Existing prospects are intentionally NOT backfilled here: executor integration remains a separate gate.

CREATE OR REPLACE FUNCTION public.ops_enqueue_initial_prospect()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.ops_enqueue_for_status(NEW.id, NEW.pipeline_status);
  RETURN NEW;
END
$function$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'prospects'
      AND t.tgname = 'prospects_initial_enqueue'
      AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER prospects_initial_enqueue
    AFTER INSERT ON public.prospects
    FOR EACH ROW
    EXECUTE FUNCTION public.ops_enqueue_initial_prospect();
  END IF;
END
$do$;
