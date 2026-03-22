import { useMemo, useState, useCallback, useEffect } from 'react';
import { useObraFilter } from '@/lib/obra-filter-context';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth, daysBetween, formatDateFull } from '@/lib/helpers';
import { supabase } from '@/integrations/supabase/client';
import type { TransactionType } from '@/lib/types';
import { detectCrisis, buildCrisisContext, resolveActionPrefillPure } from './useWarRoom.logic';

// === TYPES ===
export interface WarAction {
  priority: 'imediata' | 'urgente' | 'importante' | 'preventiva';
  category: 'cobranca' | 'antecipacao' | 'renegociacao' | 'corte' | 'credito' | 'cronograma';
  title: string;
  description: string;
  steps?: string[];
  impactAmount: number;
  impactLabel: string;
  effort: 'baixo' | 'medio' | 'alto';
  deadline: string;
  linkTo: string;
  prefill?: {
    type?: TransactionType;
    description?: string;
    counterpart?: string;
    amount?: number;
    category?: string;
    notes?: string;
    obraCode?: string;
  };
}

export interface WarRoomData {
  summary: string;
  totalRecoverable: number;
  coveragePercentage: number;
  actions: WarAction[];
}

// === CONSTANTS ===
export const categoryIcons: Record<string, React.ElementType> = {};
// Icons are imported in consumer components to avoid circular deps

export const priorityStyles = {
  imediata: { bg: 'bg-destructive/10', border: 'border-destructive/30', text: 'text-destructive', badge: 'bg-destructive text-destructive-foreground' },
  urgente: { bg: 'bg-warning/10', border: 'border-warning/30', text: 'text-warning', badge: 'bg-warning text-warning-foreground' },
  importante: { bg: 'bg-accent/10', border: 'border-accent/30', text: 'text-accent', badge: 'bg-accent text-accent-foreground' },
  preventiva: { bg: 'bg-muted/30', border: 'border-border', text: 'text-muted-foreground', badge: 'bg-muted text-muted-foreground' },
};

export const effortLabels = {
  baixo: { text: '⚡ Rápido', className: 'text-success' },
  medio: { text: '⏱ Médio', className: 'text-warning' },
  alto: { text: '🔧 Complexo', className: 'text-destructive' },
};

export interface CrisisData {
  negDate: string | null;
  negDays: number | null;
  minBal: number;
  minDate: string;
  deficit: number;
  currentBalance: number;
  totalOverdue: number;
  totalOverduePay: number;
  upcomingPayables: number;
  pendingReceivables: number;
  overdueRecCount: number;
  overduePayCount: number;
  runwayDays: number | null;
  avgDailyBurn: number;
  netBurn: number;
  next30Out: number;
  next30In: number;
  hasCrisis: boolean;
}

interface UseWarRoomOptions {
  autoFetch?: boolean;
  /** 'panel' mode only fetches when crisis detected; 'page' always fetches */
  mode?: 'panel' | 'page';
}

