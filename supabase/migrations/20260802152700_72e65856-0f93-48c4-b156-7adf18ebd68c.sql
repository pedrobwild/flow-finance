CREATE TABLE IF NOT EXISTS public.market_rates (
  key text PRIMARY KEY,
  rate numeric NOT NULL,
  source text DEFAULT 'manual',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.market_rates TO authenticated;
GRANT ALL ON public.market_rates TO service_role;

ALTER TABLE public.market_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read market rates"
ON public.market_rates FOR SELECT TO authenticated USING (true);

INSERT INTO public.market_rates (key, rate, source)
VALUES ('cdi_annual', 0.1415, 'seed')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS cdi_last_update date;

-- Dias úteis (seg-sex) entre duas datas
CREATE OR REPLACE FUNCTION public.dias_uteis(p_from date, p_to date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN 0
    ELSE (
      SELECT count(*)::int
      FROM generate_series(p_from + 1, p_to, interval '1 day') AS d
      WHERE EXTRACT(ISODOW FROM d) < 6
    )
  END
$$;

-- Confirmação em lote com atualização atômica de saldo
CREATE OR REPLACE FUNCTION public.confirmar_transacoes(p_ids uuid[], p_paid_at date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_delta numeric := 0;
  v_base numeric := 0;
  v_new numeric := 0;
  v_date date := COALESCE(p_paid_at, CURRENT_DATE);
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN json_build_object('confirmed', 0, 'delta', 0, 'new_balance', NULL);
  END IF;

  WITH upd AS (
    UPDATE public.transactions
    SET status = 'confirmado', paid_at = v_date, updated_at = now()
    WHERE id = ANY(p_ids) AND status IS DISTINCT FROM 'confirmado'
    RETURNING type, amount
  )
  SELECT count(*)::int,
         COALESCE(SUM(CASE WHEN type = 'receber' THEN amount ELSE -amount END), 0)
  INTO v_count, v_delta
  FROM upd;

  IF v_count = 0 THEN
    SELECT amount INTO v_base FROM public.cash_balance ORDER BY balance_date DESC LIMIT 1;
    RETURN json_build_object('confirmed', 0, 'delta', 0, 'new_balance', COALESCE(v_base, 0));
  END IF;

  SELECT COALESCE(amount, 0) INTO v_base
  FROM public.cash_balance
  ORDER BY balance_date DESC
  LIMIT 1;

  v_new := COALESCE(v_base, 0) + v_delta;

  INSERT INTO public.cash_balance (balance_date, amount, bank_account)
  VALUES (v_date, v_new, 'Principal')
  ON CONFLICT (balance_date) DO UPDATE SET amount = EXCLUDED.amount;

  RETURN json_build_object('confirmed', v_count, 'delta', v_delta, 'new_balance', v_new);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_transacoes(uuid[], date) TO authenticated;

-- Correção CDI no banco (dias úteis, base 252)
CREATE OR REPLACE FUNCTION public.aplicar_correcao_cdi()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate numeric;
  v_daily numeric;
  v_count int := 0;
BEGIN
  SELECT rate INTO v_rate FROM public.market_rates WHERE key = 'cdi_annual';
  IF v_rate IS NULL THEN
    RETURN json_build_object('updated', 0, 'error', 'taxa CDI indisponível');
  END IF;

  v_daily := power(1 + v_rate, 1.0 / 252) - 1;

  WITH upd AS (
    UPDATE public.transactions t
    SET amount = round((t.base_amount * power(1 + v_daily * (t.cdi_percentage / 100.0), public.dias_uteis(t.base_date, CURRENT_DATE)))::numeric, 2),
        cdi_last_update = CURRENT_DATE,
        updated_at = now()
    WHERE t.cdi_adjustable = true
      AND t.status IS DISTINCT FROM 'confirmado'
      AND t.base_amount IS NOT NULL
      AND t.base_date IS NOT NULL
      AND t.cdi_percentage IS NOT NULL
    RETURNING t.id
  )
  SELECT count(*)::int INTO v_count FROM upd;

  RETURN json_build_object('updated', v_count, 'rate', v_rate, 'date', CURRENT_DATE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_correcao_cdi() TO service_role;

SELECT cron.unschedule('cdi-daily-adjust')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cdi-daily-adjust');

SELECT cron.schedule('cdi-daily-adjust', '10 9 * * *', $$SELECT public.aplicar_correcao_cdi();$$);