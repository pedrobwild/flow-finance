CREATE OR REPLACE FUNCTION public.desfazer_confirmacao(p_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_type text; v_amount numeric; v_base numeric; v_new numeric; v_delta numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'não autenticado'; END IF;
  UPDATE public.transactions
  SET status = 'pendente', paid_at = NULL, updated_at = now()
  WHERE id = p_id AND status = 'confirmado'
  RETURNING type, amount INTO v_type, v_amount;
  IF NOT FOUND THEN
    RETURN json_build_object('reverted', 0);
  END IF;
  v_delta := CASE WHEN v_type = 'receber' THEN -v_amount ELSE v_amount END;
  SELECT COALESCE(amount,0) INTO v_base FROM public.cash_balance ORDER BY balance_date DESC LIMIT 1;
  v_new := COALESCE(v_base,0) + v_delta;
  INSERT INTO public.cash_balance (balance_date, amount, bank_account)
  VALUES (CURRENT_DATE, v_new, 'Principal')
  ON CONFLICT (balance_date) DO UPDATE SET amount = EXCLUDED.amount;
  RETURN json_build_object('reverted', 1, 'delta', v_delta, 'new_balance', v_new);
END; $$;
REVOKE ALL ON FUNCTION public.desfazer_confirmacao(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.desfazer_confirmacao(uuid) TO authenticated;