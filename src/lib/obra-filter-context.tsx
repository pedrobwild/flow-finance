import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { useFinance } from './finance-context';
import { Transaction, CashBalance } from './types';

interface ObraFilterContextType {
  /** null = "Visão Geral" (all transactions), string = specific obra id */
  selectedObraId: string | null;
  setSelectedObraId: (id: string | null) => void;
  /** Transactions filtered by selected obra. If null, returns all. */
  filteredTransactions: Transaction[];
  /** Payables filtered */
  filteredPayables: Transaction[];
  /** Receivables filtered */
  filteredReceivables: Transaction[];
  /** Whether a filter is active */
  isFiltered: boolean;
  /** Balance: real bank balance when no filter, null (zero-based) when obra selected */
  filteredBalance: CashBalance | null;
  /** Projected balance function scoped to the filter */
  filteredProjectedBalance: (targetDate: string) => number;
}

const obraFilterRegistry = globalThis as typeof globalThis & {
  __BWILD_OBRA_FILTER_CONTEXT__?: React.Context<ObraFilterContextType | null>;
};

const ObraFilterContext =
  obraFilterRegistry.__BWILD_OBRA_FILTER_CONTEXT__ ??
  createContext<ObraFilterContextType | null>(null);

if (!obraFilterRegistry.__BWILD_OBRA_FILTER_CONTEXT__) {
  obraFilterRegistry.__BWILD_OBRA_FILTER_CONTEXT__ = ObraFilterContext;
}

ObraFilterContext.displayName = 'ObraFilterContext';

export function ObraFilterProvider({ children }: { children: React.ReactNode }) {
  const { transactions, payables, receivables, currentBalance, projectedBalance } = useFinance();
  const [selectedObraId, setSelectedObraId] = useState<string | null>(null);

  const filteredTransactions = useMemo(() => {
    if (!selectedObraId) return transactions;
    return transactions.filter(t => t.obraId === selectedObraId);
  }, [transactions, selectedObraId]);

  const filteredPayables = useMemo(() => {
    if (!selectedObraId) return payables;
    return payables.filter(t => t.obraId === selectedObraId);
  }, [payables, selectedObraId]);

  const filteredReceivables = useMemo(() => {
    if (!selectedObraId) return receivables;
    return receivables.filter(t => t.obraId === selectedObraId);
  }, [receivables, selectedObraId]);

  // When an obra is selected, balance starts at 0 (no bank balance for a single project)
  const filteredBalance = useMemo<CashBalance | null>(() => {
    if (!selectedObraId) return currentBalance;
    // Obra balance = sum of confirmed receivables - confirmed payables
    const confirmed = filteredTransactions.filter(t => t.status === 'confirmado');
    const received = confirmed.filter(t => t.type === 'receber').reduce((s, t) => s + t.amount, 0);
    const paid = confirmed.filter(t => t.type === 'pagar').reduce((s, t) => s + t.amount, 0);
    return {
      id: 'obra-virtual',
      balanceDate: new Date().toISOString().slice(0, 10),
      amount: received - paid,
      bankAccount: 'Obra',
      notes: '',
    };
  }, [selectedObraId, currentBalance, filteredTransactions]);

  // Projected balance scoped to the filter
  const filteredProjectedBalance = useCallback((targetDate: string): number => {
    if (!selectedObraId) return projectedBalance(targetDate);

    // For an obra: start at 0, add/subtract non-confirmed transactions up to targetDate
    const obraTxs = filteredTransactions;
    let balance = 0;

    // First add confirmed transactions (already happened)
    const confirmed = obraTxs.filter(t => t.status === 'confirmado');
    for (const tx of confirmed) {
      if (tx.type === 'receber') balance += tx.amount;
      else balance -= tx.amount;
    }

    // Then add pending/previsto transactions up to targetDate
    const pending = obraTxs.filter(t => t.status !== 'confirmado' && t.dueDate <= targetDate);
    for (const tx of pending) {
      if (tx.type === 'receber') {
        // Skip overdue receivables (prudence)
        if (tx.status !== 'atrasado') balance += tx.amount;
      } else {
        balance -= tx.amount;
      }
    }

    return balance;
  }, [selectedObraId, filteredTransactions, projectedBalance]);

  return (
    <ObraFilterContext.Provider value={{
      selectedObraId,
      setSelectedObraId,
      filteredTransactions,
      filteredPayables,
      filteredReceivables,
      isFiltered: selectedObraId !== null,
      filteredBalance,
      filteredProjectedBalance,
    }}>
      {children}
    </ObraFilterContext.Provider>
  );
}

export function useObraFilter() {
  const ctx = useContext(ObraFilterContext);
  if (!ctx) throw new Error('useObraFilter must be used within ObraFilterProvider');
  return ctx;
}
