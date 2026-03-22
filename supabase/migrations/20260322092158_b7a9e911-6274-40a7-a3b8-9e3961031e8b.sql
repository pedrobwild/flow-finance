
-- Drop permissive public policies
DROP POLICY IF EXISTS "Allow full access to transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow full access to cash_balance" ON public.cash_balance;
DROP POLICY IF EXISTS "Allow full access to obras" ON public.obras;
DROP POLICY IF EXISTS "Allow full access to obra_stages" ON public.obra_stages;

-- Recreate with authenticated-only access
CREATE POLICY "Authenticated full access to transactions"
  ON public.transactions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access to cash_balance"
  ON public.cash_balance FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access to obras"
  ON public.obras FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated full access to obra_stages"
  ON public.obra_stages FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
