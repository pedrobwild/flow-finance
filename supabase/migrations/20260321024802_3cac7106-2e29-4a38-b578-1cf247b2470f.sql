
UPDATE public.obras SET status = 'ativa' WHERE status IN ('proposta', 'contratada', 'em_execucao', 'pausada');
UPDATE public.obras SET status = 'finalizada' WHERE status IN ('concluida', 'cancelada');
ALTER TABLE public.obras DROP CONSTRAINT IF EXISTS obras_status_check;
ALTER TABLE public.obras ADD CONSTRAINT obras_status_check CHECK (status IN ('ativa', 'finalizada'));
ALTER TABLE public.obras ALTER COLUMN status SET DEFAULT 'ativa';
