
ALTER TABLE public.transactions
  ADD COLUMN cdi_adjustable boolean NOT NULL DEFAULT false,
  ADD COLUMN cdi_percentage numeric DEFAULT NULL,
  ADD COLUMN base_amount numeric DEFAULT NULL,
  ADD COLUMN base_date date DEFAULT NULL;
