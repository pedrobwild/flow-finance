import React, { createContext, useContext, useState, useCallback } from 'react';
import { Bill, BillStatus } from './types';
import { mockBills } from './mock-data';

interface BillsContextType {
  bills: Bill[];
  addBill: (bill: Omit<Bill, 'id'>) => void;
  updateBill: (id: string, updates: Partial<Bill>) => void;
  deleteBill: (id: string) => void;
  markAsPaid: (id: string) => void;
}

const BillsContext = createContext<BillsContextType | null>(null);

export function BillsProvider({ children }: { children: React.ReactNode }) {
  const [bills, setBills] = useState<Bill[]>(mockBills);

  const addBill = useCallback((bill: Omit<Bill, 'id'>) => {
    setBills(prev => [...prev, { ...bill, id: Date.now().toString() }]);
  }, []);

  const updateBill = useCallback((id: string, updates: Partial<Bill>) => {
    setBills(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  const deleteBill = useCallback((id: string) => {
    setBills(prev => prev.filter(b => b.id !== id));
  }, []);

  const markAsPaid = useCallback((id: string) => {
    setBills(prev => prev.map(b => b.id === id ? {
      ...b,
      status: 'pago' as BillStatus,
      paidAt: new Date().toISOString().split('T')[0],
    } : b));
  }, []);

  return (
    <BillsContext.Provider value={{ bills, addBill, updateBill, deleteBill, markAsPaid }}>
      {children}
    </BillsContext.Provider>
  );
}

export function useBills() {
  const ctx = useContext(BillsContext);
  if (!ctx) throw new Error('useBills must be used within BillsProvider');
  return ctx;
}
