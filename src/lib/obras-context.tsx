import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Obra, ObraStatus, ObraFinancials, Transaction } from './types';
import { useFinance } from './finance-context';
import { todayISO } from './helpers';

interface ObrasContextType {
  obras: Obra[];
  isLoading: boolean;
  addObra: (data: Omit<Obra, 'id' | 'code' | 'createdAt'>) => Promise<Obra | null>;
  updateObra: (id: string, data: Partial<Omit<Obra, 'id' | 'code' | 'createdAt'>>) => void;
  deleteObra: (id: string) => void;
  getObraFinancials: (obraId: string) => ObraFinancials;
  getActiveObrasWithFinancials: () => (Obra & ObraFinancials)[];
}

const obrasContextRegistry = globalThis as typeof globalThis & {
  __BWILD_OBRAS_CONTEXT__?: React.Context<ObrasContextType | null>;
};

const ObrasContext =
  obrasContextRegistry.__BWILD_OBRAS_CONTEXT__ ??
  createContext<ObrasContextType | null>(null);

if (!obrasContextRegistry.__BWILD_OBRAS_CONTEXT__) {
  obrasContextRegistry.__BWILD_OBRAS_CONTEXT__ = ObrasContext;
}

ObrasContext.displayName = 'ObrasContext';

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
    clientEmail: row.client_email || '',
    condominium: row.condominium || '',
    unitNumber: row.unit_number || '',
    address: row.address || '',
    status: row.status as ObraStatus,
    contractValue: Number(row.contract_value) || 0,
    budgetTarget: Number(row.budget_target) || 0,
    paymentTerms: row.payment_terms || '',
    expectedStartDate: row.expected_start_date || null,
    expectedEndDate: row.expected_end_date || null,
    actualStartDate: row.actual_start_date || null,
    actualEndDate: row.actual_end_date || null,
    notes: row.notes || '',
    createdAt: row.created_at,
  };
}

function computeObraFinancials(obra: Obra, transactions: Transaction[]): ObraFinancials {
  const obraTxs = transactions.filter(t => t.obraId === obra.id);
  const receivables = obraTxs.filter(t => t.type === 'receber');
  const payables = obraTxs.filter(t => t.type === 'pagar');
  const today = todayISO();

  const totalReceivable = receivables.reduce((s, t) => s + t.amount, 0);
  const totalReceived = receivables.filter(t => t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);
  const totalPendingReceivable = receivables.filter(t => t.status !== 'confirmado' && t.status !== 'atrasado').reduce((s, t) => s + t.amount, 0);
  const totalOverdueReceivable = receivables.filter(t => t.status === 'atrasado').reduce((s, t) => s + t.amount, 0);

  const totalCost = payables.reduce((s, t) => s + t.amount, 0);
  const totalPaidCost = payables.filter(t => t.status === 'confirmado').reduce((s, t) => s + t.amount, 0);
  const totalPendingCost = payables.filter(t => t.status !== 'confirmado').reduce((s, t) => s + t.amount, 0);

  const contractValue = obra.contractValue;
  const grossMargin = contractValue - totalCost;
  const grossMarginPercentage = contractValue > 0 ? (grossMargin / contractValue) * 100 : 0;
  const currentMargin = totalReceived - totalPaidCost;
  const receivedPercentage = contractValue > 0 ? (totalReceived / contractValue) * 100 : 0;

  // Next receivable/payable
  const pendingReceivables = receivables
    .filter(t => t.status !== 'confirmado')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pendingPayables = payables
    .filter(t => t.status !== 'confirmado')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return {
    totalContractValue: contractValue,
    totalReceivable,
    totalReceived,
    totalPendingReceivable,
    totalOverdueReceivable,
    receivedPercentage,
    totalCost,
    totalPaidCost,
    totalPendingCost,
    grossMargin,
    grossMarginPercentage,
    currentMargin,
    obraNetCashFlow: totalReceived - totalPaidCost,
    nextReceivable: pendingReceivables[0] || null,
    nextPayable: pendingPayables[0] || null,
  };
}

export function ObrasProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { transactions } = useFinance();

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

  const getObraFinancials = useCallback((obraId: string): ObraFinancials => {
    const obra = obras.find(o => o.id === obraId);
    if (!obra) {
      return {
        totalContractValue: 0, totalReceivable: 0, totalReceived: 0,
        totalPendingReceivable: 0, totalOverdueReceivable: 0, receivedPercentage: 0,
        totalCost: 0, totalPaidCost: 0, totalPendingCost: 0,
        grossMargin: 0, grossMarginPercentage: 0, currentMargin: 0,
        obraNetCashFlow: 0, nextReceivable: null, nextPayable: null,
      };
    }
    return computeObraFinancials(obra, transactions);
  }, [obras, transactions]);

  const getActiveObrasWithFinancials = useCallback((): (Obra & ObraFinancials)[] => {
    return obras
      .filter(o => o.status === 'ativa')
      .map(o => ({ ...o, ...computeObraFinancials(o, transactions) }))
      .sort((a, b) => {
        const da = a.nextReceivable?.dueDate || '9999';
        const db = b.nextReceivable?.dueDate || '9999';
        return da.localeCompare(db);
      });
  }, [obras, transactions]);

  const addMutation = useMutation({
    mutationFn: async (data: Omit<Obra, 'id' | 'code' | 'createdAt'>) => {
      const { data: rows, error } = await supabase.from('obras').insert({
        code: generateCode(),
        client_name: data.clientName,
        client_email: data.clientEmail || '',
        condominium: data.condominium,
        unit_number: data.unitNumber,
        address: data.address,
        status: data.status,
        contract_value: data.contractValue,
        budget_target: data.budgetTarget || 0,
        payment_terms: data.paymentTerms,
        expected_start_date: data.expectedStartDate || null,
        expected_end_date: data.expectedEndDate || null,
        actual_start_date: data.actualStartDate || null,
        actual_end_date: data.actualEndDate || null,
        notes: data.notes,
      }).select().single();
      if (error) throw error;
      return rowToObra(rows);
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
      if (data.clientEmail !== undefined) update.client_email = data.clientEmail;
      if (data.condominium !== undefined) update.condominium = data.condominium;
      if (data.unitNumber !== undefined) update.unit_number = data.unitNumber;
      if (data.address !== undefined) update.address = data.address;
      if (data.status !== undefined) update.status = data.status;
      if (data.contractValue !== undefined) update.contract_value = data.contractValue;
      if (data.budgetTarget !== undefined) update.budget_target = data.budgetTarget;
      if (data.paymentTerms !== undefined) update.payment_terms = data.paymentTerms;
      if (data.expectedStartDate !== undefined) update.expected_start_date = data.expectedStartDate || null;
      if (data.expectedEndDate !== undefined) update.expected_end_date = data.expectedEndDate || null;
      if (data.actualStartDate !== undefined) update.actual_start_date = data.actualStartDate || null;
      if (data.actualEndDate !== undefined) update.actual_end_date = data.actualEndDate || null;
      if (data.notes !== undefined) update.notes = data.notes;
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
        addObra: (data) => addMutation.mutateAsync(data),
        updateObra: (id, data) => updateMutation.mutate({ id, data }),
        deleteObra: (id) => deleteMutation.mutate(id),
        getObraFinancials,
        getActiveObrasWithFinancials,
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
