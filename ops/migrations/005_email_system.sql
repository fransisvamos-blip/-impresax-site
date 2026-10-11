-- IMPRESAX OPS
-- Migration 005: outbound email delivery audit log.

CREATE TABLE IF NOT EXISTS public.email_logs (
  id bigserial PRIMARY KEY,
  email_type text NOT NULL,
  recipient text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','SENT','DELIVERED','DELIVERY_FAILED','FAILED')),
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_logs_created_at_idx
  ON public.email_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS email_logs_type_created_at_idx
  ON public.email_logs (email_type, created_at DESC);

CREATE INDEX IF NOT EXISTS email_logs_provider_message_id_idx
  ON public.email_logs (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
