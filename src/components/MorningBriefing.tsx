import { useState, useCallback, useMemo, useEffect } from 'react';
import { useObras } from '@/lib/obras-context';
import { useFinance } from '@/lib/finance-context';
import { formatCurrency, todayISO, addDays, getDayMonth, daysBetween } from '@/lib/helpers';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, AlertTriangle, AlertCircle, Info, RefreshCw, ChevronRight, Zap, Phone, Percent, Truck, Calendar, TrendingDown, PiggyBank, Clock, Globe, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import TransactionFormDialog from '@/components/TransactionFormDialog';
import type { TransactionType } from '@/lib/types';

interface Insight {
  severity: 'critical' | 'warning' | 'info';
  text: string;
  category?: 'cobranca' | 'desconto' | 'fornecedor' | 'cronograma' | 'caixa' | 'margem' | 'mercado';
}

interface SuggestionPrefill {
  type?: TransactionType;
  description?: string;
  counterpart?: string;
  amount?: number;
  category?: string;
  notes?: string;
  obraCode?: string;
}

interface Suggestion {
  action: string;
  detail: string;
  urgency?: 'hoje' | 'esta_semana' | 'proximo';
  link: string;
  prefill?: SuggestionPrefill;
}

interface BriefingData {
  insights: Insight[];
  suggestions: Suggestion[];
}

