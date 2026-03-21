
CREATE TABLE public.obras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  client_name text NOT NULL,
  condominium text NOT NULL DEFAULT '',
  unit_number text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'ativa',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to obras" ON public.obras FOR ALL TO public USING (true) WITH CHECK (true);

ALTER TABLE public.transactions ADD COLUMN obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL;

CREATE TRIGGER update_obras_updated_at BEFORE UPDATE ON public.obras FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
