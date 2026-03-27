import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Transaction, CashBalance, TransactionType, TransactionStatus,
  CostCenter, Recurrence, PaymentMethod, Priority,
} from './types';
import { computeStatus, todayISO } from './helpers';
import { toast } from 'sonner';

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
    obraId: row.obra_id || null,
    billingSentAt: row.billing_sent_at || null,
    billingCount: Number(row.billing_count) || 0,
    attachmentUrl: row.attachment_url || null,
    receiptUrl: row.receipt_url || null,
    cdiAdjustable: row.cdi_adjustable || false,
    cdiPercentage: row.cdi_percentage != null ? Number(row.cdi_percentage) : null,
    baseAmount: row.base_amount != null ? Number(row.base_amount) : null,
    baseDate: row.base_date || null,
  };
  // Auto-recalculate CDI-adjusted amount
  if (tx.cdiAdjustable && tx.baseAmount != null && tx.baseDate && tx.cdiPercentage != null && tx.status !== 'confirmado') {
    const CDI_ANNUAL = 0.1415; // Selic/CDI ~14.15% a.a.
    const today = new Date();
    const base = new Date(tx.baseDate + 'T12:00:00');
    const daysDiff = Math.max(0, Math.round((today.getTime() - base.getTime()) / (1000 * 60 * 60 * 24)));
    const dailyRate = Math.pow(1 + CDI_ANNUAL, 1 / 252) - 1;
    const factor = Math.pow(1 + dailyRate * (tx.cdiPercentage / 100), daysDiff);
    tx.amount = Math.round(tx.baseAmount * factor * 100) / 100;
  }
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
  addTransactions: (txs: Omit<Transaction, 'id'>[]) => Promise<void>;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  confirmTransaction: (id: string, actualAmount?: number, txType?: string, paidAt?: string) => void;
  updateCashBalance: (amount: number, date?: string) => void;
  projectedBalance: (date: string) => number;
  getTransactionsByObra: (obraId: string | null) => Transaction[];
  projectedBalanceForObra: (obraId: string, date: string) => number;
}

const financeContextRegistry = globalThis as typeof globalThis & {
  __BWILD_FINANCE_CONTEXT__?: React.Context<FinanceContextType | null>;
};

const FinanceContext =
  financeContextRegistry.__BWILD_FINANCE_CONTEXT__ ??
  createContext<FinanceContextType | null>(null);

if (!financeContextRegistry.__BWILD_FINANCE_CONTEXT__) {
  financeContextRegistry.__BWILD_FINANCE_CONTEXT__ = FinanceContext;
}

