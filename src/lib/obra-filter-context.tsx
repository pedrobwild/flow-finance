import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { useFinance } from './finance-context';
import { Transaction } from './types';

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
}

const ObraFilterContext = createContext<ObraFilterContextType | null>(null);

export function ObraFilterProvider({ children }: { children: React.ReactNode }) {
  const { transactions, payables, receivables } = useFinance();
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

  return (
    <ObraFilterContext.Provider value={{
      selectedObraId,
      setSelectedObraId,
      filteredTransactions,
      filteredPayables,
      filteredReceivables,
      isFiltered: selectedObraId !== null,
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
