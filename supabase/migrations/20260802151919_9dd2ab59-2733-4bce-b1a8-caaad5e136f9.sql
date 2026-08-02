CREATE TABLE IF NOT EXISTS public.integration_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL,
  target_system text NOT NULL DEFAULT 'flow_finance',
  entity_type text NOT NULL,
  source_id uuid NOT NULL,
  target_id uuid,
  sync_status text NOT NULL DEFAULT 'pending',
  payload jsonb,
  error_message text,
  attempts int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  synced_at timestamptz,
  UNIQUE (source_system, entity_type, source_id)
);

GRANT SELECT ON public.integration_sync_log TO authenticated;
GRANT ALL ON public.integration_sync_log TO service_role;

ALTER TABLE public.integration_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view integration sync log"
ON public.integration_sync_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.obras ADD COLUMN IF NOT EXISTS client_phone text DEFAULT ''::text;