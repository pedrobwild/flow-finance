import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Transaction, CashBalance, TransactionType, TransactionStatus,
  CostCenter, Recurrence, PaymentMethod, Priority,
} from './types';
import { computeStatus, todayISO } from './helpers';

function rowToTransaction(row: any): Transaction {
  const tx: Transaction = {
    id: row.id,
    type: row.type as TransactionType,
    description: row.description,
    counterpart: row.counterpart || '',
    amount: Number(row.amount),
    dueDate: row.due_date,
    paidAt: row.paid_at,
    status: row.status as TransactionStatus,
    costCenter: row.cost_center as CostCenter,
    category: row.category,
    recurrence: row.recurrence as Recurrence,
    paymentMethod: (row.payment_method || '') as PaymentMethod,
    notes: row.notes || '',
    priority: row.priority as Priority,
  };
  tx.status = computeStatus(tx);
  return tx;
}

function rowToCashBalance(row: any): CashBalance {
  return {
    id: row.id,
    balanceDate: row.balance_date,
    amount: Number(row.amount),
    bankAccount: row.bank_account || 'Principal',
    notes: row.notes || '',
  };
}

interface FinanceContextType {
  transactions: Transaction[];
  payables: Transaction[];
  receivables: Transaction[];
  currentBalance: CashBalance | null;
  isLoading: boolean;
  addTransaction: (tx: Omit<Transaction, 'id'>) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  confirmTransaction: (id: string) => void;
  updateCashBalance: (amount: number, date?: string) => void;
  projectedBalance: (date: string) => number;
}

const FinanceContext = createContext<FinanceContextType | null>(null);

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const txKey = ['transactions'];
  const balKey = ['cash_balance'];

  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: txKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('due_date', { ascending: true });
      if (error) throw error;
      return (data || []).map(rowToTransaction);
    },
  });

  const { data: balances = [], isLoading: balLoading } = useQuery({
    queryKey: balKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_balance')
        .select('*')
        .order('balance_date', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data || []).map(rowToCashBalance);
    },
  });

  const currentBalance = balances[0] || null;
  const isLoading = txLoading || balLoading;

  const payables = useMemo(() => transactions.filter(t => t.type === 'pagar'), [transactions]);
  const receivables = useMemo(() => transactions.filter(t => t.type === 'receber'), [transactions]);

  const invalidateTx = () => qc.invalidateQueries({ queryKey: txKey });
  const invalidateBal = () => qc.invalidateQueries({ queryKey: balKey });

  const addMutation = useMutation({
    mutationFn: async (tx: Omit<Transaction, 'id'>) => {
      const { error } = await supabase.from('transactions').insert({
        type: tx.type,
        description: tx.description,
        counterpart: tx.counterpart,
        amount: tx.amount,
        due_date: tx.dueDate,
        paid_at: tx.paidAt,
        status: tx.status,
        cost_center: tx.costCenter,
        category: tx.category,
        recurrence: tx.recurrence,
        payment_method: tx.paymentMethod,
        notes: tx.notes,
        priority: tx.priority,
      });
      if (error) throw error;
    },
    onSuccess: invalidateTx,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Transaction> }) => {
      const db: any = {};
      if (updates.type !== undefined) db.type = updates.type;
      if (updates.description !== undefined) db.description = updates.description;
      if (updates.counterpart !== undefined) db.counterpart = updates.counterpart;
      if (updates.amount !== undefined) db.amount = updates.amount;
      if (updates.dueDate !== undefined) db.due_date = updates.dueDate;
      if (updates.paidAt !== undefined) db.paid_at = updates.paidAt;
      if (updates.status !== undefined) db.status = updates.status;
      if (updates.costCenter !== undefined) db.cost_center = updates.costCenter;
      if (updates.category !== undefined) db.category = updates.category;
      if (updates.recurrence !== undefined) db.recurrence = updates.recurrence;
      if (updates.paymentMethod !== undefined) db.payment_method = updates.paymentMethod;
      if (updates.notes !== undefined) db.notes = updates.notes;
      if (updates.priority !== undefined) db.priority = updates.priority;
      const { error } = await supabase.from('transactions').update(db).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateTx,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateTx,
  });

  const confirmMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').update({
        status: 'confirmado',
        paid_at: todayISO(),
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateTx,
  });

  const balanceMutation = useMutation({
    mutationFn: async ({ amount, date }: { amount: number; date: string }) => {
      const { error } = await supabase.from('cash_balance').upsert({
        balance_date: date,
        amount,
        bank_account: 'Principal',
      }, { onConflict: 'balance_date' });
      if (error) throw error;
    },
    onSuccess: invalidateBal,
  });

  const projectedBalance = useCallback((targetDate: string): number => {
    const base = currentBalance?.amount ?? 0;
    const today = todayISO();
    let projected = base;

    for (const tx of transactions) {
      if (tx.status === 'confirmado') continue;
      if (tx.dueDate > targetDate) continue;

      if (tx.type === 'receber') {
        if (tx.status === 'atrasado') continue; // uncertain
        projected += tx.amount;
      } else {
        projected -= tx.amount; // include overdue payables
      }
    }
    return projected;
  }, [transactions, currentBalance]);

  return (
    <FinanceContext.Provider value={{
      transactions,
      payables,
      receivables,
      currentBalance,
      isLoading,
      addTransaction: (tx) => addMutation.mutate(tx),
      updateTransaction: (id, updates) => updateMutation.mutate({ id, updates }),
      deleteTransaction: (id) => deleteMutation.mutate(id),
      confirmTransaction: (id) => confirmMutation.mutate(id),
      updateCashBalance: (amount, date) => balanceMutation.mutate({ amount, date: date || todayISO() }),
      projectedBalance,
    }}>
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance must be used within FinanceProvider');
  return ctx;
}
