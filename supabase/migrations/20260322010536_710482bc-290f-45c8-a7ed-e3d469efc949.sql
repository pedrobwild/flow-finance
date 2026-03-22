
CREATE TABLE public.negotiations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  counterpart text NOT NULL DEFAULT '',
  original_amount numeric NOT NULL DEFAULT 0,
  proposed_amount numeric,
  original_due_date date,
  proposed_due_date date,
  strategy text NOT NULL DEFAULT '',
  contact_method text NOT NULL DEFAULT 'telefone',
  result text NOT NULL DEFAULT 'pendente',
  notes text DEFAULT '',
  contacted_at timestamp with time zone,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.negotiations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to negotiations" ON public.negotiations
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_negotiations_updated_at
  BEFORE UPDATE ON public.negotiations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.negotiations;