export default function MorningBriefing() {
  const { obras, getObraFinancials } = useObras();
  const { transactions, currentBalance, projectedBalance } = useFinance();
  const today = todayISO();

  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txFormDefaults, setTxFormDefaults] = useState<{
    type: TransactionType;
    description?: string;
    counterpart?: string;
    amount?: number;
    category?: string;
    notes?: string;
    obraId?: string;
  } | null>(null);

  const handleSuggestionAction = (sug: Suggestion) => {
    if (!sug.prefill) return;
    const p = sug.prefill;
    // Resolve obraCode to obraId
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

  const financialSummary = useMemo(() => {
    const bal = currentBalance?.amount ?? 0;
    const proj30 = projectedBalance(addDays(today, 30));
    const activeObras = obras.filter(o => o.status === 'ativa');
    const lines: string[] = [];

    lines.push(`Data: ${today}`);
    lines.push(`Saldo atual em conta: ${formatCurrency(bal)}`);
    lines.push(`Saldo projetado 30 dias: ${formatCurrency(proj30)}`);
    lines.push('');

    lines.push('=== OBRAS ATIVAS ===');
    activeObras.forEach(obra => {
      const fin = getObraFinancials(obra.id);
      lines.push(`${obra.code} (${obra.clientName}):`);
      lines.push(`  Contrato: ${formatCurrency(obra.contractValue)}`);
      lines.push(`  Recebido: ${formatCurrency(fin.totalReceived)} | Custos pagos: ${formatCurrency(fin.totalPaidCost)}`);
      lines.push(`  Saldo da obra: ${formatCurrency(fin.obraNetCashFlow)}`);
      lines.push(`  Margem bruta: ${fin.grossMarginPercentage.toFixed(0)}%`);
      if (fin.nextReceivable) {
        lines.push(`  Próx recebimento: ${formatCurrency(fin.nextReceivable.amount)} em ${getDayMonth(fin.nextReceivable.dueDate)} (${fin.nextReceivable.status})`);
      }
      if (fin.nextPayable) {
        lines.push(`  Próx pagamento: ${formatCurrency(fin.nextPayable.amount)} em ${getDayMonth(fin.nextPayable.dueDate)} — ${fin.nextPayable.counterpart || fin.nextPayable.category}`);
      }
      if (fin.totalOverdueReceivable > 0) {
        lines.push(`  ⚠ Recebíveis atrasados: ${formatCurrency(fin.totalOverdueReceivable)}`);
      }

      // Billing/collection history per obra
      const obraReceivables = transactions.filter(t => t.obraId === obra.id && t.type === 'receber');
      const withBilling = obraReceivables.filter(t => t.billingCount > 0);
      if (withBilling.length > 0) {
        lines.push(`  📧 Histórico de cobranças:`);
        withBilling.forEach(t => {
          const daysUntil = daysBetween(today, t.dueDate);
          const daysLabel = daysUntil > 0 ? `vence em ${daysUntil}d` : daysUntil === 0 ? 'vence hoje' : `${Math.abs(daysUntil)}d atrasado`;
          lines.push(`    - ${formatCurrency(t.amount)} (${t.status}, ${daysLabel}): ${t.billingCount} cobrança(s) enviada(s)${t.billingSentAt ? `, última em ${getDayMonth(t.billingSentAt)}` : ''}`);
          if (t.notes) lines.push(`      Obs: ${t.notes}`);
        });
      }

      // Upcoming receivables for discount analysis
      const upcomingReceivables = obraReceivables
        .filter(t => t.status !== 'confirmado' && t.dueDate > today)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      if (upcomingReceivables.length > 0) {
        lines.push(`  📅 Parcelas futuras (${upcomingReceivables.length}):`);
        upcomingReceivables.slice(0, 5).forEach(t => {
          const daysUntil = daysBetween(today, t.dueDate);
          lines.push(`    - ${formatCurrency(t.amount)} em ${getDayMonth(t.dueDate)} (${daysUntil}d) — ${t.status}${t.paymentMethod ? `, via ${t.paymentMethod}` : ''}`);
        });
      }
    });

    const corpPending = transactions.filter(t => !t.obraId && t.type === 'pagar' && t.status !== 'confirmado');
    if (corpPending.length > 0) {
      lines.push('');
      lines.push(`Custos corporativos pendentes: ${corpPending.length} itens, ${formatCurrency(corpPending.reduce((s, t) => s + t.amount, 0))}`);
    }

    lines.push('');
    lines.push('=== FLUXO POR SEMANA (próximas 4 semanas) ===');
    for (let w = 0; w < 4; w++) {
      const ws = addDays(today, w * 7);
      const we = addDays(today, w * 7 + 6);
      const weekPay = transactions
        .filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= ws && t.dueDate <= we)
        .reduce((s, t) => s + t.amount, 0);
      const weekRec = transactions
        .filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate >= ws && t.dueDate <= we)
        .reduce((s, t) => s + t.amount, 0);

      const activeObrasRef = obras.filter(o => o.status === 'ativa');
      const obrasThisWeek = activeObrasRef
        .map(o => ({
          code: o.code,
          total: transactions.filter(t => t.obraId === o.id && t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate >= ws && t.dueDate <= we).reduce((s, t) => s + t.amount, 0),
        }))
        .filter(o => o.total > 0);

      lines.push(`Semana ${getDayMonth(ws)}–${getDayMonth(we)}: Saídas ${formatCurrency(weekPay)}, Entradas ${formatCurrency(weekRec)} | Net: ${formatCurrency(weekRec - weekPay)}`);
      if (obrasThisWeek.length > 0) {
        lines.push(`  Obras: ${obrasThisWeek.map(o => `${o.code} (${formatCurrency(o.total)})`).join(', ')}`);
      }
    }

    const overdue = transactions.filter(t => t.status === 'atrasado');
    if (overdue.length > 0) {
      lines.push('');
      lines.push(`=== ATRASADOS: ${overdue.length} itens, total ${formatCurrency(overdue.reduce((s, t) => s + t.amount, 0))} ===`);
      overdue.slice(0, 5).forEach(t => {
        const daysLate = daysBetween(t.dueDate, today);
        const obraRef = t.obraId ? obras.find(o => o.id === t.obraId) : null;
        lines.push(`  ${t.type === 'receber' ? '📥' : '📤'} ${formatCurrency(t.amount)} — ${t.description} (${daysLate}d atraso)${t.billingCount > 0 ? ` [${t.billingCount} cobrança(s)]` : ''}${obraRef ? ` [${obraRef.code}]` : ''}`);
        if (t.notes) lines.push(`    Obs: ${t.notes}`);
      });
    }

    // Cash pressure analysis
    const totalPendingOut = transactions.filter(t => t.type === 'pagar' && t.status !== 'confirmado' && t.dueDate <= addDays(today, 14)).reduce((s, t) => s + t.amount, 0);
    const totalPendingIn = transactions.filter(t => t.type === 'receber' && t.status !== 'confirmado' && t.dueDate <= addDays(today, 14)).reduce((s, t) => s + t.amount, 0);
    lines.push('');
    lines.push(`=== PRESSÃO DE CAIXA 14 DIAS ===`);
    lines.push(`Saídas previstas: ${formatCurrency(totalPendingOut)}`);
    lines.push(`Entradas previstas: ${formatCurrency(totalPendingIn)}`);
    lines.push(`Gap: ${formatCurrency(totalPendingIn - totalPendingOut)}`);
    if (bal + totalPendingIn - totalPendingOut < 0) {
      lines.push(`⚠ CAIXA FICARÁ NEGATIVO em até 14 dias sem ação`);
    }

    return lines.join('\n');
  }, [obras, transactions, currentBalance, projectedBalance, today, getObraFinancials]);

  const fetchBriefing = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch market data in parallel (non-blocking — briefing works without it)
      let marketContext: string | null = null;
      try {
        const { data: marketData } = await supabase.functions.invoke('market-data');
        if (marketData?.marketContext) {
          marketContext = marketData.marketContext;
        }
      } catch (e) {
        console.warn('Market data unavailable:', e);
      }

      const { data: fnData, error: fnError } = await supabase.functions.invoke('morning-briefing', {
        body: { financialSummary, marketContext },
      });

      if (fnError) throw new Error(fnError.message);
      if (fnData?.error) throw new Error(fnData.error);

      setData(fnData as BriefingData);
    } catch (e) {
      console.error('Briefing error:', e);
      setError(e instanceof Error ? e.message : 'Erro ao gerar briefing');
    } finally {
      setLoading(false);
    }
  }, [financialSummary]);

  useEffect(() => {
    if (!data && !loading && !error) {
      fetchBriefing();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  const severityIcon = {
    critical: <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />,
    warning: <AlertCircle className="w-4 h-4 text-warning flex-shrink-0" />,
    info: <Info className="w-4 h-4 text-accent flex-shrink-0" />,
  };

  const severityBg = {
    critical: 'bg-destructive/5 border-destructive/15',
    warning: 'bg-warning/5 border-warning/15',
    info: 'bg-accent/5 border-accent/15',
  };

  const categoryIcon: Record<string, React.ReactNode> = {
    cobranca: <Phone className="w-4 h-4 text-warning flex-shrink-0" />,
    desconto: <Percent className="w-4 h-4 text-accent flex-shrink-0" />,
    fornecedor: <Truck className="w-4 h-4 text-muted-foreground flex-shrink-0" />,
    cronograma: <Calendar className="w-4 h-4 text-primary flex-shrink-0" />,
    caixa: <PiggyBank className="w-4 h-4 text-destructive flex-shrink-0" />,
    margem: <TrendingDown className="w-4 h-4 text-warning flex-shrink-0" />,
    mercado: <Globe className="w-4 h-4 text-primary flex-shrink-0" />,
  };

  const urgencyLabel: Record<string, { text: string; className: string }> = {
    hoje: { text: 'Hoje', className: 'bg-destructive/10 text-destructive' },
    esta_semana: { text: 'Esta semana', className: 'bg-warning/10 text-warning' },
    proximo: { text: 'Em breve', className: 'bg-muted text-muted-foreground' },
  };

  const getInsightIcon = (insight: Insight) => {
    if (insight.category && categoryIcon[insight.category]) {
      return categoryIcon[insight.category];
    }
    return severityIcon[insight.severity];
  };

  return (
    <div className="card-elevated overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="p-5 pb-4 border-b bg-gradient-to-br from-primary/[0.03] to-accent/[0.06]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.15em] mb-1">
              {dateStr}
            </p>
            <h2 className="text-xl font-bold leading-tight tracking-tight">
              {greeting} 👋
            </h2>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-accent" />
              Briefing executivo gerado por IA
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={fetchBriefing}
            disabled={loading}
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-4 h-4 rounded-full bg-muted animate-pulse mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-muted rounded animate-pulse" style={{ width: `${75 + i * 5}%` }} />
                    <div className="h-3 bg-muted rounded animate-pulse" style={{ width: `${45 + i * 10}%` }} />
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {error && !loading && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-6"
            >
              <AlertCircle className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground mb-3">{error}</p>
              <Button size="sm" variant="outline" onClick={fetchBriefing} className="text-xs h-7">
                Tentar novamente
              </Button>
            </motion.div>
          )}

          {data && !loading && (
            <motion.div
              key="data"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              {/* Insights */}
              <div className="space-y-2 mb-5">
                {data.insights.map((insight, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.3 }}
                    className={cn(
                      'flex gap-3 items-start p-3 rounded-lg border',
                      severityBg[insight.severity]
                    )}
                  >
                    {getInsightIcon(insight)}
                    <p className="text-xs leading-relaxed text-foreground">{insight.text}</p>
                  </motion.div>
                ))}
              </div>

              {/* Suggestions */}
              {data.suggestions.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Zap className="w-3.5 h-3.5 text-accent" />
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                      Decisões sugeridas
                    </h3>
                  </div>
                  <div className="space-y-1">
                    {data.suggestions.map((sug, i) => {
                      const urg = sug.urgency ? urgencyLabel[sug.urgency] : null;
                      return (
                        <Link
                          key={i}
                          to={sug.link}
                          className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-all group border border-transparent hover:border-border"
                        >
                          <div className="w-1 h-8 rounded-full bg-accent/30 group-hover:bg-accent transition-colors" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-semibold text-foreground">{sug.action}</p>
                              {urg && (
                                <span className={cn('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full', urg.className)}>
                                  {urg.text}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground line-clamp-2">{sug.detail}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
