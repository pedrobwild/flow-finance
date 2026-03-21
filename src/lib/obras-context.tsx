import React, { createContext, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Obra {
  id: string;
  code: string;
  clientName: string;
  condominium: string;
  unitNumber: string;
  status: 'ativa' | 'concluída' | 'pausada';
  createdAt: string;
}

interface ObrasContextType {
  obras: Obra[];
  isLoading: boolean;
  addObra: (data: Omit<Obra, 'id' | 'code' | 'createdAt'>) => void;
  updateObra: (id: string, data: Partial<Omit<Obra, 'id' | 'code' | 'createdAt'>>) => void;
  deleteObra: (id: string) => void;
}

const ObrasContext = createContext<ObrasContextType | null>(null);

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'OBR-';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function rowToObra(row: any): Obra {
  return {
    id: row.id,
    code: row.code,
    clientName: row.client_name,
    condominium: row.condominium || '',
    unitNumber: row.unit_number || '',
    status: row.status as Obra['status'],
    createdAt: row.created_at,
  };
}

export function ObrasProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();

  const { data: obras = [], isLoading } = useQuery({
    queryKey: ['obras'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('obras')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(rowToObra);
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: Omit<Obra, 'id' | 'code' | 'createdAt'>) => {
      const { error } = await supabase.from('obras').insert({
        code: generateCode(),
        client_name: data.clientName,
        condominium: data.condominium,
        unit_number: data.unitNumber,
        status: data.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['obras'] });
      toast.success('Obra cadastrada com sucesso');
    },
    onError: () => toast.error('Erro ao cadastrar obra'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Omit<Obra, 'id' | 'code' | 'createdAt'>> }) => {
      const update: any = {};
      if (data.clientName !== undefined) update.client_name = data.clientName;
      if (data.condominium !== undefined) update.condominium = data.condominium;
      if (data.unitNumber !== undefined) update.unit_number = data.unitNumber;
      if (data.status !== undefined) update.status = data.status;
      const { error } = await supabase.from('obras').update(update).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['obras'] });
      toast.success('Obra atualizada');
    },
    onError: () => toast.error('Erro ao atualizar obra'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('obras').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['obras'] });
      toast.success('Obra removida');
    },
    onError: () => toast.error('Erro ao remover obra'),
  });

  return (
    <ObrasContext.Provider
      value={{
        obras,
        isLoading,
        addObra: (data) => addMutation.mutate(data),
        updateObra: (id, data) => updateMutation.mutate({ id, data }),
        deleteObra: (id) => deleteMutation.mutate(id),
      }}
    >
      {children}
    </ObrasContext.Provider>
  );
}

export function useObras() {
  const ctx = useContext(ObrasContext);
  if (!ctx) throw new Error('useObras must be used within ObrasProvider');
  return ctx;
}
