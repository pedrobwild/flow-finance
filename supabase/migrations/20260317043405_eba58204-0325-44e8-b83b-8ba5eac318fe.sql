
-- Drop old table
DROP TABLE IF EXISTS public.bills;

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('pagar', 'receber')),
  description TEXT NOT NULL,
  counterpart TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  paid_at DATE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('previsto', 'pendente', 'confirmado', 'atrasado')),
  cost_center TEXT NOT NULL DEFAULT 'Operação' CHECK (cost_center IN ('Operação', 'Marketing', 'Vendas', 'Produto', 'RH', 'Jurídico', 'Administrativo', 'Diretoria')),
  category TEXT NOT NULL DEFAULT 'Outros',
  recurrence TEXT NOT NULL DEFAULT 'única' CHECK (recurrence IN ('única', 'mensal', 'semanal', 'trimestral', 'anual')),
  payment_method TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('crítica', 'alta', 'normal', 'baixa')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create cash_balance table
CREATE TABLE public.cash_balance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  balance_date DATE NOT NULL UNIQUE,
  amount NUMERIC(12,2) NOT NULL,
  bank_account TEXT DEFAULT 'Principal',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_balance ENABLE ROW LEVEL SECURITY;

-- Temporary permissive policies (single-user, no auth yet)
CREATE POLICY "Allow full access to transactions" ON public.transactions FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to cash_balance" ON public.cash_balance FOR ALL TO public USING (true) WITH CHECK (true);

-- Trigger for updated_at on transactions
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
