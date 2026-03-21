import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { ObraStage, StageStatus } from '@/lib/types';

function rowToStage(row: any): ObraStage {
  return {
    id: row.id,
    obraId: row.obra_id,
    name: row.name,
    supplier: row.supplier || '',
    estimatedValue: Number(row.estimated_value) || 0,
    estimatedStartDate: row.estimated_start_date || null,
    estimatedEndDate: row.estimated_end_date || null,
    actualStartDate: row.actual_start_date || null,
    actualEndDate: row.actual_end_date || null,
    status: row.status as StageStatus,
    notes: row.notes || '',
    sortOrder: row.sort_order || 0,
    createdAt: row.created_at,
  };
}

export function useObraStages(obraId: string | null) {
  const qc = useQueryClient();
  const queryKey = ['obra-stages', obraId];

  const { data: stages = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!obraId) return [];
      const { data, error } = await (supabase as any)
        .from('obra_stages')
        .select('*')
        .eq('obra_id', obraId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []).map(rowToStage);
    },
    enabled: !!obraId,
  });

  const addMutation = useMutation({
    mutationFn: async (stage: Omit<ObraStage, 'id' | 'createdAt'>) => {
      const { error } = await (supabase as any).from('obra_stages').insert({
        obra_id: stage.obraId,
        name: stage.name,
        supplier: stage.supplier,
        estimated_value: stage.estimatedValue,
        estimated_start_date: stage.estimatedStartDate || null,
        estimated_end_date: stage.estimatedEndDate || null,
        actual_start_date: stage.actualStartDate || null,
        actual_end_date: stage.actualEndDate || null,
        status: stage.status,
        notes: stage.notes,
        sort_order: stage.sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['all-obra-stages'] });
      toast.success('Etapa adicionada');
    },
    onError: () => toast.error('Erro ao adicionar etapa'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Omit<ObraStage, 'id' | 'createdAt'>> }) => {
      const update: any = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.supplier !== undefined) update.supplier = data.supplier;
      if (data.estimatedValue !== undefined) update.estimated_value = data.estimatedValue;
      if (data.estimatedStartDate !== undefined) update.estimated_start_date = data.estimatedStartDate || null;
      if (data.estimatedEndDate !== undefined) update.estimated_end_date = data.estimatedEndDate || null;
      if (data.actualStartDate !== undefined) update.actual_start_date = data.actualStartDate || null;
      if (data.actualEndDate !== undefined) update.actual_end_date = data.actualEndDate || null;
      if (data.status !== undefined) update.status = data.status;
      if (data.notes !== undefined) update.notes = data.notes;
      if (data.sortOrder !== undefined) update.sort_order = data.sortOrder;
      const { error } = await (supabase as any).from('obra_stages').update(update).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['all-obra-stages'] });
      toast.success('Etapa atualizada');
    },
    onError: () => toast.error('Erro ao atualizar etapa'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('obra_stages').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['all-obra-stages'] });
      toast.success('Etapa removida');
    },
    onError: () => toast.error('Erro ao remover etapa'),
  });

  return {
    stages,
    isLoading,
    addStage: (stage: Omit<ObraStage, 'id' | 'createdAt'>) => addMutation.mutate(stage),
    updateStage: (id: string, data: Partial<Omit<ObraStage, 'id' | 'createdAt'>>) => updateMutation.mutate({ id, data }),
    deleteStage: (id: string) => deleteMutation.mutate(id),
  };
}

// Hook to fetch ALL stages across all obras (for dashboard)
export function useAllObraStages() {
  const { data: stages = [], isLoading } = useQuery({
    queryKey: ['all-obra-stages'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('obra_stages')
        .select('*')
        .order('estimated_start_date', { ascending: true });
      if (error) throw error;
      return (data || []).map(rowToStage);
    },
  });

  return { stages, isLoading };
}
