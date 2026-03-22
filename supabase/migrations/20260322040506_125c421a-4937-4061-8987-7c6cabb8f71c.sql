
CREATE OR REPLACE FUNCTION public.log_cash_balance_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, new_data)
    VALUES ('cash_balance', NEW.id, 'INSERT', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data)
    VALUES ('cash_balance', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER cash_balance_audit_trigger
  AFTER INSERT OR UPDATE ON public.cash_balance
  FOR EACH ROW EXECUTE FUNCTION public.log_cash_balance_changes();

-- Also ensure existing transaction triggers are active
CREATE TRIGGER transactions_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.log_transaction_changes();
