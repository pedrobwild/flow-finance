
-- Create obra_stages table
CREATE TABLE public.obra_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id UUID NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  supplier TEXT NOT NULL DEFAULT '',
  estimated_value NUMERIC NOT NULL DEFAULT 0,
  estimated_start_date DATE,
  estimated_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  status TEXT NOT NULL DEFAULT 'planejada',
  notes TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.obra_stages ENABLE ROW LEVEL SECURITY;

-- RLS policy: allow full access (matches existing pattern)
CREATE POLICY "Allow full access to obra_stages"
  ON public.obra_stages
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER update_obra_stages_updated_at
  BEFORE UPDATE ON public.obra_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.obra_stages;
