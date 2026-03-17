import React, { createContext, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Bill, BillStatus, CostCenter, Recurrence } from './types';

// Map DB row to our Bill type
function rowToBill(row: any): Bill {
  return {
    id: row.id,
    description: row.description,
    supplier: row.supplier,
    amount: Number(row.amount),
    dueDate: row.due_date,
    paidAt: row.paid_at,
    status: row.status as BillStatus,
    costCenter: row.cost_center as CostCenter,
    category: row.category,
    recurrence: row.recurrence as Recurrence,
    notes: row.notes || '',
  };
}

interface BillsContextType {
  bills: Bill[];
  isLoading: boolean;
  addBill: (bill: Omit<Bill, 'id'>) => void;
  updateBill: (id: string, updates: Partial<Bill>) => void;
  deleteBill: (id: string) => void;
  markAsPaid: (id: string) => void;
}

const BillsContext = createContext<BillsContextType | null>(null);

export function BillsProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const queryKey = ['bills'];

  const { data: bills = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .order('due_date', { ascending: true });
      if (error) throw error;
      return (data || []).map(rowToBill);
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const addMutation = useMutation({
    mutationFn: async (bill: Omit<Bill, 'id'>) => {
      const { error } = await supabase.from('bills').insert({
        description: bill.description,
        supplier: bill.supplier,
        amount: bill.amount,
        due_date: bill.dueDate,
        paid_at: bill.paidAt,
        status: bill.status,
        cost_center: bill.costCenter,
        category: bill.category,
        recurrence: bill.recurrence,
        notes: bill.notes,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Bill> }) => {
      const dbUpdates: any = {};
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.supplier !== undefined) dbUpdates.supplier = updates.supplier;
      if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
      if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
      if (updates.paidAt !== undefined) dbUpdates.paid_at = updates.paidAt;
      if (updates.status !== undefined) dbUpdates.status = updates.status;
      if (updates.costCenter !== undefined) dbUpdates.cost_center = updates.costCenter;
      if (updates.category !== undefined) dbUpdates.category = updates.category;
      if (updates.recurrence !== undefined) dbUpdates.recurrence = updates.recurrence;
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

      const { error } = await supabase.from('bills').update(dbUpdates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bills').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bills').update({
        status: 'pago',
        paid_at: new Date().toISOString().split('T')[0],
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return (
    <BillsContext.Provider value={{
      bills,
      isLoading,
      addBill: (bill) => addMutation.mutate(bill),
      updateBill: (id, updates) => updateMutation.mutate({ id, updates }),
      deleteBill: (id) => deleteMutation.mutate(id),
      markAsPaid: (id) => markPaidMutation.mutate(id),
    }}>
      {children}
    </BillsContext.Provider>
  );
}

export function useBills() {
  const ctx = useContext(BillsContext);
  if (!ctx) throw new Error('useBills must be used within BillsProvider');
  return ctx;
}
