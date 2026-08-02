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
    cdiLastUpdate: row.cdi_last_update || null,
    source: (row.source || 'manual') as Transaction['source'],
    needsReview: row.needs_review || false,
    barcodeLine: row.barcode_line || null,
  };
  // O valor corrigido pelo CDI é calculado no banco (job diário `aplicar_correcao_cdi`).
  // Nada é recalculado no navegador para não divergir do banco/exports.
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
  /** Confirma várias transações de uma vez (RPC atômica: status + saldo). */
  confirmTransactions: (ids: string[], paidAt?: string) => Promise<void>;
  updateCashBalance: (amount: number, date?: string) => void;
  projectedBalance: (date: string) => number;
  /** Total de recebíveis atrasados — deliberadamente FORA da projeção (visão conservadora). */
  overdueReceivablesTotal: number;
  getTransactionsByObra: (obraId: string | null) => Transaction[];
  projectedBalanceForObra: (obraId: string, date: string) => number;
  /** Detalhe da projeção da obra: realizado (confirmado) x projetado (previsto/pendente). */
  obraBalanceBreakdown: (obraId: string, date: string) => { realizado: number; projetado: number; liquido: number };
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
      if (updates.receiptUrl !== undefined) db.receipt_url = updates.receiptUrl;
      if ((updates as any).cdiAdjustable !== undefined) db.cdi_adjustable = (updates as any).cdiAdjustable;
      if ((updates as any).cdiPercentage !== undefined) db.cdi_percentage = (updates as any).cdiPercentage;
      if ((updates as any).baseAmount !== undefined) db.base_amount = (updates as any).baseAmount;
      if ((updates as any).baseDate !== undefined) db.base_date = (updates as any).baseDate;
      if (updates.needsReview !== undefined) db.needs_review = updates.needsReview;
      if (updates.barcodeLine !== undefined) db.barcode_line = updates.barcodeLine;
      if (updates.source !== undefined) db.source = updates.source;
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

  /**
   * Confirmação (individual ou em lote) via RPC atômica `confirmar_transacoes`:
   * marca status/paid_at e aplica UM único ajuste de saldo no banco.
   */
  const confirmMutation = useMutation({
    mutationFn: async ({ ids, paidAt, amountOverrides }: {
      ids: string[];
      paidAt?: string;
      amountOverrides?: Record<string, number>;
    }) => {
      const date = paidAt || todayISO();

      // Se o valor real pago foi editado, grava o valor antes de confirmar.
      if (amountOverrides) {
        for (const [id, amount] of Object.entries(amountOverrides)) {
          const { error } = await supabase.from('transactions').update({ amount }).eq('id', id);
          if (error) throw error;
        }
      }

      const { data, error } = await supabase.rpc('confirmar_transacoes', {
        p_ids: ids,
        p_paid_at: date,
      });
      if (error) throw error;
      return data as { confirmed: number; delta: number; new_balance: number } | null;
    },
    onSuccess: (result) => {
      invalidateTx();
      invalidateBal();
      const n = result?.confirmed ?? 0;
      toast.success(n > 1
        ? `${n} lançamentos confirmados e saldo atualizado`
        : 'Transação confirmada e saldo atualizado');
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

  /**
   * Projeção geral: saldo atual + lançamentos até a data.
   * Visão conservadora — recebíveis ATRASADOS ficam de fora (ver `overdueReceivablesTotal`).
   */
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

  const overdueReceivablesTotal = useMemo(
    () => transactions
      .filter(t => t.type === 'receber' && t.status === 'atrasado')
      .reduce((s, t) => s + t.amount, 0),
    [transactions],
  );

  const getTransactionsByObra = useCallback((obraId: string | null): Transaction[] => {
    if (obraId === null) {
      return transactions.filter(t => !t.obraId);
    }
    return transactions.filter(t => t.obraId === obraId);
  }, [transactions]);

  /**
   * Separa realizado x projetado da obra até a data:
   * - realizado: apenas lançamentos confirmados (recebidos - pagos);
   * - projetado: previstos/pendentes NÃO atrasados (a receber - a pagar);
   * - liquido: realizado + projetado.
   */
  const obraBalanceBreakdown = useCallback((obraId: string, targetDate: string) => {
    const obraTxs = transactions.filter(t => t.obraId === obraId && t.dueDate <= targetDate);
    let realizado = 0;
    let projetado = 0;

    for (const tx of obraTxs) {
      const signed = tx.type === 'receber' ? tx.amount : -tx.amount;
      if (tx.status === 'confirmado') {
        realizado += signed;
      } else if (tx.status !== 'atrasado') {
        projetado += signed;
      }
    }
    return { realizado, projetado, liquido: realizado + projetado };
  }, [transactions]);

  const projectedBalanceForObra = useCallback(
    (obraId: string, targetDate: string): number => obraBalanceBreakdown(obraId, targetDate).liquido,
    [obraBalanceBreakdown],
  );

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
      confirmTransaction: (id, actualAmount, _txType, paidAt) => confirmMutation.mutate({
        ids: [id],
        paidAt,
        amountOverrides: actualAmount !== undefined ? { [id]: actualAmount } : undefined,
      }),
      confirmTransactions: (ids, paidAt) => confirmMutation.mutateAsync({ ids, paidAt }).then(() => undefined),
      updateCashBalance: (amount, date) => balanceMutation.mutate({ amount, date: date || todayISO() }),
      projectedBalance,
      overdueReceivablesTotal,
      getTransactionsByObra,
      projectedBalanceForObra,
      obraBalanceBreakdown,
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
