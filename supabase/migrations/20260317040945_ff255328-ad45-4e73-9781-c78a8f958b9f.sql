-- Create bills table
CREATE TABLE public.bills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  description TEXT NOT NULL,
  supplier TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  paid_at DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('planejado', 'pendente', 'pago', 'atrasado')),
  cost_center TEXT NOT NULL DEFAULT 'Operação' CHECK (cost_center IN ('Operação', 'Marketing', 'Vendas', 'Produto', 'RH', 'Jurídico', 'Administrativo', 'Diretoria')),
  category TEXT NOT NULL DEFAULT 'Outros',
  recurrence TEXT NOT NULL DEFAULT 'única' CHECK (recurrence IN ('única', 'mensal', 'semanal', 'trimestral', 'anual')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

-- For now allow all access (no auth yet)
CREATE POLICY "Allow full access to bills" ON public.bills
  FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_bills_updated_at
  BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();