FinanceContext.displayName = 'FinanceContext';

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
        obra_id: (tx as any).obraId || null,
        billing_sent_at: tx.billingSentAt || null,
        billing_count: tx.billingCount || 0,
        attachment_url: tx.attachmentUrl || null,
        receipt_url: tx.receiptUrl || null,
        cdi_adjustable: (tx as any).cdiAdjustable || false,
        cdi_percentage: (tx as any).cdiPercentage || null,
        base_amount: (tx as any).baseAmount || null,
        base_date: (tx as any).baseDate || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateTx();
      toast.success('Transação criada com sucesso');
    },
    onError: (err: any) => {
      console.error('Insert transaction error:', err);
      toast.error(`Erro ao criar transação: ${err?.message || err}`);
    },
  });

  const addBulkMutation = useMutation({
    mutationFn: async (txs: Omit<Transaction, 'id'>[]) => {
      const rows = txs.map(tx => ({
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
        obra_id: (tx as any).obraId || null,
        billing_sent_at: tx.billingSentAt || null,
        billing_count: tx.billingCount || 0,
        attachment_url: tx.attachmentUrl || null,
        receipt_url: tx.receiptUrl || null,
        cdi_adjustable: (tx as any).cdiAdjustable || false,
        cdi_percentage: (tx as any).cdiPercentage || null,
        base_amount: (tx as any).baseAmount || null,
        base_date: (tx as any).baseDate || null,
      }));
      const { error } = await supabase.from('transactions').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateTx();
    },
    onError: () => toast.error('Erro ao criar transações'),
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
      if ((updates as any).obraId !== undefined) db.obra_id = (updates as any).obraId;
      if (updates.billingSentAt !== undefined) db.billing_sent_at = updates.billingSentAt;
      if (updates.billingCount !== undefined) db.billing_count = updates.billingCount;
      if (updates.attachmentUrl !== undefined) db.attachment_url = updates.attachmentUrl;
      if ((updates as any).cdiAdjustable !== undefined) db.cdi_adjustable = (updates as any).cdiAdjustable;
      if ((updates as any).cdiPercentage !== undefined) db.cdi_percentage = (updates as any).cdiPercentage;
      if ((updates as any).baseAmount !== undefined) db.base_amount = (updates as any).baseAmount;
      if ((updates as any).baseDate !== undefined) db.base_date = (updates as any).baseDate;
      const { error } = await supabase.from('transactions').update(db).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateTx();
      toast.success('Transação atualizada');
    },
    onError: () => toast.error('Erro ao atualizar transação'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateTx();
      toast.success('Transação excluída');
    },
    onError: () => toast.error('Erro ao excluir transação'),
  });

  const confirmMutation = useMutation({
    mutationFn: async ({ id, actualAmount, txType, paidAt }: { id: string; actualAmount?: number; txType?: string; paidAt?: string }) => {
      const updateData: any = {
        status: 'confirmado',
        paid_at: paidAt || todayISO(),
      };
      if (actualAmount !== undefined) {
        updateData.amount = actualAmount;
      }
      const { error } = await supabase.from('transactions').update(updateData).eq('id', id);
      if (error) throw error;

      if (actualAmount !== undefined && txType) {
        // Fetch the LATEST balance from DB to avoid stale state issues
        const { data: latestBal } = await supabase
          .from('cash_balance')
          .select('amount')
          .order('balance_date', { ascending: false })
          .limit(1)
          .single();

        const currentAmt = latestBal?.amount ?? 0;
        const newBalance = txType === 'receber'
          ? currentAmt + actualAmount
          : currentAmt - actualAmount;
        const today = todayISO();
        const { error: balError } = await supabase.from('cash_balance').upsert({
          balance_date: today,
          amount: newBalance,
          bank_account: 'Principal',
        }, { onConflict: 'balance_date' });
        if (balError) throw balError;
      }
    },
    onSuccess: () => {
      invalidateTx();
      invalidateBal();
      toast.success('Transação confirmada e saldo atualizado');
    },
    onError: () => toast.error('Erro ao confirmar transação'),
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
    onSuccess: () => {
      invalidateBal();
      toast.success('Saldo atualizado');
    },
    onError: () => toast.error('Erro ao atualizar saldo'),
  });

  const projectedBalance = useCallback((targetDate: string): number => {
    const base = currentBalance?.amount ?? 0;
    let projected = base;

    for (const tx of transactions) {
      if (tx.status === 'confirmado') continue;
      if (tx.dueDate > targetDate) continue;

      if (tx.type === 'receber') {
        if (tx.status === 'atrasado') continue;
        projected += tx.amount;
      } else {
        projected -= tx.amount;
      }
    }
    return projected;
  }, [transactions, currentBalance]);

  const getTransactionsByObra = useCallback((obraId: string | null): Transaction[] => {
    if (obraId === null) {
      return transactions.filter(t => !t.obraId);
    }
    return transactions.filter(t => t.obraId === obraId);
  }, [transactions]);

  const projectedBalanceForObra = useCallback((obraId: string, targetDate: string): number => {
    const obraTxs = transactions.filter(t => t.obraId === obraId);
    let balance = 0;

    for (const tx of obraTxs) {
      if (tx.dueDate > targetDate) continue;
      if (tx.type === 'receber') {
        if (tx.status === 'confirmado' || tx.status !== 'atrasado') {
          balance += tx.amount;
        }
      } else {
        balance -= tx.amount;
      }
    }
    return balance;
  }, [transactions]);

  return (
    <FinanceContext.Provider value={{
      transactions,
      payables,
      receivables,
      currentBalance,
      isLoading,
      addTransaction: (tx) => addMutation.mutate(tx),
      addTransactions: (txs) => addBulkMutation.mutateAsync(txs),
      updateTransaction: (id, updates) => updateMutation.mutate({ id, updates }),
      deleteTransaction: (id) => deleteMutation.mutate(id),
      confirmTransaction: (id, actualAmount, txType, paidAt) => confirmMutation.mutate({ id, actualAmount, txType, paidAt }),
      updateCashBalance: (amount, date) => balanceMutation.mutate({ amount, date: date || todayISO() }),
      projectedBalance,
      getTransactionsByObra,
      projectedBalanceForObra,
    }}>
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance(): FinanceContextType {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance must be used within FinanceProvider');
  return ctx;
}
