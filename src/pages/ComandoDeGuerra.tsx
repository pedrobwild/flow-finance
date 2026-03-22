import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts';
import { useFinance } from '@/lib/finance-context';
import { useObras } from '@/lib/obras-context';
import { useObraFilter } from '@/lib/obra-filter-context';
import { formatCurrency, todayISO, addDays, daysBetween, getDayMonth, formatDateFull } from '@/lib/helpers';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import TransactionFormDialog from '@/components/TransactionFormDialog';
import type { Transaction, TransactionType } from '@/lib/types';
import {
  Siren, CheckCircle2, Circle, Phone, MessageSquare, Copy,
  AlertTriangle, TrendingDown, ArrowRight, ShieldAlert, Clock,
  Sparkles, Loader2, FileText, BookOpen, Plus, ExternalLink,
  RefreshCw, Zap, CalendarClock, HandCoins, ArrowLeftRight,
  Scissors, Landmark, ChevronDown, ChevronUp, Shield, Flame,
} from 'lucide-react';

// === TYPES ===
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

interface NegotiationScript {
  supplierProfile: string;
  recommendedApproach: string;
  scenarios: Array<{
    name: string;
    description: string;
    proposedAmount: number;
    proposedDate: string;
    savings: number;
    script: string;
    whatsappMessage: string;
  }>;
  objections: Array<{ objection: string; response: string }>;
  tips: string[];
}