export function useWarRoom(options: UseWarRoomOptions = {}) {
  const { autoFetch = true, mode = 'page' } = options;
  const { filteredTransactions: transactions, filteredBalance: currentBalance, filteredProjectedBalance: projectedBalance } = useObraFilter();
  const { obras, getObraFinancials } = useObras();
  const { transactions: allTransactions, currentBalance: globalBalance, projectedBalance: globalProjected } = useFinance();
  const today = todayISO();

  const [aiData, setAiData] = useState<WarRoomData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedActions, setCompletedActions] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('war-room-completed');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const bal = globalBalance?.amount ?? 0;

  const toggleCompleted = useCallback((index: number) => {
    setCompletedActions(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      localStorage.setItem('war-room-completed', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const clearCompleted = useCallback(() => {
    setCompletedActions(new Set());
    localStorage.removeItem('war-room-completed');
  }, []);

  // === CRISIS DETECTION ===
  const crisis: CrisisData = useMemo(() => {
    const balForPanel = mode === 'panel' ? (currentBalance?.amount ?? 0) : bal;
    const projFn = mode === 'panel' ? projectedBalance : globalProjected;
    const txs = mode === 'panel' ? transactions : allTransactions;

    return detectCrisis({ today, balance: balForPanel, transactions: txs, projectedBalance: projFn });
  }, [transactions, currentBalance, projectedBalance, allTransactions, bal, globalProjected, today, mode]);

  const isProactive = !crisis.negDate && crisis.minBal >= crisis.currentBalance * 0.1;

  // === FINANCIAL SUMMARY FOR AI ===
  const financialSummary = useMemo(() => {
    const activeObras = obras.filter(o => o.status === 'ativa');
    const lines: string[] = [];

    lines.push(`Data: ${today}`);
    lines.push(`Saldo atual: ${formatCurrency(bal)}`);
    if (crisis.negDate) {
      lines.push(`CAIXA NEGATIVO PREVISTO PARA: ${formatDateFull(crisis.negDate)} (${crisis.negDays} dias)`);
      lines.push(`Déficit projetado: ${formatCurrency(crisis.deficit)}`);
    } else {
      lines.push(`Caixa sem previsão de negativo nos próximos 90 dias`);
      lines.push(`Ponto mínimo: ${formatCurrency(crisis.minBal)} em ${getDayMonth(crisis.minDate)}`);
    }
    if (crisis.runwayDays !== null) {
      lines.push(`Runway: ${crisis.runwayDays} dias`);
    }
    lines.push('');

    lines.push('=== OBRAS ATIVAS ===');
    activeObras.forEach(obra => {
      const fin = getObraFinancials(obra.id);
      lines.push(`${obra.code} (${obra.clientName}):`);
      lines.push(`  Contrato: ${formatCurrency(obra.contractValue)} | Recebido: ${formatCurrency(fin.totalReceived)} | Custos: ${formatCurrency(fin.totalPaidCost)}`);
      lines.push(`  Margem: ${fin.grossMarginPercentage.toFixed(0)}% | Saldo obra: ${formatCurrency(fin.obraNetCashFlow)}`);
      if (fin.totalOverdueReceivable > 0) lines.push(`  ⚠ Atrasado: ${formatCurrency(fin.totalOverdueReceivable)}`);
      if (fin.nextReceivable) lines.push(`  Próx entrada: ${formatCurrency(fin.nextReceivable.amount)} em ${getDayMonth(fin.nextReceivable.dueDate)} (${fin.nextReceivable.status})`);
      if (fin.nextPayable) lines.push(`  Próx saída: ${formatCurrency(fin.nextPayable.amount)} em ${getDayMonth(fin.nextPayable.dueDate)} — ${fin.nextPayable.counterpart || fin.nextPayable.category}`);

      const obraRec = allTransactions.filter(t => t.obraId === obra.id && t.type === 'receber');
      const withBilling = obraRec.filter(t => t.billingCount > 0);
      if (withBilling.length > 0) {
        lines.push(`  📧 Cobranças:`);
        withBilling.forEach(t => {
          const dl = daysBetween(today, t.dueDate);
          lines.push(`    ${formatCurrency(t.amount)} (${t.status}, ${dl > 0 ? `${dl}d` : `${Math.abs(dl)}d atraso`}): ${t.billingCount}x cobrança${t.billingSentAt ? ` (última ${getDayMonth(t.billingSentAt)})` : ''}`);
        });
      }

      const futureRec = obraRec.filter(t => t.status !== 'confirmado' && t.dueDate > today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      if (futureRec.length > 0) {
        lines.push(`  📅 Parcelas futuras:`);
        futureRec.slice(0, 5).forEach(t => {
          lines.push(`    ${formatCurrency(t.amount)} em ${getDayMonth(t.dueDate)} (${daysBetween(today, t.dueDate)}d)`);
        });
      }
    });

    lines.push('');
    lines.push('=== FLUXO SEMANAL (6 semanas) ===');
    for (let w = 0; w < 6; w++) {
      const ws = addDays(today, w * 7);
      const we = addDays(today, w * 7 + 6);
      const out = allTransactions.filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= ws && t.dueDate <= we).reduce((s, t) => s + t.amount, 0);
      const inc = allTransactions.filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= ws && t.dueDate <= we).reduce((s, t) => s + t.amount, 0);
      const projEnd = globalProjected(we);
      lines.push(`S${w + 1} (${getDayMonth(ws)}–${getDayMonth(we)}): -${formatCurrency(out)} / +${formatCurrency(inc)} | Saldo fim: ${formatCurrency(projEnd)}${projEnd < 0 ? ' ⚠ NEGATIVO' : ''}`);
    }

    const overdue = allTransactions.filter(t => t.status === 'atrasado');
    if (overdue.length > 0) {
      lines.push('');
      lines.push(`=== ATRASADOS (${overdue.length}) ===`);
      overdue.forEach(t => {
        const dl = daysBetween(t.dueDate, today);
        const oRef = t.obraId ? obras.find(o => o.id === t.obraId) : null;
        lines.push(`${t.type === 'receber' ? '📥' : '📤'} ${formatCurrency(t.amount)} — ${t.description} (${dl}d) ${t.billingCount > 0 ? `[${t.billingCount}x cobrado]` : ''} ${oRef ? `[${oRef.code}]` : ''}`);
      });
    }

    if (crisis.negDate) {
      const payablesBeforeDDay = allTransactions
        .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= crisis.negDate)
        .sort((a, b) => b.amount - a.amount);
      if (payablesBeforeDDay.length > 0) {
        lines.push('');
        lines.push(`=== SAÍDAS ATÉ D-DAY (${payablesBeforeDDay.length}, total ${formatCurrency(payablesBeforeDDay.reduce((s, t) => s + t.amount, 0))}) ===`);
        payablesBeforeDDay.slice(0, 10).forEach(t => {
          const oRef = t.obraId ? obras.find(o => o.id === t.obraId) : null;
          lines.push(`${formatCurrency(t.amount)} em ${getDayMonth(t.dueDate)} — ${t.description} (${t.priority}) ${t.counterpart ? `[${t.counterpart}]` : ''} ${oRef ? `[${oRef.code}]` : ''}`);
        });
      }
    }

    return lines.join('\n');
  }, [crisis, obras, allTransactions, bal, globalProjected, today, getObraFinancials]);

  const crisisContext = useMemo(() => buildCrisisContext(crisis), [crisis]);

  // === FETCH AI PLAN ===
  const fetchWarPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    clearCompleted();
    try {
      let marketContext: string | null = null;
      try {
        const { data: marketData } = await supabase.functions.invoke('market-data');
        if (marketData?.marketContext) marketContext = marketData.marketContext;
      } catch { /* optional */ }

      const { data: fnData, error: fnError } = await supabase.functions.invoke('war-room', {
        body: { financialSummary, crisisContext, marketContext, mode: isProactive ? 'proactive' : 'crisis' },
      });

      if (fnError) throw new Error(fnError.message);
      if (fnData?.error) throw new Error(fnData.error);
      setAiData(fnData as WarRoomData);
    } catch (e) {
      console.error('War room error:', e);
      setError(e instanceof Error ? e.message : 'Erro ao gerar plano de guerra');
    } finally {
      setLoading(false);
    }
  }, [financialSummary, crisisContext, isProactive, clearCompleted]);

  // Auto-fetch
  useEffect(() => {
    if (!autoFetch) return;
    if (mode === 'panel') {
      // Panel: only fetch when crisis detected
      if (crisis.hasCrisis && crisis.negDate && !aiData && !loading && !error) {
        fetchWarPlan();
      }
    } else {
      // Page: always fetch
      if (!aiData && !loading && !error) {
        fetchWarPlan();
      }
    }
  }, [crisis.hasCrisis, crisis.negDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-retry once
  const [retried, setRetried] = useState(false);
  useEffect(() => {
    if (error && !retried && !loading) {
      setRetried(true);
      const timer = setTimeout(() => fetchWarPlan(), 3000);
      return () => clearTimeout(timer);
    }
  }, [error, retried, loading, fetchWarPlan]);

  // === ACTION PREFILL HELPER ===
  const resolveActionPrefill = useCallback((action: WarAction) => {
    if (!action.prefill) return null;
    const p = action.prefill;
    const obraId = p.obraCode ? obras.find(o => o.code === p.obraCode)?.id : undefined;
    return {
      type: p.type || ('pagar' as TransactionType),
      description: p.description,
      counterpart: p.counterpart,
      amount: p.amount,
      category: p.category,
      notes: p.notes,
      obraId,
    };
  }, [obras]);

  return {
    crisis,
    isProactive,
    aiData,
    loading,
    error,
    completedActions,
    toggleCompleted,
    clearCompleted,
    fetchWarPlan,
    resolveActionPrefill,
    setRetried,
    today,
    allTransactions,
    obras,
    bal,
    globalProjected,
  };
}
