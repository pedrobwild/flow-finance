import { useMemo, useState, useCallback, useEffect } from 'react';
import { useObraFilter } from '@/lib/obra-filter-context';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth, daysBetween, formatDateFull } from '@/lib/helpers';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Siren, ShieldAlert, ChevronDown, ChevronUp, RefreshCw,
  Phone, Receipt, Pause, ArrowRightLeft, CalendarClock,
  TrendingDown, AlertTriangle, Landmark, HandCoins, Ban,
  Scissors, Clock, Zap, Sparkles, Plus, ExternalLink, CheckCircle2, Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import TransactionFormDialog from '@/components/TransactionFormDialog';
import type { TransactionType } from '@/lib/types';

interface WarAction {
  priority: 'imediata' | 'urgente' | 'importante' | 'preventiva';
  category: 'cobranca' | 'antecipacao' | 'renegociacao' | 'corte' | 'credito' | 'cronograma';
  title: string;
  description: string;
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

interface WarRoomData {
  summary: string;
  totalRecoverable: number;
  coveragePercentage: number;
  actions: WarAction[];
}

const categoryIcons: Record<string, React.ElementType> = {
  cobranca: Phone,
  antecipacao: HandCoins,
  renegociacao: ArrowRightLeft,
  corte: Scissors,
  credito: Landmark,
  cronograma: CalendarClock,
};

const priorityStyles = {
  imediata: { bg: 'bg-destructive/10', border: 'border-destructive/30', text: 'text-destructive', badge: 'bg-destructive text-destructive-foreground' },
  urgente: { bg: 'bg-warning/10', border: 'border-warning/30', text: 'text-warning', badge: 'bg-warning text-warning-foreground' },
  importante: { bg: 'bg-accent/10', border: 'border-accent/30', text: 'text-accent', badge: 'bg-accent text-accent-foreground' },
  preventiva: { bg: 'bg-muted/30', border: 'border-border', text: 'text-muted-foreground', badge: 'bg-muted text-muted-foreground' },
};

const effortLabels = {
  baixo: { text: '⚡ Rápido', className: 'text-success' },
  medio: { text: '⏱ Médio', className: 'text-warning' },
  alto: { text: '🔧 Complexo', className: 'text-destructive' },
};

export default function WarRoomPanel() {
  const { filteredTransactions: transactions, filteredBalance: currentBalance, filteredProjectedBalance: projectedBalance } = useObraFilter();
  const { obras, getObraFinancials } = useObras();
  const { transactions: allTransactions, currentBalance: globalBalance, projectedBalance: globalProjected } = useFinance();
  const today = todayISO();

  const [expanded, setExpanded] = useState(true);
  const [aiData, setAiData] = useState<WarRoomData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedActions, setCompletedActions] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('war-room-completed');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txFormDefaults, setTxFormDefaults] = useState<{
    type: TransactionType; description?: string; counterpart?: string;
    amount?: number; category?: string; notes?: string; obraId?: string;
  } | null>(null);

  const toggleCompleted = (index: number) => {
    setCompletedActions(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      localStorage.setItem('war-room-completed', JSON.stringify([...next]));
      return next;
    });
  };

  // Reset completed when new AI data loads
  const clearCompleted = useCallback(() => {
    setCompletedActions(new Set());
    localStorage.removeItem('war-room-completed');
  }, []);

  // Crisis detection
  const crisis = useMemo(() => {
    const bal = currentBalance?.amount ?? 0;
    let negDate: string | null = null;
    let negDays: number | null = null;
    let minBal = bal;
    let minDate = today;

    for (let i = 0; i <= 90; i++) {
      const date = addDays(today, i);
      const projected = projectedBalance(date);
      if (projected < minBal) { minBal = projected; minDate = date; }
      if (projected < 0 && negDate === null) { negDate = date; negDays = i; }
    }

    if (negDate === null) return null;

    const deficit = Math.abs(minBal);
    const overdueRec = transactions.filter(t => t.type === 'receber' && t.status === 'atrasado');
    const totalOverdue = overdueRec.reduce((s, t) => s + t.amount, 0);
    const upcomingPayables = transactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= negDate!)
      .reduce((s, t) => s + t.amount, 0);
    const pendingReceivables = transactions
      .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= negDate!)
      .reduce((s, t) => s + t.amount, 0);

    return { negDate, negDays: negDays!, minBal, minDate, deficit, currentBalance: bal, totalOverdue, upcomingPayables, pendingReceivables };
  }, [transactions, currentBalance, projectedBalance, today]);

  // Build financial summary for AI (reuses MorningBriefing pattern)
  const financialSummary = useMemo(() => {
    if (!crisis) return '';
    const bal = globalBalance?.amount ?? 0;
    const activeObras = obras.filter(o => o.status === 'ativa');
    const lines: string[] = [];

    lines.push(`Data: ${today}`);
    lines.push(`Saldo atual: ${formatCurrency(bal)}`);
    lines.push(`CAIXA NEGATIVO PREVISTO PARA: ${formatDateFull(crisis.negDate)} (${crisis.negDays} dias)`);
    lines.push(`Déficit projetado: ${formatCurrency(crisis.deficit)}`);
    lines.push(`Ponto mínimo: ${formatCurrency(crisis.minBal)} em ${getDayMonth(crisis.minDate)}`);
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

      // Billing history
      const obraRec = allTransactions.filter(t => t.obraId === obra.id && t.type === 'receber');
      const withBilling = obraRec.filter(t => t.billingCount > 0);
      if (withBilling.length > 0) {
        lines.push(`  📧 Cobranças:`);
        withBilling.forEach(t => {
          const dl = daysBetween(today, t.dueDate);
          lines.push(`    ${formatCurrency(t.amount)} (${t.status}, ${dl > 0 ? `${dl}d` : `${Math.abs(dl)}d atraso`}): ${t.billingCount}x cobrança${t.billingSentAt ? ` (última ${getDayMonth(t.billingSentAt)})` : ''}`);
        });
      }

      // Future receivables
      const futureRec = obraRec.filter(t => t.status !== 'confirmado' && t.dueDate > today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      if (futureRec.length > 0) {
        lines.push(`  📅 Parcelas futuras:`);
        futureRec.slice(0, 5).forEach(t => {
          lines.push(`    ${formatCurrency(t.amount)} em ${getDayMonth(t.dueDate)} (${daysBetween(today, t.dueDate)}d)`);
        });
      }
    });

    // Weekly flow
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

    // Overdue details
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

    // Payables before D-Day
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

    return lines.join('\n');
  }, [crisis, obras, allTransactions, globalBalance, globalProjected, today, getObraFinancials]);

  const crisisContext = useMemo(() => {
    if (!crisis) return '';
    return `O caixa da empresa ficará NEGATIVO em ${crisis.negDays} dias (${formatDateFull(crisis.negDate)}).
Déficit projetado: ${formatCurrency(crisis.deficit)}.
Saldo atual: ${formatCurrency(crisis.currentBalance)}.
Recebíveis atrasados: ${formatCurrency(crisis.totalOverdue)}.
Saídas pendentes até D-Day: ${formatCurrency(crisis.upcomingPayables)}.
Entradas previstas até D-Day: ${formatCurrency(crisis.pendingReceivables)}.`;
  }, [crisis]);

  const fetchWarPlan = useCallback(async () => {
    if (!crisis) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch market data in parallel (non-blocking)
      let marketContext: string | null = null;
      try {
        const { data: marketData } = await supabase.functions.invoke('market-data');
        if (marketData?.marketContext) marketContext = marketData.marketContext;
      } catch { /* market data optional */ }

      const { data: fnData, error: fnError } = await supabase.functions.invoke('war-room', {
        body: { financialSummary, crisisContext, marketContext },
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
  }, [financialSummary, crisisContext, crisis]);

  // Auto-fetch when crisis detected
  useEffect(() => {
    if (crisis && !aiData && !loading && !error) {
      fetchWarPlan();
    }
  }, [crisis]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-retry once
  const [retried, setRetried] = useState(false);
  useEffect(() => {
    if (error && !retried && !loading) {
      setRetried(true);
      const timer = setTimeout(() => fetchWarPlan(), 3000);
      return () => clearTimeout(timer);
    }
  }, [error, retried, loading, fetchWarPlan]);

  const handleActionPrefill = (action: WarAction) => {
    if (!action.prefill) return;
    const p = action.prefill;
    const obraId = p.obraCode ? obras.find(o => o.code === p.obraCode)?.id : undefined;
    setTxFormDefaults({
      type: p.type || 'pagar',
      description: p.description,
      counterpart: p.counterpart,
      amount: p.amount,
      category: p.category,
      notes: p.notes,
      obraId,
    });
    setTxFormOpen(true);
  };

  // Don't render if no crisis
  if (!crisis) return null;

  const countdown = crisis.negDays;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden rounded-xl border-2 border-destructive/40 shadow-[0_0_30px_-5px_hsl(var(--destructive)/0.2)]"
      >
        {/* Pulsing border */}
        <div className="absolute inset-0 rounded-xl border-2 border-destructive/20 animate-pulse pointer-events-none" />

        {/* HEADER */}
        <button onClick={() => setExpanded(e => !e)} className="w-full bg-destructive/5 hover:bg-destructive/8 transition-colors">
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-destructive/15 flex items-center justify-center">
                <Siren className="w-6 h-6 text-destructive animate-pulse" />
              </div>
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-destructive-foreground" />
              </div>
            </div>

            <div className="flex-1 text-left">
              <h2 className="text-sm font-bold tracking-tight text-destructive">
                COMANDO DE GUERRA — CAIXA NEGATIVO PREVISTO
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-bold text-destructive">{formatDateFull(crisis.negDate)}</span>
                {' '}({countdown}d) · Déficit: <span className="font-bold text-destructive">{formatCurrency(crisis.deficit)}</span>
                {aiData && !loading && (
                  <span className="ml-2 text-accent">· {aiData.actions.length} ações recomendadas pela IA</span>
                )}
                {loading && <span className="ml-2 text-muted-foreground animate-pulse">· IA analisando...</span>}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button
                size="sm" variant="ghost"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); setRetried(false); fetchWarPlan(); }}
                disabled={loading}
              >
                <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              </Button>
              <div className="text-center px-4 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className={cn(
                  'text-3xl font-bold font-mono leading-none',
                  countdown <= 7 ? 'text-destructive animate-pulse' : countdown <= 14 ? 'text-destructive' : 'text-warning'
                )}>
                  {countdown}
                </p>
                <p className="text-[8px] text-muted-foreground uppercase tracking-widest mt-1">dias</p>
              </div>
              {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1 w-full bg-muted/30">
            <motion.div
              className="h-full bg-gradient-to-r from-warning via-destructive to-destructive"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(5, 100 - (countdown / 90) * 100)}%` }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
            />
          </div>
        </button>

        {/* BODY */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="px-5 py-4 space-y-4 bg-background">
                {/* Situation summary */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Saldo Atual', value: formatCurrency(crisis.currentBalance), color: 'text-foreground' },
                    { label: 'Saídas até D-Day', value: formatCurrency(crisis.upcomingPayables), color: 'text-destructive' },
                    { label: 'Entradas Previstas', value: formatCurrency(crisis.pendingReceivables), color: 'text-success' },
                  ].map(m => (
                    <div key={m.label} className="text-center p-3 rounded-lg bg-muted/30 border border-border/40">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                      <p className={cn('text-sm font-bold font-mono mt-1', m.color)}>{m.value}</p>
                    </div>
                  ))}
                </div>

                {/* GAP indicator */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/15">
                  <TrendingDown className="w-5 h-5 text-destructive flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-destructive">
                      GAP de {formatCurrency(crisis.deficit)} precisa ser coberto
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Ponto mais crítico: {formatCurrency(crisis.minBal)} em {getDayMonth(crisis.minDate)}
                    </p>
                  </div>
                  {aiData && (
                    <div className="text-right">
                      <p className="text-[9px] text-muted-foreground uppercase">Cobertura IA</p>
                      <p className={cn('text-sm font-bold font-mono', aiData.coveragePercentage >= 100 ? 'text-success' : 'text-warning')}>
                        {aiData.coveragePercentage.toFixed(0)}%
                      </p>
                    </div>
                  )}
                </div>

                {/* AI Coverage bar */}
                {aiData && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Potencial de recuperação: {formatCurrency(aiData.totalRecoverable)}</span>
                      <span className={cn('font-semibold', aiData.coveragePercentage >= 100 ? 'text-success' : 'text-warning')}>
                        {aiData.coveragePercentage.toFixed(0)}% do gap
                      </span>
                    </div>
                    <Progress
                      value={Math.min(100, aiData.coveragePercentage)}
                      className="h-2"
                    />
                  </div>
                )}

                {/* AI Summary */}
                {aiData?.summary && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-accent/5 border border-accent/15">
                    <Sparkles className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed text-foreground">{aiData.summary}</p>
                  </div>
                )}

                {/* Loading state */}
                {loading && (
                  <div className="space-y-3 py-2">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-accent animate-pulse" />
                      <span className="text-xs text-muted-foreground animate-pulse">
                        IA analisando dados financeiros, cobranças e mercado...
                      </span>
                    </div>
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="flex gap-3 items-start p-3 rounded-lg bg-muted/20 border border-border/30">
                        <div className="w-8 h-8 rounded-lg bg-muted animate-pulse" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 bg-muted rounded animate-pulse" style={{ width: `${60 + i * 8}%` }} />
                          <div className="h-3 bg-muted rounded animate-pulse" style={{ width: `${40 + i * 10}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Error state */}
                {error && !loading && (
                  <div className="text-center py-4">
                    <AlertTriangle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground mb-3">{error}</p>
                    <Button size="sm" variant="outline" onClick={() => { setRetried(false); fetchWarPlan(); }} className="text-xs h-7">
                      Tentar novamente
                    </Button>
                  </div>
                )}

                {/* AI Action Items */}
                {aiData && !loading && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldAlert className="w-4 h-4 text-foreground" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Plano de Ação IA ({aiData.actions.length} recomendações)
                      </h3>
                      <div className="flex-1" />
                      {completedActions.size > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-success">
                            {completedActions.size}/{aiData.actions.length} concluídas
                          </span>
                          <Progress
                            value={(completedActions.size / aiData.actions.length) * 100}
                            className="h-1.5 w-20"
                          />
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      {aiData.actions.map((action, i) => {
                        const styles = priorityStyles[action.priority] || priorityStyles.importante;
                        const Icon = categoryIcons[action.category] || Zap;
                        const effort = effortLabels[action.effort] || effortLabels.medio;
                        const hasPrefill = !!action.prefill;
                        const isDone = completedActions.has(i);

                        return (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: isDone ? 0.5 : 1, x: 0 }}
                            transition={{ delay: i * 0.06, duration: 0.3 }}
                            className={cn(
                              'flex items-start gap-3 p-3 rounded-lg border transition-all',
                              isDone ? 'bg-muted/20 border-border/30' : cn(styles.bg, styles.border),
                            )}
                          >
                            {/* Complete toggle */}
                            <button
                              onClick={() => toggleCompleted(i)}
                              className="mt-1 flex-shrink-0 transition-colors"
                              title={isDone ? 'Desmarcar' : 'Marcar como concluída'}
                            >
                              {isDone ? (
                                <CheckCircle2 className="w-5 h-5 text-success" />
                              ) : (
                                <Circle className={cn('w-5 h-5', styles.text, 'opacity-40 hover:opacity-100')} />
                              )}
                            </button>

                            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', isDone ? 'bg-muted/30' : styles.bg)}>
                              <Icon className={cn('w-4 h-4', isDone ? 'text-muted-foreground' : styles.text)} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <span className={cn('text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded', isDone ? 'bg-muted text-muted-foreground line-through' : styles.badge)}>
                                  {action.priority}
                                </span>
                                <span className={cn('text-xs font-semibold', isDone ? 'text-muted-foreground line-through' : 'text-foreground')}>{action.title}</span>
                                <span className={cn('text-[9px]', isDone ? 'text-muted-foreground' : effort.className)}>{effort.text}</span>
                              </div>
                              <p className={cn('text-[10px] leading-relaxed mt-1', isDone ? 'text-muted-foreground/60' : 'text-muted-foreground')}>{action.description}</p>
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className={cn('text-[10px] font-bold', isDone ? 'text-muted-foreground line-through' : action.impactAmount > 0 ? 'text-success' : 'text-destructive')}>
                                  ⚡ {action.impactLabel}
                                </span>
                                <span className="text-[9px] text-muted-foreground">
                                  <Clock className="w-3 h-3 inline mr-0.5" />{action.deadline}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1.5 flex-shrink-0">
                              {hasPrefill && !isDone && (
                                <Button
                                  size="sm" variant="default"
                                  className="text-[10px] h-7 gap-1"
                                  onClick={() => handleActionPrefill(action)}
                                >
                                  <Plus className="w-3 h-3" /> Criar
                                </Button>
                              )}
                              {!isDone && (
                                <Link to={action.linkTo}>
                                  <Button variant="outline" size="sm" className="text-[10px] h-7 gap-1 w-full">
                                    <ExternalLink className="w-3 h-3" /> Ver
                                  </Button>
                                </Link>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/20 border border-border/30">
                  <Sparkles className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Plano gerado pela IA com base em dados financeiros em tempo real, histórico de cobranças e indicadores macro.
                    Atualiza automaticamente conforme transações são confirmadas.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Transaction form from AI suggestions */}
      {txFormDefaults && (
        <TransactionFormDialog
          open={txFormOpen}
          onClose={() => { setTxFormOpen(false); setTxFormDefaults(null); }}
          transaction={null}
          defaultType={txFormDefaults.type}
          defaultObraId={txFormDefaults.obraId}
          prefill={{
            description: txFormDefaults.description,
            counterpart: txFormDefaults.counterpart,
            amount: txFormDefaults.amount,
            category: txFormDefaults.category,
            notes: txFormDefaults.notes,
          }}
        />
      )}
    </>
  );
}
