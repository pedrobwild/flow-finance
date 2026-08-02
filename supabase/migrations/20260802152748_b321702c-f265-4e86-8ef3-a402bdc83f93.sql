REVOKE ALL ON FUNCTION public.confirmar_transacoes(uuid[], date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aplicar_correcao_cdi() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_transacoes(uuid[], date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_correcao_cdi() TO service_role;
REVOKE ALL ON FUNCTION public.dias_uteis(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dias_uteis(date, date) TO authenticated, service_role;