const categoryIcons: Record<string, React.ElementType> = {
  cobranca: Phone,
  antecipacao: HandCoins,
  renegociacao: ArrowLeftRight,
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

export default function ComandoDeGuerra() {
  const { transactions: allTransactions, currentBalance: globalBalance, projectedBalance: globalProjected, confirmTransaction } = useFinance();
  const { filteredTransactions: transactions, filteredBalance: currentBalance, filteredProjectedBalance: projectedBalance } = useObraFilter();
  const { obras, getObraFinancials } = useObras();
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

  // Negotiation script
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [negotiationScript, setNegotiationScript] = useState<NegotiationScript | null>(null);
  const [loadingScript, setLoadingScript] = useState(false);
  const [showNegotiation, setShowNegotiation] = useState(false);

  // Transaction form
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txFormDefaults, setTxFormDefaults] = useState<{
    type: TransactionType; description?: string; counterpart?: string;
    amount?: number; category?: string; notes?: string; obraId?: string;
  } | null>(null);

  const bal = globalBalance?.amount ?? 0;

  const toggleCompleted = (index: number) => {
    setCompletedActions(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      localStorage.setItem('war-room-completed', JSON.stringify([...next]));
      return next;
    });
  };

  // === CRISIS DETECTION ===
  const crisis = useMemo(() => {
    let negDate: string | null = null;
    let negDays: number | null = null;
    let minBal = bal;
    let minDate = today;

    for (let i = 0; i <= 90; i++) {
      const date = addDays(today, i);
      const projected = globalProjected(date);
      if (projected < minBal) { minBal = projected; minDate = date; }
      if (projected < 0 && negDate === null) { negDate = date; negDays = i; }
    }

    const deficit = minBal < 0 ? Math.abs(minBal) : 0;
    const overdueRec = allTransactions.filter(t => t.type === 'receber' && t.status === 'atrasado');
    const totalOverdue = overdueRec.reduce((s, t) => s + t.amount, 0);
    const overduePayables = allTransactions.filter(t => t.type === 'pagar' && t.status === 'atrasado');
    const totalOverduePay = overduePayables.reduce((s, t) => s + t.amount, 0);

    const upcomingPayables = allTransactions
      .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && (negDate ? t.dueDate <= negDate : t.dueDate <= addDays(today, 30)))
      .reduce((s, t) => s + t.amount, 0);
    const pendingReceivables = allTransactions
      .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today && (negDate ? t.dueDate <= negDate : t.dueDate <= addDays(today, 30)))
      .reduce((s, t) => s + t.amount, 0);

    // Runway
    const next30Out = allTransactions.filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= addDays(today, 30)).reduce((s, t) => s + t.amount, 0);
    const next30In = allTransactions.filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= today && t.dueDate <= addDays(today, 30)).reduce((s, t) => s + t.amount, 0);
    const netBurn = next30Out - next30In;
    const avgDaily = netBurn / 30;
    const runwayDays = avgDaily > 0 && bal > 0 ? Math.floor(bal / avgDaily) : null;

    return {
      negDate, negDays, minBal, minDate, deficit, currentBalance: bal,
      totalOverdue, totalOverduePay, upcomingPayables, pendingReceivables,
      overdueRecCount: overdueRec.length, overduePayCount: overduePayables.length,
      runwayDays, avgDailyBurn: avgDaily, netBurn, next30Out, next30In,
      hasCrisis: negDate !== null || minBal < bal * 0.1,
    };
  }, [allTransactions, bal, globalProjected, today]);

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
    lines.push(`Runway: ${crisis.runwayDays !== null ? `${crisis.runwayDays} dias` : 'Entradas superam saídas'}`);
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

  const isProactive = !crisis.negDate && crisis.minBal >= bal * 0.1;

  const crisisContext = useMemo(() => {
    if (crisis.negDate) {
      return `O caixa da empresa ficará NEGATIVO em ${crisis.negDays} dias (${formatDateFull(crisis.negDate)}).
Déficit projetado: ${formatCurrency(crisis.deficit)}.
Saldo atual: ${formatCurrency(crisis.currentBalance)}.
Recebíveis atrasados: ${formatCurrency(crisis.totalOverdue)} (${crisis.overdueRecCount} transações).
Pagáveis atrasados: ${formatCurrency(crisis.totalOverduePay)} (${crisis.overduePayCount} transações).
Saídas pendentes até D-Day: ${formatCurrency(crisis.upcomingPayables)}.
Entradas previstas até D-Day: ${formatCurrency(crisis.pendingReceivables)}.
Runway estimado: ${crisis.runwayDays ?? '∞'} dias.`;
    }
    return `O caixa NÃO ficará negativo nos próximos 90 dias.
Saldo atual: ${formatCurrency(crisis.currentBalance)}.
Ponto mais apertado: ${formatCurrency(crisis.minBal)} em ${getDayMonth(crisis.minDate)}.
Recebíveis atrasados: ${formatCurrency(crisis.totalOverdue)} (${crisis.overdueRecCount} transações).
Pagáveis atrasados: ${formatCurrency(crisis.totalOverduePay)} (${crisis.overduePayCount} transações).
Runway estimado: ${crisis.runwayDays ?? '∞'} dias.
Queima líquida 30d: ${formatCurrency(crisis.netBurn)}.
Saídas próximos 30d: ${formatCurrency(crisis.next30Out)}.
Entradas próximos 30d: ${formatCurrency(crisis.next30In)}.
O CEO quer saber o que pode fazer para MELHORAR a situação, OTIMIZAR prazos e PROTEGER o caixa.`;
  }, [crisis]);

  // === FETCH AI PLAN ===
  const fetchWarPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCompletedActions(new Set());
    localStorage.removeItem('war-room-completed');
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
      setError(e instanceof Error ? e.message : 'Erro ao gerar plano');
    } finally {
      setLoading(false);
    }
  }, [financialSummary, crisisContext, isProactive]);

  // Auto-fetch on mount
  useEffect(() => {
    if (!aiData && !loading && !error) fetchWarPlan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-retry once
  const [retried, setRetried] = useState(false);
  useEffect(() => {
    if (error && !retried && !loading) {
      setRetried(true);
      const timer = setTimeout(() => fetchWarPlan(), 3000);
      return () => clearTimeout(timer);
    }
  }, [error, retried, loading, fetchWarPlan]);

  // === NEGOTIATION SCRIPT ===
  const generateScript = useCallback(async (tx: Transaction) => {
    setSelectedTx(tx);
    setShowNegotiation(true);
    setLoadingScript(true);
    setNegotiationScript(null);
    try {
      const { data, error } = await supabase.functions.invoke('negotiation-script', {
        body: {
          counterpart: tx.counterpart,
          amount: tx.amount,
          dueDate: tx.dueDate,
          daysOverdue: tx.status === 'atrasado' ? daysBetween(tx.dueDate, today) : 0,
          category: tx.category,
          companyContext: `Saldo atual: R$ ${bal.toFixed(2)}. Empresa de reformas de alto padrão.`,
        },
      });
      if (error) throw error;
      setNegotiationScript(data as NegotiationScript);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao gerar script de negociação');
    } finally {
      setLoadingScript(false);
    }
  }, [today, bal]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

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

  // Projection chart data
  const projectionData = useMemo(() => {
    const points: Array<{ day: number; label: string; saldo: number }> = [];
    const horizon = 60;
    for (let d = 0; d <= horizon; d++) {
      const date = addDays(today, d);
      points.push({
        day: d,
        label: d === 0 ? 'Hoje' : getDayMonth(date),
        saldo: globalProjected(date),
      });
    }
    return points;
  }, [globalProjected, today]);

  const severity = crisis.negDate && crisis.negDays !== null && crisis.negDays <= 7
    ? 'critical'
    : crisis.negDate && crisis.negDays !== null && crisis.negDays <= 14
      ? 'warning'
      : crisis.negDate
        ? 'caution'
        : 'monitoring';

  const severityConfig = {
    critical: { bg: 'bg-destructive/10', border: 'border-destructive/40', color: 'text-destructive' },
    warning: { bg: 'bg-warning/10', border: 'border-warning/40', color: 'text-warning' },
    caution: { bg: 'bg-accent/10', border: 'border-accent/40', color: 'text-accent' },
    monitoring: { bg: 'bg-muted/20', border: 'border-border', color: 'text-foreground' },
  };

  const sConfig = severityConfig[severity];

  return (
    <div className="space-y-6 pb-8">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            {isProactive ? (
              <Shield className={cn('w-5 h-5', 'text-success')} />
            ) : (
              <Siren className={cn('w-5 h-5', sConfig.color)} />
            )}
            <h1 className="text-lg font-bold tracking-tight">
              {isProactive ? 'Comando Estratégico' : 'Comando de Guerra'}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isProactive
              ? 'Caixa saudável — oportunidades de otimização e proteção identificadas pela IA'
              : 'Análise completa da IA — tudo que você pode fazer para proteger o caixa'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm" className="text-xs gap-1.5"
            onClick={() => { setRetried(false); fetchWarPlan(); }}
            disabled={loading}
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Atualizar análise
          </Button>
          <Link to="/">
            <Button variant="outline" size="sm" className="text-xs">← Dashboard</Button>
          </Link>
        </div>
      </div>

      {/* === STATUS BANNER === */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn('rounded-xl border-2 p-5', sConfig.bg, sConfig.border)}
      >
        <div className="flex-1 min-w-0">
          {/* Metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Saldo Atual', value: formatCurrency(bal), color: bal >= 0 ? 'text-success' : 'text-destructive' },
              { label: 'Runway', value: crisis.runwayDays !== null ? `${crisis.runwayDays} dias` : '∞', color: crisis.runwayDays !== null && crisis.runwayDays <= 14 ? 'text-destructive' : 'text-foreground' },
              { label: 'Queima/dia', value: crisis.avgDailyBurn > 0 ? formatCurrency(crisis.avgDailyBurn) : '—', color: 'text-destructive' },
              { label: 'Recebíveis Atrasados', value: `${formatCurrency(crisis.totalOverdue)} (${crisis.overdueRecCount})`, color: crisis.overdueRecCount > 0 ? 'text-warning' : 'text-muted-foreground' },
              { label: 'Saídas 30d', value: formatCurrency(crisis.next30Out), color: 'text-destructive' },
              { label: 'Entradas 30d', value: formatCurrency(crisis.next30In), color: 'text-success' },
            ].map(m => (
              <div key={m.label} className="bg-background/60 rounded-lg p-2.5 border border-border/40">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                <p className={cn('text-sm font-bold font-mono mt-0.5', m.color)}>{m.value}</p>
              </div>
            ))}
          </div>

          {crisis.negDate && crisis.negDays !== null && (
            <div className="mt-3 flex items-center gap-3 p-2.5 rounded-lg bg-destructive/5 border border-destructive/15">
              <Flame className="w-4 h-4 text-destructive flex-shrink-0" />
              <div className="flex-1">
                <span className="text-xs font-semibold text-destructive">
                  Caixa negativo em {crisis.negDays}d — {formatDateFull(crisis.negDate)}
                </span>
                <span className="text-[10px] text-muted-foreground ml-2">
                  Déficit: {formatCurrency(crisis.deficit)} · Pior ponto: {formatCurrency(crisis.minBal)} em {getDayMonth(crisis.minDate)}
                </span>
              </div>
              {aiData && (
                <div className="text-right flex-shrink-0">
                  <span className={cn('text-sm font-bold font-mono', aiData.coveragePercentage >= 100 ? 'text-success' : 'text-warning')}>
                    {aiData.coveragePercentage.toFixed(0)}%
                  </span>
                  <p className="text-[8px] text-muted-foreground">cobertura</p>
                </div>
              )}
            </div>
          )}

          {!crisis.negDate && crisis.minBal < bal * 0.3 && (
            <div className="mt-3 flex items-center gap-3 p-2.5 rounded-lg bg-warning/5 border border-warning/15">
              <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
              <span className="text-xs text-muted-foreground">
                Ponto mais apertado: <span className="font-semibold text-foreground">{formatCurrency(crisis.minBal)}</span> em {getDayMonth(crisis.minDate)} — margem baixa
              </span>
            </div>
          )}
        </div>
      </motion.div>

      {/* === PROJECTION CHART === */}
      <Card className="card-elevated">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Projeção de Caixa — 60 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projectionData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false} tickLine={false}
                  interval={9}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0];
                    return (
                      <div className="bg-card border rounded-lg p-2 shadow-xl text-xs">
                        <p className="font-semibold">{p.payload.label}</p>
                        <p className={cn('font-mono font-bold', p.value < 0 ? 'text-destructive' : 'text-success')}>
                          {formatCurrency(p.value)}
                        </p>
                      </div>
                    );
                  }}
                />
                <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeWidth={1.5} strokeOpacity={0.4} />
                <defs>
                  <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone" dataKey="saldo"
                  stroke="hsl(var(--primary))" strokeWidth={2}
                  fill="url(#saldoGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* === AI SUMMARY === */}
      {aiData?.summary && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 rounded-xl bg-accent/5 border border-accent/15"
        >
          <Sparkles className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-accent mb-1">Análise da IA</p>
            <p className="text-sm leading-relaxed text-foreground">{aiData.summary}</p>
          </div>
        </motion.div>
      )}

      {/* === COVERAGE BAR === */}
      {aiData && !loading && (crisis.deficit > 0 || isProactive) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {isProactive ? (
                <>Ganho potencial: <span className="font-semibold text-foreground">{formatCurrency(aiData.totalRecoverable)}</span></>
              ) : (
                <>Potencial de recuperação: <span className="font-semibold text-foreground">{formatCurrency(aiData.totalRecoverable)}</span></>
              )}
            </span>
            {!isProactive && (
              <span className={cn('font-bold', aiData.coveragePercentage >= 100 ? 'text-success' : 'text-warning')}>
                {aiData.coveragePercentage.toFixed(0)}% do gap
              </span>
            )}
          </div>
          {!isProactive && <Progress value={Math.min(100, aiData.coveragePercentage)} className="h-2.5" />}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{completedActions.size}/{aiData.actions.length} ações concluídas</span>
            <span>
              {completedActions.size > 0 && (
                <span className="text-success font-medium">
                  {((completedActions.size / aiData.actions.length) * 100).toFixed(0)}% executado
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      {/* === LOADING STATE === */}
      {loading && (
        <Card className="card-elevated">
          <CardContent className="p-8">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground animate-pulse">
                IA analisando dados financeiros, cobranças, obras e mercado...
              </p>
              <p className="text-[10px] text-muted-foreground">Isso pode levar alguns segundos</p>
            </div>
            <div className="mt-6 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex gap-3 items-start p-3 rounded-lg bg-muted/20 border border-border/30">
                  <div className="w-8 h-8 rounded-lg bg-muted animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-muted rounded animate-pulse" style={{ width: `${60 + i * 7}%` }} />
                    <div className="h-3 bg-muted rounded animate-pulse" style={{ width: `${40 + i * 10}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* === ERROR STATE === */}
      {error && !loading && (
        <Card className="card-elevated">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button size="sm" onClick={() => { setRetried(false); fetchWarPlan(); }} className="text-xs">
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* === ACTION PLAN === */}
      {aiData && !loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {isProactive ? (
              <Sparkles className="w-4 h-4 text-accent" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-foreground" />
            )}
            <h2 className="text-sm font-bold uppercase tracking-wider">
              {isProactive
                ? `Oportunidades — ${aiData.actions.length} Sugestões Proativas`
                : `Plano de Ação — ${aiData.actions.length} Recomendações`}
            </h2>
          </div>

          {aiData.actions.map((action, i) => {
            const styles = priorityStyles[action.priority] || priorityStyles.importante;
            const Icon = categoryIcons[action.category] || Zap;
            const effort = effortLabels[action.effort] || effortLabels.medio;
            const hasPrefill = !!action.prefill;
            const isDone = completedActions.has(i);

            // Find matching transaction for negotiation
            const matchingTx = action.category === 'cobranca' || action.category === 'renegociacao'
              ? allTransactions.find(t =>
                  (action.prefill?.counterpart && t.counterpart?.toLowerCase().includes(action.prefill.counterpart.toLowerCase())) ||
                  (action.prefill?.amount && t.amount === action.prefill.amount)
                )
              : null;

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: isDone ? 0.5 : 1, x: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className={cn(
                  'rounded-xl border-2 transition-all overflow-hidden',
                  isDone ? 'bg-muted/10 border-border/30' : cn(styles.bg, styles.border),
                )}
              >
                <div className="flex items-start gap-3 p-4">
                  {/* Complete toggle */}
                  <button
                    onClick={() => toggleCompleted(i)}
                    className="mt-1 flex-shrink-0 transition-colors"
                    title={isDone ? 'Desmarcar' : 'Marcar como concluída'}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-6 h-6 text-success" />
                    ) : (
                      <Circle className={cn('w-6 h-6', styles.text, 'opacity-40 hover:opacity-100')} />
                    )}
                  </button>

                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', isDone ? 'bg-muted/30' : styles.bg)}>
                    <Icon className={cn('w-5 h-5', isDone ? 'text-muted-foreground' : styles.text)} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={cn('text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full', isDone ? 'bg-muted text-muted-foreground line-through' : styles.badge)}>
                        {action.priority}
                      </span>
                      <span className={cn('text-sm font-bold', isDone ? 'text-muted-foreground line-through' : 'text-foreground')}>
                        {action.title}
                      </span>
                    </div>

                    <p className={cn('text-xs leading-relaxed mt-1', isDone ? 'text-muted-foreground/60' : 'text-muted-foreground')}>
                      {action.description}
                    </p>

                    <div className="flex items-center gap-4 mt-2 flex-wrap">
                      <span className={cn('text-xs font-bold', isDone ? 'text-muted-foreground line-through' : action.impactAmount > 0 ? 'text-success' : 'text-destructive')}>
                        ⚡ {action.impactLabel}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />{action.deadline}
                      </span>
                      <span className={cn('text-[10px]', isDone ? 'text-muted-foreground' : effort.className)}>
                        {effort.text}
                      </span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  {!isDone && (
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      {hasPrefill && (
                        <Button
                          size="sm" className="text-[10px] h-7 gap-1"
                          onClick={() => handleActionPrefill(action)}
                        >
                          <Plus className="w-3 h-3" /> Criar
                        </Button>
                      )}
                      {matchingTx && (action.category === 'renegociacao') && (
                        <Button
                          size="sm" variant="outline"
                          className="text-[10px] h-7 gap-1"
                          onClick={() => generateScript(matchingTx)}
                        >
                          <Phone className="w-3 h-3" /> Script
                        </Button>
                      )}
                      <Link to={action.linkTo}>
                        <Button variant="outline" size="sm" className="text-[10px] h-7 gap-1 w-full">
                          <ExternalLink className="w-3 h-3" /> Ver
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* === NEGOTIATION SCRIPT DRAWER === */}
      <AnimatePresence>
        {showNegotiation && selectedTx && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <Card className="card-elevated border-primary/30">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Phone className="w-4 h-4 text-primary" />
                    Script de Negociação — {selectedTx.counterpart || selectedTx.description}
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowNegotiation(false)} className="h-7 text-xs">
                    Fechar
                  </Button>
                </div>
                <CardDescription className="text-xs">
                  {selectedTx.category} · {formatCurrency(selectedTx.amount)} · Vence {getDayMonth(selectedTx.dueDate)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingScript && (
                  <div className="py-8 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Gerando scripts personalizados...</p>
                  </div>
                )}

                {negotiationScript && !loadingScript && (
                  <>
                    <div className="bg-muted/30 rounded-lg p-3 border">
                      <p className="text-xs font-medium mb-1">Perfil do fornecedor</p>
                      <p className="text-xs text-muted-foreground">{negotiationScript.supplierProfile}</p>
                      <Badge variant="outline" className="mt-2 text-[10px]">
                        {negotiationScript.recommendedApproach}
                      </Badge>
                    </div>

                    {negotiationScript.scenarios?.map((scenario, i) => (
                      <div key={i} className={cn('rounded-lg border p-4 space-y-3', i === 0 ? 'border-success/30 bg-success/5' : 'bg-muted/20')}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">{i === 0 ? '🎯' : i === 1 ? '🔄' : '⚡'} {scenario.name}</span>
                          {scenario.savings > 0 && (
                            <Badge className="bg-success/10 text-success border-success/20 text-[10px]">
                              Economia: {formatCurrency(scenario.savings)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{scenario.description}</p>

                        <div className="flex gap-3 text-xs">
                          <div className="bg-background rounded p-2 flex-1 border">
                            <p className="text-[10px] text-muted-foreground">Valor</p>
                            <p className="font-bold font-mono">{formatCurrency(scenario.proposedAmount)}</p>
                          </div>
                          <div className="bg-background rounded p-2 flex-1 border">
                            <p className="text-[10px] text-muted-foreground">Data</p>
                            <p className="font-bold">{scenario.proposedDate ? getDayMonth(scenario.proposedDate) : '—'}</p>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-medium flex items-center gap-1"><Phone className="w-3 h-3" /> Script ligação</span>
                            <Button variant="ghost" size="sm" className="h-5 px-2 text-[9px] gap-1" onClick={() => copyToClipboard(scenario.script)}>
                              <Copy className="w-3 h-3" /> Copiar
                            </Button>
                          </div>
                          <div className="bg-background rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap border">{scenario.script}</div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-medium flex items-center gap-1"><MessageSquare className="w-3 h-3" /> WhatsApp</span>
                            <Button variant="ghost" size="sm" className="h-5 px-2 text-[9px] gap-1" onClick={() => copyToClipboard(scenario.whatsappMessage)}>
                              <Copy className="w-3 h-3" /> Copiar
                            </Button>
                          </div>
                          <div className="bg-success/5 rounded-lg p-3 text-xs leading-relaxed border border-success/10">{scenario.whatsappMessage}</div>
                        </div>
                      </div>
                    ))}

                    {negotiationScript.objections?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                          <ShieldAlert className="w-3.5 h-3.5" /> Objeções e Respostas
                        </p>
                        <div className="space-y-2">
                          {negotiationScript.objections.map((obj, i) => (
                            <div key={i} className="bg-muted/30 rounded-lg p-3 space-y-1 border">
                              <p className="text-xs font-medium text-destructive">❝ {obj.objection}</p>
                              <p className="text-xs text-muted-foreground">→ {obj.response}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/20 border border-border/30">
        <Sparkles className="w-3.5 h-3.5 text-accent mt-0.5 flex-shrink-0" />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Plano gerado pela IA com base em dados financeiros em tempo real, histórico de cobranças e indicadores macro.
          Clique em "Atualizar análise" após confirmar transações para recalcular.
        </p>
      </div>

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
    </div>
  );
}
